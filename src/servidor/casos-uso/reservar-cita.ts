import "server-only";
import { z } from "zod";
import type { Azar } from "@/dominio/codigo-reserva";
import { normalizarCorreo, normalizarTelefono, type DatosIdentidad } from "@/dominio/identidad-cliente";
import { ErrorNegocio, exito, fallo, type Fallo, type Resultado } from "@/dominio/resultado";
import { estadoEfectivo } from "@/dominio/suscripcion";
import { mesLocal } from "@/dominio/tiempo";
import type { Transaccion } from "@/servidor/db/cliente";
import * as agenda from "@/servidor/db/repositorios/agenda";
import * as citas from "@/servidor/db/repositorios/citas";
import * as negocios from "@/servidor/db/repositorios/negocios";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import * as politicas from "@/servidor/db/repositorios/politicas";
import { exigirCupo } from "@/servidor/planes/acceso";
import { avisosDeCitaNueva, azarSeguro, crearCita, enTransaccionConReintentos, type CitaAgendada } from "./agendar";
import { esId } from "./esquemas";

// Reserva pública (PUB-05, F-01; RN-09 a RN-12, RN-17, RN-18; ARCH §11 y §18.4). El
// negocio sale del slug (ARCH §6) y se comprueba su estado efectivo antes de hacer
// nada (ARCH §7.6). Este módulo tiene dos partes: las precondiciones, fuera de la
// transacción, y la transacción, que es la del núcleo de agendamiento (`agendar.ts`)
// con actor `cliente`.

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

/**
 * Los campos de PUB-05 que `DATOS_INVALIDOS` puede nombrar (Q-46), en el orden del
 * formulario. La trampa `sitioWeb` no está (ARCH §15).
 */
export const CAMPOS_RESERVA = ["nombre", "apellido", "telefono", "correo", "aceptaPolitica"] as const;
export type CampoReserva = (typeof CAMPOS_RESERVA)[number];

/**
 * `DATOS_INVALIDOS` con los campos de PUB-05 que fallaron, en el orden del formulario
 * (Q-46): solo sus nombres, nunca los valores. Sin `campos` si falló otra cosa o si la
 * trampa `sitioWeb` llegó llena, para no delatarla (ARCH §15).
 */
export type DatosInvalidosReserva = Fallo<"DATOS_INVALIDOS"> & { campos?: CampoReserva[] };

/** El resultado de la reserva: `DATOS_INVALIDOS` puede traer sus `campos`. */
type ResultadoReserva<T> = Resultado<T, ErrorReserva> | DatosInvalidosReserva;

/** Los campos de PUB-05 que fallaron, de la lista de Q-46; sin repetidos y en su orden. */
function datosInvalidos(fallaron: ReadonlySet<string>): DatosInvalidosReserva {
  const campos = CAMPOS_RESERVA.filter((c) => fallaron.has(c));
  return campos.length > 0 ? { ...fallo("DATOS_INVALIDOS"), campos } : fallo("DATOS_INVALIDOS");
}

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
 *    `DATOS_INVALIDOS`, con los campos de PUB-05 que fallaron (Q-46), sin tocar la base;
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
): Promise<ResultadoReserva<ReservaPreparada>> {
  const leida = esquemaReserva.safeParse(entrada);
  if (!leida.success) {
    const fallaron = new Set(leida.error.issues.map((i) => String(i.path[0])));
    if (fallaron.has("sitioWeb")) return fallo("DATOS_INVALIDOS");
    // Un teléfono que pasó la forma pero no se puede normalizar también falló.
    const telefono = (entrada as { telefono?: unknown } | null)?.telefono;
    if (typeof telefono === "string" && !normalizarTelefono(telefono)) fallaron.add("telefono");
    return datosInvalidos(fallaron);
  }
  const datos = leida.data;
  const telefonoE164 = normalizarTelefono(datos.telefono);
  if (!telefonoE164) return datosInvalidos(new Set(["telefono"]));

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

/**
 * Reserva una cita (ARCH §11 y §18.4): las precondiciones de `prepararReserva` y,
 * después, la transacción del núcleo de agendamiento con actor `cliente` (`crearCita`):
 * el bloqueo del recurso, la agenda leída después del bloqueo y evaluada con la
 * anticipación (RN-09, RN-11), el cliente (RN-18), el código de reserva (D-28) y la
 * cita `confirmada` con el consentimiento (RN-17) y su evento `creada`. En la misma
 * transacción encola C-01, C-02 y C-05 (ARCH §14.1).
 *
 * Si la hora no pasa, `HORARIO_NO_DISPONIBLE`, sin los motivos: la API pública no los da
 * (ARCH §18.5). Ante un choque por el correo o por el código, el núcleo reintenta la
 * transacción (ARCH §11.4, §12). `azar` es para las pruebas.
 */
export async function reservarCita(
  entrada: unknown,
  ahora: Date,
  azar: Azar = azarSeguro,
): Promise<ResultadoReserva<CitaReservada>> {
  const preparada = await prepararReserva(entrada, ahora);
  if (!preparada.ok) return preparada;
  const r = preparada.valor;
  return enTransaccionConReintentos(async (tx): Promise<Resultado<CitaReservada, ErrorReserva>> => {
    const creada = await crearCita(
      {
        negocio: r.negocio,
        sedeId: r.sedeId,
        servicioId: r.servicioId,
        recursoId: r.recursoId,
        inicio: r.inicio,
        cliente: r.cliente,
        quien: { actor: "cliente", politicaDatosId: r.politicaDatosId },
      },
      ahora,
      azar,
      tx,
    );
    if (!creada.ok) return fallo(creada.error);
    // Nadie las envía hasta la Fase 6 (Q-28).
    await encolarNotificaciones(r, creada.valor, ahora, tx);
    const { citaId, codigo, fin } = creada.valor;
    return exito({ citaId, codigo, inicio: r.inicio.toISOString(), fin: fin.toISOString() });
  });
}

/**
 * C-01 (`confirmacion`) y C-02 (`recordatorio`, el de la versión 1) al correo con que se
 * reservó (S-15), y C-05 (`dueno_cita_nueva`) al dueño (RN-22; Q-28), con las claves de
 * ARCH §14.1. El recordatorio no se crea si no hay recordatorio configurado o si su
 * momento ya pasó (S-12).
 */
async function encolarNotificaciones(r: ReservaPreparada, cita: CitaAgendada, ahora: Date, tx: Transaccion): Promise<void> {
  if (r.cliente.correo !== null) {
    await notificaciones.encolar(r.negocio.id, r.cliente.correo, avisosDeCitaNueva(cita, ahora), tx);
  }
  await notificaciones.encolarAlDueno(
    r.negocio.id,
    {
      citaId: cita.citaId,
      tipo: "dueno_cita_nueva",
      claveIdempotencia: `dueno_cita_nueva:${cita.citaId}`,
      programadaPara: ahora,
    },
    tx,
  );
}
