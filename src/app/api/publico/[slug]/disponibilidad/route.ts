import { consultarDisponibilidad } from "@/servidor/casos-uso/disponibilidad";
import { responder } from "@/servidor/http/respuestas";

// Disponibilidad pública (PUB-03, PUB-04; ARCH §5 y §18.5):
//   GET /api/publico/{slug}/disponibilidad?sedeId=…&servicioId=…&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Adaptador delgado: pasa los parámetros de la URL al caso de uso, que los valida, y
// responde con el JSON de §18.5. El límite de frecuencia llega en la Fase 8 (Q-35).
export async function GET(solicitud: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const consulta = new URL(solicitud.url).searchParams;
  const parametro = (nombre: string) => consulta.get(nombre) ?? undefined;
  const resultado = await consultarDisponibilidad(
    {
      slug,
      sedeId: parametro("sedeId"),
      servicioId: parametro("servicioId"),
      recursoId: parametro("recursoId"),
      desde: parametro("desde"),
      hasta: parametro("hasta"),
    },
    new Date(),
  );
  return responder(resultado);
}
