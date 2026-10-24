import { servirCalendario } from "@/servidor/casos-uso/enlace-calendario";
import { respuestaError } from "@/servidor/http/respuestas";

// El calendario del dueño para Google Calendar, Outlook y Apple (PAN-20; RN-35; ARCH §5,
// §14.7 y §18.5):
//   GET /api/calendario/{enlaceId}/{token}   → 200 text/calendar · 404 si no existe, está revocado o la firma no coincide
// Adaptador delgado. Los calendarios lo consultan cada varias horas: se puede guardar 5
// minutos, solo en el navegador o la caché del cliente, y no se indexa. El límite de
// frecuencia `RL_CALENDARIO` llega en la Fase 8 (Q-35 de TASKS-03).
export async function GET(_solicitud: Request, { params }: { params: Promise<{ enlaceId: string; token: string }> }) {
  const { enlaceId, token } = await params;
  const resultado = await servirCalendario(enlaceId, token, new Date());
  if (!resultado.ok) return respuestaError("NO_ENCONTRADO");
  return new Response(resultado.valor, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
