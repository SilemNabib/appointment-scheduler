import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { responder, respuestaError } from "@/servidor/http/respuestas";

// Reserva pública (PUB-05, PUB-06; ARCH §5 y §18.5):
//   POST /api/publico/{slug}/reservas   Content-Type: application/json
// Adaptador delgado: solo acepta JSON, que un formulario de otro sitio no puede enviar
// sin una petición previa de CORS (ARCH §19.2); con otro tipo, o un cuerpo que no es un
// objeto JSON, responde 422 DATOS_INVALIDOS (Q-33). El slug sale de la URL, nunca del
// cuerpo (ARCH §6). Responde 201 con { citaId, codigo, inicio, fin } o el error de §18.5. El
// límite de frecuencia llega en la Fase 8 (Q-35).
export async function POST(solicitud: Request, { params }: { params: Promise<{ slug: string }> }) {
  const tipo = solicitud.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (tipo !== "application/json") return respuestaError("DATOS_INVALIDOS");

  let cuerpo: unknown;
  try {
    cuerpo = await solicitud.json();
  } catch {
    return respuestaError("DATOS_INVALIDOS");
  }
  if (typeof cuerpo !== "object" || cuerpo === null || Array.isArray(cuerpo)) return respuestaError("DATOS_INVALIDOS");

  const { slug } = await params;
  return responder(await reservarCita({ ...cuerpo, slug }, new Date()), 201);
}
