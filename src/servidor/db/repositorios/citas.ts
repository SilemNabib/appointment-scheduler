import "server-only";
import { and, asc, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Intervalo } from "@/dominio/disponibilidad";
import {
  ESTADOS_CITA,
  sePuedeCancelar,
  type EstadoAsistencia,
  type EstadoCita,
  type TipoEvento,
} from "@/dominio/estados-cita";
import { db, type Conexion, type Transaccion } from "../cliente";
import { cita, eventoCita } from "../esquema";

// Citas (RN-10, RN-12, RN-17; ARCH §11 y §18.2). Toda función recibe `negocioId` y lo
// usa en el WHERE (ARCH §6, defensa 1). Las citas no se borran: cambian de estado.

/**
 * Citas creadas en el período (el mes calendario local, ARCH §9 regla 5), para el cupo
 * de `max_appointments_per_month` (ARCH §16.3). Cuentan todas, también las canceladas,
 * para que crear y cancelar no sirva para esquivar el límite (Q-29).
 */
export async function contarCreadas(negocioId: string, periodo: Intervalo, conexion: Conexion = db()): Promise<number> {
  const [{ total }] = await conexion
    .select({ total: count() })
    .from(cita)
    .where(and(eq(cita.negocioId, negocioId), gte(cita.creadoEn, periodo.inicio), lt(cita.creadoEn, periodo.fin)));
  return total;
}

/**
 * Si el negocio ya tiene una cita con ese código de reserva (D-28). La reserva lo
 * comprueba dentro de su transacción antes del `INSERT`; si otra reserva lo toma en ese
 * momento, el `UNIQUE (negocio_id, codigo)` lo detiene (ARCH §11.4).
 */
export async function codigoOcupado(negocioId: string, codigo: string, tx: Transaccion): Promise<boolean> {
  const [fila] = await tx
    .select({ id: cita.id })
    .from(cita)
    .where(and(eq(cita.negocioId, negocioId), eq(cita.codigo, codigo)))
    .limit(1);
  return fila !== undefined;
}

/** Consentimiento de la reserva pública (RN-17): la versión de la política que vio el cliente y cuándo la aceptó. */
export type Consentimiento = { politicaDatosId: string; politicaAceptadaEn: Date };

/** Quién deja el evento `creada`: el cliente, o el dueño con su `clerk_user_id` (Q-55). */
export type ActorEvento = { actor: "cliente" } | { actor: "dueno"; actorId: string };

export type NuevaCita = {
  /** Código de reserva (D-28; ARCH §11.4). */
  codigo: string;
  sedeId: string;
  servicioId: string;
  recursoId: string;
  clienteId: string;
  inicio: Date;
  /** `inicio` + duración. */
  fin: Date;
  /** `fin` + buffer (RN-10). */
  ocupadoHasta: Date;
  /** Instantánea del servicio y del cliente con que se reservó (RN-18.3, ADR-13). */
  servicioNombre: string;
  cliente: { nombre: string; apellido: string; telefono: string | null; correo: string | null };
  /** Instante de creación: el `ahora` del caso de uso, que cuenta para el mes del límite (Q-29). */
  creadaEn: Date;
  creadaPor: ActorEvento;
} & (
  | { origen: "publico"; consentimiento: Consentimiento }
  // El `CHECK` de `cita` solo exime del consentimiento a las del panel (RN-17).
  | { origen: "panel"; consentimiento?: never }
);

/**
 * Inserta una cita `confirmada` (RN-12) y su evento `creada`, sin datos personales
 * (ARCH §18.2), dentro de la transacción del núcleo de agendamiento. La cita pública
 * lleva el consentimiento; la del panel, no (RN-17). Devuelve el id de la cita.
 */
export async function crear(negocioId: string, datos: NuevaCita, tx: Transaccion): Promise<string> {
  const [{ id }] = await tx
    .insert(cita)
    .values({
      negocioId,
      codigo: datos.codigo,
      sedeId: datos.sedeId,
      servicioId: datos.servicioId,
      recursoId: datos.recursoId,
      recursoElegido: false, // el cliente no elige quién atiende en el MVP (Q-30)
      clienteId: datos.clienteId,
      inicio: datos.inicio,
      fin: datos.fin,
      ocupadoHasta: datos.ocupadoHasta,
      estado: "confirmada",
      origen: datos.origen,
      servicioNombre: datos.servicioNombre,
      clienteNombre: datos.cliente.nombre,
      clienteApellido: datos.cliente.apellido,
      clienteTelefono: datos.cliente.telefono,
      clienteCorreo: datos.cliente.correo,
      politicaDatosId: datos.consentimiento?.politicaDatosId ?? null,
      politicaAceptadaEn: datos.consentimiento?.politicaAceptadaEn ?? null,
      creadoEn: datos.creadaEn,
    })
    .returning({ id: cita.id });
  await registrarEvento(negocioId, id, { tipo: "creada", actor: datos.creadaPor }, tx);
  return id;
}

/** Lo que un cambio de la cita necesita saber de ella, leído en su transacción. */
export type CitaParaCambio = {
  id: string;
  sedeId: string;
  servicioId: string;
  recursoId: string;
  estado: EstadoCita;
  version: number;
  inicio: Date;
  /** El correo con que se reservó, al que van sus avisos (S-15); `null` sin correo (S-05). */
  clienteCorreo: string | null;
};

/**
 * La cita del negocio para cambiarla, o `null` si no existe o es de otro negocio (ARCH
 * §6). Sin bloqueo de fila: quien la mueve la vuelve a leer después de tomar el bloqueo
 * de su recurso (ARCH §11.2), y los cambios de estado se protegen con
 * `UPDATE … WHERE estado = <esperado>` (ARCH §18.4).
 */
export async function paraCambio(negocioId: string, citaId: string, tx: Transaccion): Promise<CitaParaCambio | null> {
  const [fila] = await tx
    .select({
      id: cita.id,
      sedeId: cita.sedeId,
      servicioId: cita.servicioId,
      recursoId: cita.recursoId,
      estado: cita.estado,
      version: cita.version,
      inicio: cita.inicio,
      clienteCorreo: cita.clienteCorreo,
    })
    .from(cita)
    .where(and(eq(cita.negocioId, negocioId), eq(cita.id, citaId)));
  return fila ?? null;
}

/**
 * Cambia la hora de la MISMA fila (RN-14): `inicio`, `fin` y `ocupado_hasta` nuevos y
 * `version + 1` (ARCH §18.4). Solo si sigue `confirmada` y en la versión esperada: si
 * otra operación la cambió, no afecta ninguna fila y devuelve `null`. La reprogramación
 * del cliente suma 1 a `reprogramaciones_cliente` (RN-34); la del dueño no lo toca
 * (D-20). Devuelve la versión nueva.
 */
export async function cambiarHora(
  negocioId: string,
  cambio: {
    citaId: string;
    versionEsperada: number;
    inicio: Date;
    fin: Date;
    ocupadoHasta: Date;
    sumaReprogramacionCliente: boolean;
  },
  tx: Transaccion,
): Promise<number | null> {
  const [fila] = await tx
    .update(cita)
    .set({
      inicio: cambio.inicio,
      fin: cambio.fin,
      ocupadoHasta: cambio.ocupadoHasta,
      version: sql`${cita.version} + 1`,
      ...(cambio.sumaReprogramacionCliente
        ? { reprogramacionesCliente: sql`${cita.reprogramacionesCliente} + 1` }
        : {}),
    })
    .where(
      and(
        eq(cita.negocioId, negocioId),
        eq(cita.id, cambio.citaId),
        eq(cita.estado, "confirmada"),
        eq(cita.version, cambio.versionEsperada),
      ),
    )
    .returning({ version: cita.version });
  return fila?.version ?? null;
}

/** Los estados desde los que se cancela, según la máquina de estados (PRD §7): solo `confirmada`. */
const CANCELABLES = ESTADOS_CITA.filter(sePuedeCancelar);

/**
 * Cancela la cita si está en un estado cancelable (`UPDATE … WHERE estado = 'confirmada'`;
 * ARCH §18.4), con `cancelada_en` y `cancelada_por` (el `CHECK` de `cita` los exige
 * juntos). Desde ese momento no ocupa (RN-10). Si no estaba `confirmada` o no es del
 * negocio, no afecta ninguna fila y devuelve `null`; si no, el correo de la cita, al
 * que va C-03 (S-15).
 */
export async function cancelar(
  negocioId: string,
  citaId: string,
  cancelacion: { canceladaEn: Date; canceladaPor: ActorEvento["actor"] },
  tx: Transaccion,
): Promise<{ clienteCorreo: string | null } | null> {
  const [fila] = await tx
    .update(cita)
    .set({ estado: "cancelada", canceladaEn: cancelacion.canceladaEn, canceladaPor: cancelacion.canceladaPor })
    .where(and(eq(cita.negocioId, negocioId), eq(cita.id, citaId), inArray(cita.estado, CANCELABLES)))
    .returning({ clienteCorreo: cita.clienteCorreo });
  return fila ?? null;
}

/**
 * Pasa la cita de `de` a un estado de la asistencia solo si sigue en `de` (`UPDATE …
 * WHERE estado = de`; ARCH §18.4): si otra operación la cambió, no afecta ninguna fila.
 * Quien llama ya comprobó con `estados-cita.ts` que la transición es válida. Devuelve si
 * la cambió.
 */
export async function cambiarEstado(
  negocioId: string,
  citaId: string,
  cambio: { de: EstadoCita; a: EstadoAsistencia },
  tx: Transaccion,
): Promise<boolean> {
  const filas = await tx
    .update(cita)
    .set({ estado: cambio.a })
    .where(and(eq(cita.negocioId, negocioId), eq(cita.id, citaId), eq(cita.estado, cambio.de)))
    .returning({ id: cita.id });
  return filas.length > 0;
}

/** Un evento del historial de la cita (ARCH §18.2), con los `datos` de Q-55 y nunca datos personales. */
export type NuevoEvento = {
  tipo: TipoEvento;
  actor: ActorEvento | { actor: "sistema" };
  datos?: Record<string, unknown>;
};

/** Registra un evento de la cita en la transacción del cambio. */
export async function registrarEvento(
  negocioId: string,
  citaId: string,
  evento: NuevoEvento,
  tx: Transaccion,
): Promise<void> {
  await tx.insert(eventoCita).values({
    negocioId,
    citaId,
    tipo: evento.tipo,
    actor: evento.actor.actor,
    actorId: evento.actor.actor === "dueno" ? evento.actor.actorId : null,
    datos: evento.datos ?? {},
  });
}

/** Una cita en la agenda del panel (PAN-02): su instantánea, nunca los datos actuales del cliente (RN-18.3). */
export type CitaDeAgenda = {
  id: string;
  codigo: string;
  inicio: Date;
  fin: Date;
  /** `fin` + buffer: lo que ocupa del recurso (RN-10), para los espacios libres. */
  ocupadoHasta: Date;
  servicio: string;
  cliente: string;
  estado: EstadoCita;
};

/**
 * Las citas del negocio que empiezan en el rango `[inicio, fin)`, también las canceladas
 * (Q-58), por inicio. El rango son días locales completos convertidos a UTC (ARCH §9,
 * regla 2), así que una cita a las 7:00 p. m. del 14 de octubre en Bogotá cae en el 14.
 */
export async function delRango(negocioId: string, rango: Intervalo, conexion: Conexion = db()): Promise<CitaDeAgenda[]> {
  const filas = await conexion
    .select({
      id: cita.id,
      codigo: cita.codigo,
      inicio: cita.inicio,
      fin: cita.fin,
      ocupadoHasta: cita.ocupadoHasta,
      servicio: cita.servicioNombre,
      nombre: cita.clienteNombre,
      apellido: cita.clienteApellido,
      estado: cita.estado,
    })
    .from(cita)
    .where(and(eq(cita.negocioId, negocioId), gte(cita.inicio, rango.inicio), lt(cita.inicio, rango.fin)))
    .orderBy(asc(cita.inicio), asc(cita.id));
  return filas.map(({ nombre, apellido, ...resto }) => ({ ...resto, cliente: `${nombre} ${apellido}`.trim() }));
}
