import { reprogramarCita } from "@/servidor/casos-uso/reprogramar-cita";
import { datosInvalidosDeGestion, leerCuerpoJson, responderGestion } from "@/servidor/http/respuestas";
import { despacharSiSalioBien } from "@/servidor/notificaciones/despacho";

// Reprogramar desde el link (GES-03, F-03; ARCH §18.5; Q-69):
//   POST /api/publico/{slug}/citas/{citaId}/reprogramar   { "token", "inicio" }
// Adaptador delgado. Responde 200 con { citaId, estado, inicio, fin,
// reprogramacionesRestantes }, o el error de §18.5 con los textos de Q-70 y RN-34, siempre
// con `Cache-Control: private, no-store`. C-04 y C-06 salen después de responder (ARCH §14.4).
export async function POST(solicitud: Request, { params }: { params: Promise<{ slug: string; citaId: string }> }) {
  const cuerpo = await leerCuerpoJson(solicitud);
  if (!cuerpo) return datosInvalidosDeGestion();
  const { slug, citaId } = await params;
  return responderGestion(despacharSiSalioBien(await reprogramarCita({ slug, citaId, token: cuerpo.token, inicio: cuerpo.inicio }, new Date())));
}
