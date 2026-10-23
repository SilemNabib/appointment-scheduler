import { consultarDisponibilidadGestion } from "@/servidor/casos-uso/gestion-cita";
import { datosInvalidosDeGestion, leerCuerpoJson, responderGestion } from "@/servidor/http/respuestas";

// Horas libres para reprogramar desde el link (GES-03; ARCH §18.5; Q-69):
//   POST /api/publico/{slug}/citas/{citaId}/disponibilidad   { "token", "desde", "hasta" }
// Adaptador delgado. El token va en el cuerpo, nunca en la URL de la API (ARCH §18.5), y
// la respuesta no lo repite (ARCH §19.2). Responde como GET …/disponibilidad, con
// `Cache-Control: private, no-store` (ARCH §13). El límite de frecuencia llega en la Fase 8.
export async function POST(solicitud: Request, { params }: { params: Promise<{ slug: string; citaId: string }> }) {
  const cuerpo = await leerCuerpoJson(solicitud);
  if (!cuerpo) return datosInvalidosDeGestion();
  const { slug, citaId } = await params;
  return responderGestion(
    await consultarDisponibilidadGestion({ slug, citaId, token: cuerpo.token, desde: cuerpo.desde, hasta: cuerpo.hasta }, new Date()),
  );
}
