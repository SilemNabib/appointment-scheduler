import type { Metadata } from "next";
import { TituloPagina } from "@/componentes/panel/titulo-pagina";
import { formatearFechaHora } from "@/dominio/formato";
import { requireMiembro } from "@/servidor/auth/sesion";
import { listarPoliticas, plantillaPolitica } from "@/servidor/casos-uso/politica-datos";
import { resumenNegocio } from "@/servidor/casos-uso/resumen-negocio";
import { EditorPolitica, HistorialPolitica } from "./formulario";

export const metadata: Metadata = { title: "Política de datos" };

// Política de tratamiento de datos (PAN-17; D-05, RN-17). El editor parte de la versión
// vigente; publicar crea una versión nueva y las anteriores quedan en el historial.
// Con el negocio suspendido se ve y no se puede publicar (D-14).
export default async function PaginaPolitica() {
  const ctx = await requireMiembro();
  const [versiones, plantilla, negocio] = await Promise.all([
    listarPoliticas(ctx),
    plantillaPolitica(ctx),
    resumenNegocio(ctx),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <TituloPagina
        titulo="Política de datos"
        descripcion="La política de tratamiento de datos personales que tus clientes aceptan al reservar (Ley 1581 de 2012)."
      />
      <EditorPolitica
        vigente={versiones[0]?.contenido ?? ""}
        plantilla={plantilla}
        soloLectura={ctx.suscripcion.estado === "suspendida"}
      />
      <HistorialPolitica
        versiones={versiones.map((v) => ({
          id: v.id,
          version: v.version,
          contenido: v.contenido,
          publicada: formatearFechaHora(v.publicadaEn, negocio.zonaHoraria),
        }))}
      />
    </div>
  );
}
