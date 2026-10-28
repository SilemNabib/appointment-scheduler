import "server-only";
import type { TipoNotificacion } from "@/dominio/envios";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import type { NotificacionConProblema } from "@/servidor/db/repositorios/notificaciones";

export type { NotificacionConProblema };

// Las notificaciones con problemas, en el admin (ADM-05; RN-20, ADR-07; ARCH §19.2, §21.4
// y §23; Q-73). Solo se llama detrás de `requireSuperadmin`. Muestra las `fallida` y las
// `pendiente` con más de 15 minutos de atraso, que dicen que el cron no está corriendo.
// Nunca el destinatario (ARCH §19.2).

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
