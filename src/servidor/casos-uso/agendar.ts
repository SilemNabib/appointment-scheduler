import "server-only";
import {
  DIGITOS_CODIGO,
  DIGITOS_CODIGO_LARGO,
  generarCodigo,
  prefijoCodigo,
  type Azar,
} from "@/dominio/codigo-reserva";
import { evaluarInicio, type MotivoRechazo } from "@/dominio/disponibilidad";
import type { DatosIdentidad } from "@/dominio/identidad-cliente";
import { exito, fallo, type Exito, type Fallo } from "@/dominio/resultado";
import { fechaLocal, intervaloDeDias } from "@/dominio/tiempo";
import { enTransaccion, type Transaccion } from "@/servidor/db/cliente";
import * as citas from "@/servidor/db/repositorios/citas";
import * as clientes from "@/servidor/db/repositorios/clientes";
import * as negocios from "@/servidor/db/repositorios/negocios";
import type { NuevaNotificacion } from "@/servidor/db/repositorios/notificaciones";
import * as recursos from "@/servidor/db/repositorios/recursos";
import * as sedes from "@/servidor/db/repositorios/sedes";
import { leerAgenda } from "./agenda";

// Núcleo de agendamiento (RN-09, RN-11, RN-15, D-11, D-28; ARCH §11, §11.4 y §18.4). Lo
// comparten la reserva pública (actor `cliente`), la cita manual del dueño (actor
// `dueno`) y el movimiento: toma el bloqueo del recurso, lee la agenda DESPUÉS del
// bloqueo y la evalúa con el mismo motor que lista las horas. Así lo que no se ofrece
// tampoco se puede agendar, y dos operaciones sobre el mismo recurso no se cruzan.
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
