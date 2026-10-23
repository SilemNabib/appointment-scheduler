import "server-only";
import {
  DIGITOS_CODIGO,
  DIGITOS_CODIGO_LARGO,
  generarCodigo,
  prefijoCodigo,
  type Azar,
} from "@/dominio/codigo-reserva";
import { evaluarInicio, type MotivoRechazo } from "@/dominio/disponibilidad";
import { sePuedeMover } from "@/dominio/estados-cita";
import type { DatosIdentidad } from "@/dominio/identidad-cliente";
import { exito, fallo, type Exito, type Fallo } from "@/dominio/resultado";
import { fechaLocal, intervaloDeDias } from "@/dominio/tiempo";
import { enTransaccion, type Transaccion } from "@/servidor/db/cliente";
import * as citas from "@/servidor/db/repositorios/citas";
import * as clientes from "@/servidor/db/repositorios/clientes";
import * as negocios from "@/servidor/db/repositorios/negocios";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import type { NuevaNotificacion } from "@/servidor/db/repositorios/notificaciones";
import * as recursos from "@/servidor/db/repositorios/recursos";
import * as sedes from "@/servidor/db/repositorios/sedes";
import { leerAgenda } from "./agenda";

// Núcleo de agendamiento (RN-09, RN-11, RN-15, D-11, D-28; ARCH §11, §11.4 y §18.4). Lo
// comparten la reserva pública (actor `cliente`), la cita manual del dueño (actor
// `dueno`) y el movimiento: toma el bloqueo del recurso, lee la agenda DESPUÉS del
// bloqueo y la evalúa con el mismo motor que lista las horas. Así lo que no se ofrece
// tampoco se puede agendar, y dos operaciones sobre el mismo recurso no se cruzan. El
// cambio de hora (`cambiarHora`) sirve al movimiento del dueño y, en la Fase 6, a la
// reprogramación del cliente.
// Las precondiciones (validación, negocio, oferta y cupo del plan) quedan en cada caso
// de uso, fuera de la transacción. El recordatorio de cada versión de la cita también
// se arma aquí, igual para todos (ARCH §14.1).

/** El azar del código de reserva (ARCH §11.4), con el generador criptográfico del runtime. */
export const azarSeguro: Azar = (maximo) => crypto.getRandomValues(new Uint32Array(1))[0] % maximo;

/**
 * Quién agenda (ARCH §18.4). El cliente reserva desde la página pública, con el
 * consentimiento de la política que vio (RN-17); el dueño, desde el panel, sin
 * anticipación (D-11), sin consentimiento y con su `clerk_user_id` en el evento (Q-55).
 */
export type QuienAgenda = { actor: "cliente"; politicaDatosId: string } | { actor: "dueno"; actorId: string };

export type PeticionCita = {
  /** El negocio ya resuelto: el nombre da el prefijo del código (D-28) y la zona, el día local (ARCH §9). */
  negocio: { id: string; nombre: string; zonaHoraria: string };
  sedeId: string;
  servicioId: string;
  /** El recurso de la oferta, leído en las precondiciones: su bloqueo es el que se toma (ARCH §10.3). */
  recursoId: string;
  inicio: Date;
  /** Datos del cliente normalizados (RN-18). */
  cliente: DatosIdentidad;
  quien: QuienAgenda;
};

/** La cita creada, con lo que las notificaciones necesitan. */
export type CitaAgendada = {
  citaId: string;
  codigo: string;
  inicio: Date;
  fin: Date;
  /** `recordatorio_horas_antes` del negocio, leído en la misma transacción (`null` = sin recordatorio). */
  recordatorioHorasAntes: number | null;
};

/**
 * `HORARIO_NO_DISPONIBLE` con los motivos de `evaluarInicio` (ARCH §10), para que el
 * panel explique por qué. Sin motivos si lo que cambió fue la oferta o su recurso.
 */
export type HorarioNoDisponible = Fallo<"HORARIO_NO_DISPONIBLE"> & { motivos: MotivoRechazo[] };

export type ErrorAgendar = Fallo<"NO_ENCONTRADO"> | HorarioNoDisponible;

const horarioNoDisponible = (motivos: MotivoRechazo[] = []): HorarioNoDisponible => ({
  ...fallo("HORARIO_NO_DISPONIBLE" as const),
  motivos,
});

const MS_POR_MINUTO = 60_000;
const MS_POR_HORA = 60 * MS_POR_MINUTO;

/** Choques de código después de los cuales se usan 6 dígitos (Q-41). */
const CHOQUES_ANTES_DE_6_DIGITOS = 5;
/** Códigos de 6 dígitos que se prueban antes de rendirse: con un millón posibles, no se llega. */
const INTENTOS_CON_6_DIGITOS = 5;
/** Intentos de la transacción ante un choque por el correo o por el código (ARCH §11.4, §12). */
const INTENTOS_DE_TRANSACCION = 3;

/**
 * El negocio de la sesión y su sede principal, donde el dueño agenda en el MVP (Q-20 de
 * TASKS-02): el nombre da el prefijo del código (D-28) y la zona, los días locales
 * (ARCH §9). Lanza si no existen: el contexto viene de la sesión (ARCH §6).
 */
export async function negocioDelPanel(negocioId: string): Promise<{ negocio: PeticionCita["negocio"]; sedeId: string }> {
  const [negocio, sede] = await Promise.all([negocios.resumen(negocioId), sedes.principal(negocioId)]);
  if (!negocio || !sede) throw new Error(`No existe el negocio ${negocioId} del contexto o su sede principal.`);
  return { negocio: { id: negocioId, nombre: negocio.nombre, zonaHoraria: negocio.zonaHoraria }, sedeId: sede.id };
}

/**
 * Crea una cita `confirmada` (RN-12) dentro de la transacción `READ COMMITTED` que
 * recibe (ARCH §11.2 y §11.3):
 *
 * 1. toma el recurso con `FOR UPDATE`: las escrituras de agenda simultáneas de ese
 *    recurso esperan aquí (RN-11);
 * 2. DESPUÉS del bloqueo arma el contexto (`leerAgenda`, la misma función de la consulta)
 *    con lo confirmado hasta ese momento, y evalúa el inicio con el actor de `quien`: el
 *    dueño, sin anticipación y solo desde `ahora` (D-11). Si no pasa,
 *    `HORARIO_NO_DISPONIBLE` con sus motivos, sin escribir nada (RN-09, RN-15);
 * 3. resuelve el cliente (RN-18; ARCH §12);
 * 4. elige un código de reserva libre en el negocio (D-28; Q-41) e inserta la cita, con
 *    su instantánea, `fin` y `ocupado_hasta`, el origen y, en la reserva pública, el
 *    consentimiento con `politica_aceptada_en = ahora` (RN-17); y el evento `creada` de
 *    quien la agendó.
 *
 * Las notificaciones las encola quien llama, en la misma transacción (ARCH §14.1).
 */
export async function crearCita(
  p: PeticionCita,
  ahora: Date,
  azar: Azar,
  tx: Transaccion,
): Promise<Exito<CitaAgendada> | ErrorAgendar> {
  // 1. Primero el bloqueo del recurso (ARCH §11.2, paso 1).
  if ((await recursos.bloquear(p.negocio.id, p.recursoId, tx)) === null) return horarioNoDisponible();

  // 2. Después, el contexto. Se lee el día local del inicio entero: una cita válida cabe
  // en una franja de ese día, así que ningún bloqueo ni cita que la afecte queda fuera.
  const dia = fechaLocal(p.inicio, p.negocio.zonaHoraria);
  const leida = await leerAgenda(
    {
      negocio: p.negocio,
      sedeId: p.sedeId,
      servicioId: p.servicioId,
      actor: p.quien.actor,
      ahora,
      rango: intervaloDeDias(dia, dia, p.negocio.zonaHoraria),
    },
    tx,
  );
  if (!leida) return fallo("NO_ENCONTRADO"); // la oferta se desactivó después de las precondiciones
  // Otro recurso significa que la oferta cambió: el bloqueo tomado no es el que la protege.
  if (leida.oferta.recurso.id !== p.recursoId) return horarioNoDisponible();
  const evaluado = evaluarInicio(leida.contexto, p.inicio);
  if (!evaluado.ok) return horarioNoDisponible(evaluado.motivos);

  // 3. El cliente (ARCH §12) y 4. la cita, con su evento.
  const clienteId = await clientes.resolver(p.negocio.id, p.cliente, tx);
  const { servicio } = leida.oferta;
  const fin = new Date(p.inicio.getTime() + servicio.duracionMinutos * MS_POR_MINUTO);
  const ocupadoHasta = new Date(fin.getTime() + servicio.bufferMinutos * MS_POR_MINUTO);
  const codigo = await codigoLibre(p.negocio, azar, tx);
  const base = {
    codigo,
    sedeId: p.sedeId,
    servicioId: p.servicioId,
    recursoId: p.recursoId,
    clienteId,
    inicio: p.inicio,
    fin,
    ocupadoHasta,
    servicioNombre: servicio.nombre,
    cliente: {
      nombre: p.cliente.nombre,
      apellido: p.cliente.apellido,
      telefono: p.cliente.telefonoE164,
      correo: p.cliente.correo,
    },
    creadaEn: ahora,
  };
  const citaId = await citas.crear(
    p.negocio.id,
    p.quien.actor === "cliente"
      ? {
          ...base,
          origen: "publico",
          consentimiento: { politicaDatosId: p.quien.politicaDatosId, politicaAceptadaEn: ahora },
          creadaPor: { actor: "cliente" },
        }
      : { ...base, origen: "panel", creadaPor: { actor: "dueno", actorId: p.quien.actorId } },
    tx,
  );

  return exito({ citaId, codigo, inicio: p.inicio, fin, recordatorioHorasAntes: leida.reglas.recordatorioHorasAntes });
}

export type PeticionCambioHora<E extends string = never> = {
  negocio: { id: string; zonaHoraria: string };
  citaId: string;
  inicio: Date;
  /**
   * La versión que vio quien la mueve (control optimista; Q-55). El cliente no la envía
   * (`null`; Q-69): vale la de la cita releída después del bloqueo.
   */
  version: number | null;
  /** El dueño la mueve sin anticipación (D-11); el cliente, desde su link, con ella (RN-14). */
  quien: { actor: "cliente" } | { actor: "dueno"; actorId: string };
  /**
   * Las reglas de quien la mueve, con la cita releída después del bloqueo: el plazo y el
   * límite de reprogramaciones del cliente (RN-13, RN-34; ARCH §18.3). Un `Fallo` la rechaza.
   */
  validar?: (cita: citas.CitaParaCambio) => Fallo<E> | null;
};

/** La cita con su hora nueva, con lo que sus avisos necesitan. */
export type HoraCambiada = {
  citaId: string;
  /** La versión nueva: la de la clave de C-04 y del recordatorio (ARCH §14.1). */
  version: number;
  inicioAnterior: Date;
  inicio: Date;
  fin: Date;
  /** El correo con que se reservó (S-15); `null` sin correo (S-05). */
  clienteCorreo: string | null;
  /** El evento `reprogramada`, cuyo id lleva la clave de C-06 (ARCH §14.1; Q-68). */
  eventoId: string;
};

export type ErrorCambioHora<E extends string = never> =
  | Fallo<"NO_ENCONTRADO" | "ESTADO_INVALIDO" | "CONFLICTO_VERSION" | "DATOS_INVALIDOS" | E>
  | HorarioNoDisponible;

/**
 * Cambia la hora de una cita, en la transacción que recibe (ARCH §11.2, §14.1 y §18.4):
 *
 * 1. toma el bloqueo del recurso de la cita y la vuelve a leer DESPUÉS del bloqueo, así
 *    ve lo que otra operación sobre ese recurso acaba de confirmar. Un recurso inactivo
 *    no se puede bloquear: `HORARIO_NO_DISPONIBLE`;
 * 2. comprueba que esté `confirmada` (`ESTADO_INVALIDO`; Q-55) y en la `version` esperada
 *    (`CONFLICTO_VERSION`), si quien la mueve la envió, y aplica `validar` a la cita
 *    releída. La hora que ya tiene no es un cambio: `DATOS_INVALIDOS`;
 * 3. evalúa la nueva hora con el actor de `quien`, con el mismo servicio (S-07) y sin
 *    contar la propia cita (RN-14). Si no pasa, `HORARIO_NO_DISPONIBLE` con sus motivos;
 *    sin motivos si el servicio ya no se ofrece (RN-05);
 * 4. actualiza la misma fila con `version + 1`; solo el cliente suma una reprogramación
 *    (RN-34, D-20). Si entretanto se canceló, `ESTADO_INVALIDO`;
 * 5. anula el recordatorio pendiente y, si la cita tiene correo, crea el de la versión
 *    nueva (S-12), y registra el evento `reprogramada` con la hora anterior y la nueva.
 *
 * Los avisos del cambio (C-04, y C-06 cuando es el cliente) los encola quien llama.
 */
export async function cambiarHora<E extends string = never>(
  p: PeticionCambioHora<E>,
  ahora: Date,
  tx: Transaccion,
): Promise<Exito<HoraCambiada> | ErrorCambioHora<E>> {
  // 1 y 2. El recurso de la cita no cambia al moverla: se lee sin bloqueo, se bloquea y se
  // relee. Un estado que no se mueve o una versión distinta ya son definitivos en la
  // primera lectura: una cita no vuelve a `confirmada` (S-08) y la versión solo sube.
  const vista = citaMovible(await citas.paraCambio(p.negocio.id, p.citaId, tx), p.version);
  if (!vista.ok) return vista;
  if ((await recursos.bloquear(p.negocio.id, vista.valor.recursoId, tx)) === null) return horarioNoDisponible();
  const releida = citaMovible(await citas.paraCambio(p.negocio.id, p.citaId, tx), p.version);
  if (!releida.ok) return releida;
  const cita = releida.valor;
  const rechazo = p.validar?.(cita);
  if (rechazo) return rechazo;
  if (cita.inicio.getTime() === p.inicio.getTime()) return fallo("DATOS_INVALIDOS");

  // 3. La nueva hora, con el mismo servicio y sin la propia cita.
  const dia = fechaLocal(p.inicio, p.negocio.zonaHoraria);
  const leida = await leerAgenda(
    {
      negocio: p.negocio,
      sedeId: cita.sedeId,
      servicioId: cita.servicioId,
      actor: p.quien.actor,
      ahora,
      rango: intervaloDeDias(dia, dia, p.negocio.zonaHoraria),
      citaExcluida: cita.id,
    },
    tx,
  );
  if (!leida || leida.oferta.recurso.id !== cita.recursoId) return horarioNoDisponible();
  const evaluado = evaluarInicio(leida.contexto, p.inicio);
  if (!evaluado.ok) return horarioNoDisponible(evaluado.motivos);

  // 4. La misma fila, con la versión siguiente.
  const { servicio } = leida.oferta;
  const fin = new Date(p.inicio.getTime() + servicio.duracionMinutos * MS_POR_MINUTO);
  const version = await citas.cambiarHora(
    p.negocio.id,
    {
      citaId: cita.id,
      versionEsperada: p.version ?? cita.version,
      inicio: p.inicio,
      fin,
      ocupadoHasta: new Date(fin.getTime() + servicio.bufferMinutos * MS_POR_MINUTO),
      sumaReprogramacionCliente: p.quien.actor === "cliente",
    },
    tx,
  );
  if (version === null) return fallo("ESTADO_INVALIDO"); // se canceló después de leerla (cancelar no toma el bloqueo)

  // 5. El recordatorio de la versión nueva y el evento.
  await notificaciones.anularRecordatorios(p.negocio.id, cita.id, tx);
  const c02 = recordatorio({ citaId: cita.id, inicio: p.inicio, version }, leida.reglas.recordatorioHorasAntes, ahora);
  if (c02 && cita.clienteCorreo !== null) await notificaciones.encolar(p.negocio.id, cita.clienteCorreo, [c02], tx);
  const eventoId = await citas.registrarEvento(
    p.negocio.id,
    cita.id,
    {
      tipo: "reprogramada",
      actor: p.quien,
      datos: { inicio_anterior: cita.inicio.toISOString(), inicio_nuevo: p.inicio.toISOString() },
    },
    tx,
  );

  return exito({
    citaId: cita.id,
    version,
    inicioAnterior: cita.inicio,
    inicio: p.inicio,
    fin,
    clienteCorreo: cita.clienteCorreo,
    eventoId,
  });
}

/** La cita, si existe, está `confirmada` (Q-55) y sigue en la versión esperada, si la hay. */
function citaMovible(
  cita: citas.CitaParaCambio | null,
  version: number | null,
): Exito<citas.CitaParaCambio> | Fallo<"NO_ENCONTRADO" | "ESTADO_INVALIDO" | "CONFLICTO_VERSION"> {
  if (!cita) return fallo("NO_ENCONTRADO");
  if (!sePuedeMover(cita.estado)) return fallo("ESTADO_INVALIDO");
  if (version !== null && cita.version !== version) return fallo("CONFLICTO_VERSION");
  return exito(cita);
}

/**
 * El recordatorio (C-02) de una versión de la cita: para `inicio − recordatorio_horas_antes`,
 * con la clave `recordatorio:{citaId}:v{version}` y `{ version }` en `datos` (ARCH §14.1).
 * Una cita nueva es la versión 1; moverla o reprogramarla crea el de la siguiente. `null`
 * si el negocio no tiene recordatorio o si ese momento ya pasó (S-12).
 */
export function recordatorio(
  cita: { citaId: string; inicio: Date; version: number },
  recordatorioHorasAntes: number | null,
  ahora: Date,
): NuevaNotificacion | null {
  if (recordatorioHorasAntes === null) return null;
  const programadaPara = new Date(cita.inicio.getTime() - recordatorioHorasAntes * MS_POR_HORA);
  if (programadaPara < ahora) return null;
  return {
    citaId: cita.citaId,
    tipo: "recordatorio",
    claveIdempotencia: `recordatorio:${cita.citaId}:v${cita.version}`,
    programadaPara,
    datos: { version: cita.version },
  };
}

/**
 * Los avisos al cliente de una cita nueva, con las claves de ARCH §14.1: C-01
 * (`confirmacion`) y el C-02 de la versión 1, si corresponde (S-12). Van al correo con
 * que se reservó (S-15); sin correo, quien llama no encola nada (S-05).
 */
export function avisosDeCitaNueva(cita: CitaAgendada, ahora: Date): NuevaNotificacion[] {
  const c01: NuevaNotificacion = {
    citaId: cita.citaId,
    tipo: "confirmacion",
    claveIdempotencia: `confirmacion:${cita.citaId}`,
    programadaPara: ahora,
  };
  const c02 = recordatorio({ ...cita, version: 1 }, cita.recordatorioHorasAntes, ahora);
  return c02 ? [c01, c02] : [c01];
}

/**
 * Un código de reserva que el negocio todavía no usa (Q-41). El prefijo sale del nombre
 * actual del negocio: cambiarlo después no cambia los códigos existentes (ARCH §11.4).
 * Prueba códigos de 4 dígitos y, después de 5 choques, de 6.
 */
async function codigoLibre(negocio: PeticionCita["negocio"], azar: Azar, tx: Transaccion): Promise<string> {
  const prefijo = prefijoCodigo(negocio.nombre);
  for (let choques = 0; choques < CHOQUES_ANTES_DE_6_DIGITOS + INTENTOS_CON_6_DIGITOS; choques++) {
    const digitos = choques < CHOQUES_ANTES_DE_6_DIGITOS ? DIGITOS_CODIGO : DIGITOS_CODIGO_LARGO;
    const codigo = generarCodigo(prefijo, azar, digitos);
    if (!(await citas.codigoOcupado(negocio.id, codigo, tx))) return codigo;
  }
  throw new Error(`No se encontró un código de reserva libre para el negocio ${negocio.id}.`);
}

/**
 * Corre `fn` en una transacción `READ COMMITTED` (la de `enTransaccion`, ARCH §11.3) y
 * la reintenta si choca con otra creada al mismo tiempo, por el correo del cliente
 * (ARCH §12) o por el código de reserva (de otro recurso, que no espera el mismo
 * bloqueo; ARCH §11.4): en el reintento encuentra al cliente por correo, o ve el código
 * ocupado y elige otro.
 */
export async function enTransaccionConReintentos<T>(fn: (tx: Transaccion) => Promise<T>): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await enTransaccion(fn);
    } catch (error) {
      if (intento >= INTENTOS_DE_TRANSACCION || !esChoqueReintentable(error)) throw error;
    }
  }
}

/**
 * Violación de `cliente_correo_uq` (otro cliente con ese correo se creó al mismo tiempo;
 * ARCH §12) o de `cita_negocio_id_codigo_key` (otra cita tomó el mismo código; ARCH §11.4).
 */
function esChoqueReintentable(error: unknown): boolean {
  const causa = error instanceof Error && error.cause ? error.cause : error;
  const { code, constraint } = (causa ?? {}) as { code?: string; constraint?: string };
  return code === "23505" && (constraint === "cliente_correo_uq" || constraint === "cita_negocio_id_codigo_key");
}
