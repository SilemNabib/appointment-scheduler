import "server-only";
import type { TipoNotificacion } from "@/dominio/envios";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import type { NotificacionConProblema } from "@/servidor/db/repositorios/notificaciones";
import { esId } from "./esquemas";

export type { NotificacionConProblema };

// Las notificaciones con problemas, en el admin (ADM-05; RN-20, D-14, ADR-07; ARCH §14.2,
// §14.3, §19.2, §21.4 y §23; Q-73). Solo se llama detrás de `requireSuperadmin`. Muestra
// las `fallida` y las `pendiente` con más de 15 minutos de atraso, que dicen que el cron
// no está corriendo, y deja reintentar las fallidas. Nunca el destinatario (ARCH §19.2).

/** El correo del PRD de cada tipo (PRD §5.4). */
export const CORREO_DEL_PRD: Record<TipoNotificacion, string> = {
  confirmacion: "C-01",
  recordatorio: "C-02",
  cancelacion: "C-03",
  reprogramacion: "C-04",
  dueno_cita_nueva: "C-05",
  dueno_cambio: "C-06",
  dueno_gracia: "C-07",
  dueno_suspension: "C-08",
  empleado_cita_nueva: "C-09",
  empleado_cambio: "C-10",
};

export type NotificacionesConProblemas = {
  fallidas: NotificacionConProblema[];
  /** Si está vacía, el cron está corriendo (ARCH §21.4). */
  atrasadas: NotificacionConProblema[];
};

export async function listarNotificacionesConProblemas(ahora: Date): Promise<NotificacionesConProblemas> {
  const filas = await notificaciones.conProblemas(ahora);
  return {
    fallidas: filas.filter((f) => f.estado === "fallida"),
    atrasadas: filas.filter((f) => f.estado === "pendiente"),
  };
}

/**
 * Devuelve una notificación `fallida` a `pendiente` para ahora, con 0 intentos y sin
 * `ultimo_error` (Q-73). Sale en la siguiente corrida del cron, revalidada como cualquier
 * otra (`dominio/envios.ts`: con el negocio suspendido, un correo de citas se anula) y con
 * su clave de idempotencia de siempre (RN-20): Resend no guarda la clave de un envío que
 * falló, así que el reintento sale, y si ya había aceptado uno, no lo duplica. Registra
 * `notificacion_reintentada` con su id y el del admin. Una que no está `fallida` devuelve
 * `ESTADO_INVALIDO` sin cambiar, y un id que no existe, `NO_ENCONTRADO`.
 */
export async function reintentarNotificacion(
  entrada: { notificacionId: unknown },
  admin: { clerkUserId: string },
  ahora: Date,
): Promise<Resultado<void, "NO_ENCONTRADO" | "ESTADO_INVALIDO">> {
  const id = entrada.notificacionId;
  if (!esId(id)) return fallo("NO_ENCONTRADO");
  if (!(await notificaciones.reintentar(id, ahora))) {
    return (await notificaciones.existe(id)) ? fallo("ESTADO_INVALIDO") : fallo("NO_ENCONTRADO");
  }
  console.log(JSON.stringify({ evento: "notificacion_reintentada", notificacionId: id, admin: admin.clerkUserId }));
  return exito(undefined);
}
