import { esCronAutorizado } from "@/servidor/auth/cron";
import { correrCron } from "@/servidor/casos-uso/cron";

// Ruta interna del Cron Trigger (ARCH §5, §14.4 y §14.5). La invoca el manejador
// `scheduled` de worker.ts cada 5 minutos, dentro del mismo Worker, con
// `Authorization: Bearer CRON_SECRET`. Corre las tres tareas del cron, en orden y cada una
// aunque falle la anterior, y responde 204, o 500 si alguna falló (Q-75); worker.ts
// registra esa respuesta en Workers Logs (ARCH §21.4).
export async function POST(request: Request) {
  if (!esCronAutorizado(request.headers.get("authorization"))) {
    return new Response(null, { status: 401 });
  }
  const resultado = await correrCron(new Date());
  return new Response(null, { status: resultado.ok ? 204 : 500 });
}
