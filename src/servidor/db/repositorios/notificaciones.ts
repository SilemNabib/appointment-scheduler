import "server-only";
import { and, asc, count, desc, eq, gte, inArray, lt, lte, notInArray, or, sql } from "drizzle-orm";
import type { Intervalo } from "@/dominio/disponibilidad";
import type { TipoNotificacion } from "@/dominio/envios";
import { db, type Conexion, type Transaccion } from "../cliente";
import { cita, miembroNegocio, negocio, notificacion, politicaDatos, sede } from "../esquema";

// Bandeja de salida (outbox) de las notificaciones (RN-20 a RN-22; ARCH §14.1). Las filas
// se insertan en la misma transacción que el cambio de la cita: si la transacción falla,
// no hay correo. La clave de idempotencia es única, así que un mismo mensaje no se crea
// dos veces. El envío llega en la Fase 6 (Q-28, Q-60). Toda función recibe `negocioId` y
// lo usa en el WHERE o en la fila (ARCH §6, defensa 1).

/** Los tipos de correo de una cita del MVP: C-01 a C-06. */
export type TipoDeCita = "confirmacion" | "recordatorio" | "cancelacion" | "reprogramacion" | "dueno_cita_nueva" | "dueno_cambio";

export type NuevaNotificacion = {
  citaId: string;
  tipo: TipoDeCita;
  /** Clave de ARCH §14.1, por ejemplo `confirmacion:{citaId}`. */
  claveIdempotencia: string;
  programadaPara: Date;
  /**
   * Por ejemplo, `{ version: 1 }` del recordatorio o `{ version, inicio_anterior }` de la
   * reprogramación (ARCH §14.1; Q-60). Nunca datos personales.
   */
  datos?: Record<string, unknown>;
};

/** Encola notificaciones al correo indicado (el de la cita, S-15). */
export async function encolar(
  negocioId: string,
  destinatario: string,
  notificaciones: NuevaNotificacion[],
  tx: Transaccion,
): Promise<void> {
  if (notificaciones.length === 0) return;
  await tx.insert(notificacion).values(
    notificaciones.map((n) => ({ negocioId, destinatario, ...n, datos: n.datos ?? {} })),
  );
}

/**
 * Encola una notificación al dueño del negocio: el correo del miembro con rol `dueno`
 * (Q-28), en la misma sentencia. Con la clave de ARCH §14.1 hay un aviso por cita: si
 * algún día hay varios dueños (`multi_user`), va al más antiguo. Sin dueño, no encola nada.
 */
export async function encolarAlDueno(negocioId: string, n: NuevaNotificacion, tx: Transaccion): Promise<void> {
  const dueno = tx
    .select({ correo: miembroNegocio.correo })
    .from(miembroNegocio)
    .where(and(eq(miembroNegocio.negocioId, negocioId), eq(miembroNegocio.rol, "dueno")))
    .orderBy(asc(miembroNegocio.creadoEn), asc(miembroNegocio.id))
    .limit(1);
  await tx.execute(sql`
    INSERT INTO ${notificacion} (negocio_id, cita_id, tipo, destinatario, datos, clave_idempotencia, programada_para)
    SELECT ${negocioId}::uuid, ${n.citaId}::uuid, ${n.tipo}::tipo_notificacion, d.correo,
           ${JSON.stringify(n.datos ?? {})}::jsonb, ${n.claveIdempotencia}, ${n.programadaPara.toISOString()}::timestamptz
      FROM (${dueno}) d`);
}

/**
 * Anula los recordatorios `pendiente` de la cita (`estado = 'cancelada'`), al cancelarla
 * o moverla (ARCH §14.1). Los que ya salieron o están saliendo, los de otras citas y los
 * de otros negocios no cambian. Devuelve cuántos anuló.
 */
export async function anularRecordatorios(negocioId: string, citaId: string, tx: Transaccion): Promise<number> {
  const anulados = await tx
    .update(notificacion)
    .set({ estado: "cancelada" })
    .where(
      and(
        eq(notificacion.negocioId, negocioId),
        eq(notificacion.citaId, citaId),
        eq(notificacion.tipo, "recordatorio"),
        eq(notificacion.estado, "pendiente"),
      ),
    )
    .returning({ id: notificacion.id });
  return anulados.length;
}

// ─── Procesador de la bandeja de salida (ARCH §14.2 y §14.3; Q-75) ─────────────
// El procesador es del sistema: reclama de todos los negocios, y cada notificación lleva
// su `negocio_id`, que las marcas vuelven a usar en el WHERE (ARCH §6). Reciben `ahora`
// en lugar de `now()`, para el reloj inyectado de ARCH §20 (Q-75).

/** Cuántas reclama cada lote (ARCH §14.3). */
export const TAMANO_LOTE = 25;
/** Cuánto dura el arriendo de una notificación reclamada: después, otro procesador la retoma (ARCH §14.2). */
export const ARRIENDO_MS = 2 * 60 * 1000;
/** En el 5.º intento fallido, la notificación queda `fallida` (ARCH §14.3, paso 5). */
export const MAXIMO_INTENTOS = 5;

export type NotificacionReclamada = {
  id: string;
  negocioId: string;
  /** `null` en los correos de la cuenta (C-07 y C-08; S-16). */
  citaId: string | null;
  tipo: TipoNotificacion;
  destinatario: string;
  datos: unknown;
  claveIdempotencia: string;
  /** Ya contado el de este reclamo. */
  intentos: number;
  programadaPara: Date;
  /** No cambia entre reintentos: fija el `DTSTAMP` de la invitación, para que el cuerpo sea el mismo (T6.14). */
  creadoEn: Date;
};

/** La notificación que se marca: su id y su negocio (ARCH §6). */
type Reclamada = Pick<NotificacionReclamada, "id" | "negocioId">;

/**
 * Reclama un lote de hasta 25: las `pendiente` cuya hora llegó y las `enviando` con el
 * arriendo vencido, de la más atrasada a la más reciente (ARCH §14.3). Las pasa a
 * `enviando`, suma un intento y les da un arriendo de 2 minutos. `FOR UPDATE SKIP LOCKED`
 * hace que dos procesadores en paralelo (el cron y el envío inmediato) nunca reclamen la
 * misma fila (RN-20). Con `citaId`, solo las de esa cita (el envío inmediato, ARCH §14.4).
 */
export async function reclamar(
  ahora: Date,
  { citaId }: { citaId?: string } = {},
  conexion: Conexion = db(),
): Promise<NotificacionReclamada[]> {
  const vencidas = or(
    and(eq(notificacion.estado, "pendiente"), lte(notificacion.programadaPara, ahora)),
    and(eq(notificacion.estado, "enviando"), lt(notificacion.bloqueadaHasta, ahora)),
  );
  const lote = conexion
    .select({ id: notificacion.id })
    .from(notificacion)
    .where(citaId ? and(vencidas, eq(notificacion.citaId, citaId)) : vencidas)
    .orderBy(asc(notificacion.programadaPara))
    .limit(TAMANO_LOTE)
    .for("update", { skipLocked: true });
  return conexion
    .update(notificacion)
    .set({
      estado: "enviando",
      intentos: sql`${notificacion.intentos} + 1`,
      bloqueadaHasta: new Date(ahora.getTime() + ARRIENDO_MS),
    })
    .where(inArray(notificacion.id, lote))
    .returning({
      id: notificacion.id,
      negocioId: notificacion.negocioId,
      citaId: notificacion.citaId,
      tipo: notificacion.tipo,
      destinatario: notificacion.destinatario,
      datos: notificacion.datos,
      claveIdempotencia: notificacion.claveIdempotencia,
      intentos: notificacion.intentos,
      programadaPara: notificacion.programadaPara,
      creadoEn: notificacion.creadoEn,
    });
}

/** Solo se marca la que sigue `enviando`: si su arriendo venció y otro la retomó, la marca él. */
const reclamadaPorMi = (n: Reclamada) =>
  and(eq(notificacion.id, n.id), eq(notificacion.negocioId, n.negocioId), eq(notificacion.estado, "enviando"));

/** El proveedor la aceptó: `enviada`, con su id y la hora (ARCH §14.3, paso 5). Devuelve si la marcó. */
export async function marcarEnviada(n: Reclamada, mensajeId: string | null, ahora: Date, conexion: Conexion = db()): Promise<boolean> {
  const filas = await conexion
    .update(notificacion)
    .set({ estado: "enviada", proveedorMensajeId: mensajeId, enviadaEn: ahora, bloqueadaHasta: null, ultimoError: null })
    .where(reclamadaPorMi(n))
    .returning({ id: notificacion.id });
  return filas.length > 0;
}

/**
 * Un envío fallido (ARCH §14.3, paso 5): vuelve a `pendiente` para dentro de `2^intentos`
 * minutos (2, 4, 8 y 16), o queda `fallida` en el 5.º intento. Guarda el error, que nunca
 * lleva el destinatario (ARCH §19.2). Devuelve el estado en que quedó, o `null` si ya no
 * era suya.
 */
export async function registrarFallo(
  n: Reclamada & Pick<NotificacionReclamada, "intentos">,
  error: string,
  ahora: Date,
  conexion: Conexion = db(),
): Promise<"pendiente" | "fallida" | null> {
  const fallida = n.intentos >= MAXIMO_INTENTOS;
  const filas = await conexion
    .update(notificacion)
    .set(
      fallida
        ? { estado: "fallida", ultimoError: error, bloqueadaHasta: null }
        : {
            estado: "pendiente",
            ultimoError: error,
            bloqueadaHasta: null,
            programadaPara: new Date(ahora.getTime() + 2 ** n.intentos * 60 * 1000),
          },
    )
    .where(reclamadaPorMi(n))
    .returning({ id: notificacion.id });
  if (filas.length === 0) return null;
  return fallida ? "fallida" : "pendiente";
}

/** `fallida` sin reintentos, por ejemplo con `LIMITE_PLAN` (ARCH §14.3, paso 2). Devuelve si la marcó. */
export async function marcarFallida(n: Reclamada, error: string, conexion: Conexion = db()): Promise<boolean> {
  const filas = await conexion
    .update(notificacion)
    .set({ estado: "fallida", ultimoError: error, bloqueadaHasta: null })
    .where(reclamadaPorMi(n))
    .returning({ id: notificacion.id });
  return filas.length > 0;
}

/** Anula una reclamada que ya no corresponde (`cancelada`), con su motivo (ARCH §14.3, paso 1; Q-67). */
export async function anular(n: Reclamada, ultimoError: string, conexion: Conexion = db()): Promise<boolean> {
  const filas = await conexion
    .update(notificacion)
    .set({ estado: "cancelada", ultimoError, bloqueadaHasta: null })
    .where(reclamadaPorMi(n))
    .returning({ id: notificacion.id });
  return filas.length > 0;
}

/**
 * Los correos de citas `enviada` del negocio en el periodo, para `max_emails_per_month`
 * (ARCH §16.3): el mes calendario local (`mesLocal`, ARCH §9, regla 5), sin los de la
 * cuenta (C-07 y C-08), que no cuentan (ARCH §14.1).
 */
export async function contarEnviadas(negocioId: string, periodo: Intervalo, conexion: Conexion = db()): Promise<number> {
  const [{ total }] = await conexion
    .select({ total: count() })
    .from(notificacion)
    .where(
      and(
        eq(notificacion.negocioId, negocioId),
        eq(notificacion.estado, "enviada"),
        eq(notificacion.canal, "correo"),
        notInArray(notificacion.tipo, ["dueno_gracia", "dueno_suspension"]),
        gte(notificacion.enviadaEn, periodo.inicio),
        lt(notificacion.enviadaEn, periodo.fin),
      ),
    );
  return total;
}

// ─── Datos del mensaje (ARCH §14.3, paso 3; T6.14) ────────────────────────────
// Lo que lee `mensajes.ts` para armar cada correo con los datos actuales. Filtran por el
// `negocio_id` de la notificación (ARCH §6).

/** El correo del miembro `dueno` más antiguo, como `encolarAlDueno` (Q-28 de TASKS-03). */
const correoDelDueno = (negocioId: string) =>
  sql<string | null>`(SELECT ${miembroNegocio.correo} FROM ${miembroNegocio}
     WHERE ${miembroNegocio.negocioId} = ${negocioId} AND ${miembroNegocio.rol} = 'dueno'
     ORDER BY ${miembroNegocio.creadoEn}, ${miembroNegocio.id} LIMIT 1)`;

export type NegocioDelMensaje = {
  nombre: string;
  slug: string;
  logoUrl: string | null;
  colorPrimario: string;
  zonaHoraria: string;
  correoContacto: string | null;
  correoDueno: string | null;
};

export async function negocioDelMensaje(negocioId: string, conexion: Conexion = db()): Promise<NegocioDelMensaje | null> {
  const [fila] = await conexion
    .select({
      nombre: negocio.nombre,
      slug: negocio.slug,
      logoUrl: negocio.logoUrl,
      colorPrimario: negocio.colorPrimario,
      zonaHoraria: negocio.zonaHoraria,
      correoContacto: negocio.correoContacto,
      correoDueno: correoDelDueno(negocioId),
    })
    .from(negocio)
    .where(eq(negocio.id, negocioId));
  return fila ?? null;
}

export type CitaDelMensaje = {
  id: string;
  sedeId: string;
  codigo: string;
  estado: (typeof cita.estado.enumValues)[number];
  version: number;
  tokenVersion: number;
  servicioNombre: string;
  inicio: Date;
  fin: Date;
  clienteNombre: string;
  clienteApellido: string;
  clienteTelefono: string | null;
  clienteCorreo: string | null;
  /** La dirección de la sede de la cita. */
  direccion: string | null;
  /** La versión de la política que aceptó el cliente o, en una cita manual, la vigente (Q-65). */
  versionPolitica: number | null;
};

/** La cita con su instantánea (RN-18.3), su sede y su política, o `null` si no es del negocio (RN-01). */
export async function citaDelMensaje(negocioId: string, citaId: string, conexion: Conexion = db()): Promise<CitaDelMensaje | null> {
  const vigente = conexion
    .select({ version: politicaDatos.version })
    .from(politicaDatos)
    .where(eq(politicaDatos.negocioId, negocioId))
    .orderBy(desc(politicaDatos.version))
    .limit(1);
  const [fila] = await conexion
    .select({
      id: cita.id,
      sedeId: cita.sedeId,
      codigo: cita.codigo,
      estado: cita.estado,
      version: cita.version,
      tokenVersion: cita.tokenVersion,
      servicioNombre: cita.servicioNombre,
      inicio: cita.inicio,
      fin: cita.fin,
      clienteNombre: cita.clienteNombre,
      clienteApellido: cita.clienteApellido,
      clienteTelefono: cita.clienteTelefono,
      clienteCorreo: cita.clienteCorreo,
      direccion: sede.direccion,
      versionPolitica: sql<number | null>`coalesce(${politicaDatos.version}, (${vigente}))`,
    })
    .from(cita)
    .innerJoin(sede, and(eq(sede.id, cita.sedeId), eq(sede.negocioId, cita.negocioId)))
    .leftJoin(politicaDatos, and(eq(politicaDatos.id, cita.politicaDatosId), eq(politicaDatos.negocioId, cita.negocioId)))
    .where(and(eq(cita.negocioId, negocioId), eq(cita.id, citaId)));
  return fila ?? null;
}

// ─── Recálculo de los recordatorios (PAN-16; ARCH §14.1; Q-23 de TASKS-02) ──────

/**
 * Recalcula, en la transacción que cambia `recordatorio_horas_antes`, los recordatorios
 * de las citas futuras `confirmada` con correo del negocio (RN-21, S-05):
 *
 * - con "ninguno" (`null`), anula los pendientes;
 * - con un número de horas, anula los pendientes cuyo momento nuevo ya pasó (S-12) y crea
 *   o mueve el de la versión actual de cada cita a `inicio − horas`, con su clave de
 *   siempre (`recordatorio:{citaId}:v{version}`; RN-20). Como la clave es única, uno
 *   anulado de la misma versión se reactiva en lugar de insertar otro. Los ya enviados (o
 *   saliendo) no cambian, ni los de citas pasadas o canceladas.
 */
export async function recalcularRecordatorios(
  negocioId: string,
  horasAntes: number | null,
  ahora: Date,
  tx: Transaccion,
): Promise<void> {
  const instante = sql`${ahora.toISOString()}::timestamptz`;
  const momento = horasAntes === null ? null : sql`c.inicio - ${horasAntes} * interval '1 hour'`;
  // Los pendientes que se quedan sin recordatorio: todos con "ninguno", o los que ya no llegan a tiempo.
  await tx.execute(sql`
    UPDATE ${notificacion} n
       SET estado = 'cancelada'
      FROM ${cita} c
     WHERE n.cita_id = c.id AND n.negocio_id = c.negocio_id
       AND n.negocio_id = ${negocioId} AND n.tipo = 'recordatorio' AND n.estado = 'pendiente'
       AND c.estado = 'confirmada' AND c.inicio > ${instante}
       ${momento === null ? sql`` : sql`AND ${momento} <= ${instante}`}`);
  if (momento === null) return;
  await tx.execute(sql`
    INSERT INTO ${notificacion} AS n (negocio_id, cita_id, tipo, destinatario, datos, clave_idempotencia, programada_para)
    SELECT c.negocio_id, c.id, 'recordatorio', c.cliente_correo, jsonb_build_object('version', c.version),
           'recordatorio:' || c.id || ':v' || c.version, ${momento}
      FROM ${cita} c
     WHERE c.negocio_id = ${negocioId} AND c.estado = 'confirmada' AND c.inicio > ${instante}
       AND c.cliente_correo IS NOT NULL AND ${momento} > ${instante}
    ON CONFLICT (clave_idempotencia) DO UPDATE
       SET programada_para = EXCLUDED.programada_para,
           estado = 'pendiente',
           ultimo_error = CASE WHEN n.estado = 'cancelada' THEN NULL ELSE n.ultimo_error END
     WHERE n.estado IN ('pendiente', 'cancelada')`);
}
