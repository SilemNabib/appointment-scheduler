import { esCronAutorizado } from "@/servidor/auth/cron";

// Ruta interna del Cron Trigger (ARCH §5, §14.4 y §14.5). La invoca el manejador
// `scheduled` de worker.ts cada 5 minutos, dentro del mismo Worker, con
// `Authorization: Bearer CRON_SECRET`.
export async function POST(request: Request) {
  if (!esCronAutorizado(request.headers.get("authorization"))) {
    return new Response(null, { status: 401 });
  }
  // Las tareas llegan en otras fases (Q-04), en este orden (§14.4):
  // aplicarVencimientos, aplicarAsistenciaPorDefecto y procesarNotificaciones.
  return new Response(null, { status: 204 });
}
