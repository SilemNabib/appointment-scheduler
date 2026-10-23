import { cancelarCitaDelCliente } from "@/servidor/casos-uso/cancelar-cita";
import { datosInvalidosDeGestion, leerCuerpoJson, responderGestion } from "@/servidor/http/respuestas";
import { despacharSiSalioBien } from "@/servidor/notificaciones/despacho";

// Cancelar desde el link (GES-02, F-02; ARCH §18.5; Q-69):
//   POST /api/publico/{slug}/citas/{citaId}/cancelar   { "token" }
// Adaptador delgado. Responde 200 con { citaId, estado, inicio, fin,
// reprogramacionesRestantes }, o el error de §18.5 con los textos de Q-70, siempre con
// `Cache-Control: private, no-store`. C-03 y C-06 salen después de responder (ARCH §14.4).
export async function POST(solicitud: Request, { params }: { params: Promise<{ slug: string; citaId: string }> }) {
  const cuerpo = await leerCuerpoJson(solicitud);
  if (!cuerpo) return datosInvalidosDeGestion();
  const { slug, citaId } = await params;
  return responderGestion(despacharSiSalioBien(await cancelarCitaDelCliente({ slug, citaId, token: cuerpo.token }, new Date())));
}
