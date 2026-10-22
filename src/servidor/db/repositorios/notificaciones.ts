import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Transaccion } from "../cliente";
import { miembroNegocio, notificacion } from "../esquema";

// Bandeja de salida (outbox) de las notificaciones (RN-20 a RN-22; ARCH §14.1). Las filas
// se insertan en la misma transacción que el cambio de la cita: si la transacción falla,
// no hay correo. La clave de idempotencia es única, así que un mismo mensaje no se crea
// dos veces. El envío llega en la Fase 6 (Q-28, Q-60). Toda función recibe `negocioId` y
// lo usa en el WHERE o en la fila (ARCH §6, defensa 1).

/** Los tipos de correo de una cita que se encolan hasta ahora: C-01 a C-05. */
export type TipoDeCita = "confirmacion" | "recordatorio" | "cancelacion" | "reprogramacion" | "dueno_cita_nueva";

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
