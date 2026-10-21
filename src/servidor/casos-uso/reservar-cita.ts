import "server-only";
import { z } from "zod";
import {
  DIGITOS_CODIGO,
  DIGITOS_CODIGO_LARGO,
  generarCodigo,
  prefijoCodigo,
  type Azar,
} from "@/dominio/codigo-reserva";
import { evaluarInicio } from "@/dominio/disponibilidad";
import { normalizarCorreo, normalizarTelefono, type DatosIdentidad } from "@/dominio/identidad-cliente";
import { ErrorNegocio, exito, fallo, type Resultado } from "@/dominio/resultado";
import { estadoEfectivo } from "@/dominio/suscripcion";
import { fechaLocal, intervaloDeDias, mesLocal } from "@/dominio/tiempo";
import { enTransaccion, type Transaccion } from "@/servidor/db/cliente";
import * as agenda from "@/servidor/db/repositorios/agenda";
import * as citas from "@/servidor/db/repositorios/citas";
import * as clientes from "@/servidor/db/repositorios/clientes";
import * as negocios from "@/servidor/db/repositorios/negocios";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import * as politicas from "@/servidor/db/repositorios/politicas";
import * as recursos from "@/servidor/db/repositorios/recursos";
import { exigirCupo } from "@/servidor/planes/acceso";
import { leerAgenda } from "./agenda";
import { esId } from "./esquemas";

// Reserva pública (PUB-05, F-01; RN-09 a RN-12, RN-17, RN-18; ARCH §11 y §18.4). El
// negocio sale del slug (ARCH §6) y se comprueba su estado efectivo antes de hacer
// nada (ARCH §7.6). Este módulo tiene dos partes: las precondiciones, fuera de la
// transacción, y la transacción con el bloqueo del recurso.

/** El cuerpo de `POST /api/publico/{slug}/reservas` (ARCH §18.5), con el slug de la URL. */
export const esquemaReserva = z.object({
  slug: z.string(),
  sedeId: z.string().min(1),
  servicioId: z.string().min(1),
  /** RN-33. En el MVP siempre se omite; vacío = omitido. */
  recursoId: z
    .string()
    .nullish()
    .transform((id) => id || null),
  /** ISO 8601 UTC (ARCH §9, regla 4). */
  inicio: z.iso.datetime(),
  // Los cuatro datos de RN-17.
  nombre: z.string().trim().min(1).max(100),
  apellido: z.string().trim().min(1).max(100),
  telefono: z.string().max(40),
  correo: z.string().trim().max(254).pipe(z.email()),
  /** La versión de la política que vio el cliente (F-01). */
  politicaDatosId: z.string().min(1),
  /** La casilla obligatoria de PUB-05 (RN-17). */
  aceptaPolitica: z.literal(true),
  /** Trampa para bots: el formulario lo lleva oculto y debe llegar vacío (ARCH §15). */
  sitioWeb: z.literal("").optional(),
});

export type EntradaReserva = z.input<typeof esquemaReserva>;

export type ErrorReserva =
  | "DATOS_INVALIDOS"
  | "NO_ENCONTRADO"
  | "NEGOCIO_SUSPENDIDO"
  | "HORARIO_NO_DISPONIBLE"
  | "LIMITE_PLAN";

/** Lo que la transacción necesita, ya validado. */
export type ReservaPreparada = {
  negocio: negocios.NegocioPublico;
  sedeId: string;
  servicioId: string;
  /** El recurso de la oferta, cuyo bloqueo toma la transacción (ARCH §10.3). */
  recursoId: string;
  inicio: Date;
  /** Datos del cliente normalizados (RN-18). */
  cliente: DatosIdentidad;
  politicaDatosId: string;
};

/**
 * La parte de la reserva que va antes de la transacción (ARCH §18.4):
 *
 * 1. valida el cuerpo con Zod: los cuatro datos, un teléfono normalizable, la casilla
 *    marcada y `sitioWeb` vacío (RN-17; ARCH §15). Si algo falla devuelve
 *    `DATOS_INVALIDOS` sin tocar la base;
 * 2. resuelve el negocio por el slug y rechaza uno suspendido (RN-04);
 * 3. comprueba la oferta (servicio, sede y recurso activos) y que la política sea del
 *    negocio: si no, `NO_ENCONTRADO` (ARCH §6). También con cualquier `recursoId`, porque
 *    ningún servicio del MVP deja elegir quién atiende (Q-30);
 * 4. exige cupo de `max_appointments_per_month`: cuentan todas las citas creadas en el
 *    mes calendario local de `ahora`, también las canceladas (Q-29; RN-25).
 */
export async function prepararReserva(
  entrada: unknown,
  ahora: Date,
): Promise<Resultado<ReservaPreparada, ErrorReserva>> {
  const leida = esquemaReserva.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const datos = leida.data;
  const telefonoE164 = normalizarTelefono(datos.telefono);
  if (!telefonoE164) return fallo("DATOS_INVALIDOS");

  const negocio = await negocios.porSlug(datos.slug);
  if (!negocio) return fallo("NO_ENCONTRADO");
  if (estadoEfectivo(negocio, ahora).estado === "suspendida") return fallo("NEGOCIO_SUSPENDIDO");
  if (datos.recursoId !== null || ![datos.sedeId, datos.servicioId, datos.politicaDatosId].every(esId)) {
    return fallo("NO_ENCONTRADO");
  }

  const [oferta, politicaValida] = await Promise.all([
    agenda.oferta(negocio.id, datos.sedeId, datos.servicioId),
    politicas.esDelNegocio(negocio.id, datos.politicaDatosId),
  ]);
  if (!oferta || !politicaValida) return fallo("NO_ENCONTRADO");

  try {
    const creadasEsteMes = await citas.contarCreadas(negocio.id, mesLocal(ahora, negocio.zonaHoraria));
    await exigirCupo(negocio.id, "max_appointments_per_month", creadasEsteMes);
  } catch (error) {
    if (error instanceof ErrorNegocio && error.codigo === "LIMITE_PLAN") return fallo("LIMITE_PLAN");
    throw error;
  }

  return exito({
    negocio,
    sedeId: datos.sedeId,
    servicioId: datos.servicioId,
    recursoId: oferta.recurso.id,
    inicio: new Date(datos.inicio),
    cliente: {
      nombre: datos.nombre,
      apellido: datos.apellido,
      telefonoE164,
      correo: normalizarCorreo(datos.correo),
    },
    politicaDatosId: datos.politicaDatosId,
  });
}

/** La respuesta 201 de `POST /api/publico/{slug}/reservas` (ARCH §18.5). */
export type CitaReservada = { citaId: string; codigo: string; inicio: string; fin: string };

const MS_POR_MINUTO = 60_000;

/** Choques de código después de los cuales se usan 6 dígitos (Q-41). */
const CHOQUES_ANTES_DE_6_DIGITOS = 5;
/** Códigos de 6 dígitos que se prueban antes de rendirse: con un millón posibles, no se llega. */
const INTENTOS_CON_6_DIGITOS = 5;
/** Intentos de la transacción ante un choque por el correo o por el código (ARCH §11.4, §12). */
const INTENTOS_DE_TRANSACCION = 3;

/** El azar del código de reserva (ARCH §11.4), con el generador criptográfico del runtime. */
const azarSeguro: Azar = (maximo) => crypto.getRandomValues(new Uint32Array(1))[0] % maximo;

/**
 * Reserva una cita (ARCH §11 y §18.4): las precondiciones de `prepararReserva` y,
 * después, una transacción `READ COMMITTED` (la de `enTransaccion`, ARCH §11.3) que:
 *
 * 1. toma el recurso con `FOR UPDATE`: las reservas simultáneas de ese recurso esperan
 *    aquí (RN-11);
 * 2. DESPUÉS del bloqueo arma el contexto (`leerAgenda`, la misma función de la consulta)
 *    con lo confirmado hasta ese momento, y evalúa el inicio con actor `cliente`. Si no
 *    pasa, `HORARIO_NO_DISPONIBLE` sin escribir nada (RN-09);
 * 3. resuelve el cliente (RN-18);
 * 4. elige un código de reserva libre en el negocio (D-28; Q-41) e inserta la cita
 *    `confirmada`, con ese código, su instantánea, el consentimiento
 *    (`politica_aceptada_en = ahora`), `fin` y `ocupado_hasta`, y el evento `creada`;
 * 5. encola sus notificaciones C-01, C-02 y C-05 (ARCH §14.1).
 *
 * Si el `INSERT` choca con otra reserva creada al mismo tiempo, por el correo del cliente
 * (ARCH §12) o por el código (de otro recurso, que no espera el mismo bloqueo; ARCH §11.4),
 * reintenta la transacción: en el reintento encuentra al cliente por correo, o ve el
 * código ocupado y elige otro. `azar` es para las pruebas.
 */
export async function reservarCita(
  entrada: unknown,
  ahora: Date,
  azar: Azar = azarSeguro,
): Promise<Resultado<CitaReservada, ErrorReserva>> {
  const preparada = await prepararReserva(entrada, ahora);
  if (!preparada.ok) return preparada;
  for (let intento = 1; ; intento++) {
    try {
      return await enTransaccion((tx) => reservarEnTransaccion(preparada.valor, ahora, azar, tx));
    } catch (error) {
      if (intento >= INTENTOS_DE_TRANSACCION || !esChoqueReintentable(error)) throw error;
    }
  }
}

async function reservarEnTransaccion(
  r: ReservaPreparada,
  ahora: Date,
  azar: Azar,
  tx: Transaccion,
): Promise<Resultado<CitaReservada, ErrorReserva>> {
  // 1. Primero el bloqueo del recurso (ARCH §11.2, paso 1).
  if ((await recursos.bloquear(r.negocio.id, r.recursoId, tx)) === null) return fallo("HORARIO_NO_DISPONIBLE");

  // 2. Después, el contexto. Se leen el día local del inicio entero: una cita válida cabe
  // en una franja de ese día, así que ningún bloqueo ni cita que la afecte queda fuera.
  const dia = fechaLocal(r.inicio, r.negocio.zonaHoraria);
  const leida = await leerAgenda(
    {
      negocio: r.negocio,
      sedeId: r.sedeId,
      servicioId: r.servicioId,
      actor: "cliente",
      ahora,
      rango: intervaloDeDias(dia, dia, r.negocio.zonaHoraria),
    },
    tx,
  );
  if (!leida) return fallo("NO_ENCONTRADO"); // la oferta se desactivó después de las precondiciones
  // Otro recurso significa que la oferta cambió: el bloqueo tomado no es el que la protege.
  if (leida.oferta.recurso.id !== r.recursoId) return fallo("HORARIO_NO_DISPONIBLE");
  if (!evaluarInicio(leida.contexto, r.inicio).ok) return fallo("HORARIO_NO_DISPONIBLE");

  // 3. El cliente (ARCH §12) y 4. la cita, con su evento.
  const clienteId = await clientes.resolver(r.negocio.id, r.cliente, tx);
  const { servicio } = leida.oferta;
  const fin = new Date(r.inicio.getTime() + servicio.duracionMinutos * MS_POR_MINUTO);
  const ocupadoHasta = new Date(fin.getTime() + servicio.bufferMinutos * MS_POR_MINUTO);
  const codigo = await codigoLibre(r.negocio, azar, tx);
  const citaId = await citas.crearPublica(
    r.negocio.id,
    {
      codigo,
      sedeId: r.sedeId,
      servicioId: r.servicioId,
      recursoId: r.recursoId,
      clienteId,
      inicio: r.inicio,
      fin,
      ocupadoHasta,
      servicioNombre: servicio.nombre,
      cliente: {
        nombre: r.cliente.nombre,
        apellido: r.cliente.apellido,
        telefono: r.cliente.telefonoE164,
        correo: r.cliente.correo,
      },
      politicaDatosId: r.politicaDatosId,
      politicaAceptadaEn: ahora,
      creadaEn: ahora,
    },
    tx,
  );

  // 5. Las notificaciones, en la misma transacción (ARCH §14.1). Nadie las envía hasta la Fase 6 (Q-28).
  await encolarNotificaciones(r, citaId, leida.reglas.recordatorioHorasAntes, ahora, tx);
  return exito({ citaId, codigo, inicio: r.inicio.toISOString(), fin: fin.toISOString() });
}

/**
 * Un código de reserva que el negocio todavía no usa (Q-41). El prefijo sale del nombre
 * actual del negocio: cambiarlo después no cambia los códigos existentes (ARCH §11.4).
 * Prueba códigos de 4 dígitos y, después de 5 choques, de 6.
 */
async function codigoLibre(negocio: negocios.NegocioPublico, azar: Azar, tx: Transaccion): Promise<string> {
  const prefijo = prefijoCodigo(negocio.nombre);
  for (let choques = 0; choques < CHOQUES_ANTES_DE_6_DIGITOS + INTENTOS_CON_6_DIGITOS; choques++) {
    const digitos = choques < CHOQUES_ANTES_DE_6_DIGITOS ? DIGITOS_CODIGO : DIGITOS_CODIGO_LARGO;
    const codigo = generarCodigo(prefijo, azar, digitos);
    if (!(await citas.codigoOcupado(negocio.id, codigo, tx))) return codigo;
  }
  throw new Error(`No se encontró un código de reserva libre para el negocio ${negocio.id}.`);
}

/**
 * C-01 (`confirmacion`) y C-02 (`recordatorio`) al correo con que se reservó (S-15), y
 * C-05 (`dueno_cita_nueva`) al dueño (RN-22; Q-28), con las claves de ARCH §14.1. El
 * recordatorio es para `inicio − recordatorio_horas_antes`, y no se crea si no hay
 * recordatorio configurado o si ese momento ya pasó (S-12).
 */
async function encolarNotificaciones(
  r: ReservaPreparada,
  citaId: string,
  recordatorioHorasAntes: number | null,
  ahora: Date,
  tx: Transaccion,
): Promise<void> {
  const alCliente: notificaciones.NuevaNotificacion[] = [
    { citaId, tipo: "confirmacion", claveIdempotencia: `confirmacion:${citaId}`, programadaPara: ahora },
  ];
  if (recordatorioHorasAntes !== null) {
    const programadaPara = new Date(r.inicio.getTime() - recordatorioHorasAntes * 60 * MS_POR_MINUTO);
    if (programadaPara >= ahora) {
      // `version` 1: la de una cita nueva; reprogramar crea otro con la versión siguiente (ARCH §14.1).
      alCliente.push({ citaId, tipo: "recordatorio", claveIdempotencia: `recordatorio:${citaId}:v1`, programadaPara, datos: { version: 1 } });
    }
  }
  if (r.cliente.correo !== null) await notificaciones.encolar(r.negocio.id, r.cliente.correo, alCliente, tx);
  await notificaciones.encolarAlDueno(
    r.negocio.id,
    { citaId, tipo: "dueno_cita_nueva", claveIdempotencia: `dueno_cita_nueva:${citaId}`, programadaPara: ahora },
    tx,
  );
}

/**
 * Violación de `cliente_correo_uq` (otro cliente con ese correo se creó al mismo tiempo;
 * ARCH §12) o de `cita_negocio_id_codigo_key` (otra reserva tomó el mismo código; ARCH §11.4).
 */
function esChoqueReintentable(error: unknown): boolean {
  const causa = error instanceof Error && error.cause ? error.cause : error;
  const { code, constraint } = (causa ?? {}) as { code?: string; constraint?: string };
  return code === "23505" && (constraint === "cliente_correo_uq" || constraint === "cita_negocio_id_codigo_key");
}
