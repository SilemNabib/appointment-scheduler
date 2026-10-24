import type { Metadata } from "next";
import { TituloPagina } from "@/componentes/panel/titulo-pagina";
import { requireMiembro } from "@/servidor/auth/sesion";
import { leerEnlaceCalendario } from "@/servidor/casos-uso/enlace-calendario";
import { EnlaceCalendario } from "./enlace";

export const metadata: Metadata = { title: "Mi calendario" };

// "Mi calendario" (PAN-20; RN-35, D-14; ARCH §14.7; Q-57 de TASKS-05, Q-72): el enlace
// privado de suscripción para ver las citas en Google Calendar u Outlook. Leer no
// escribe: sin enlace, la pantalla ofrece crearlo. Con el negocio suspendido, el enlace
// se ve y se sigue sirviendo, pero no se crea ni se regenera.
export default async function PaginaCalendario() {
  const ctx = await requireMiembro();
  const urls = await leerEnlaceCalendario(ctx);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <TituloPagina
        titulo="Mi calendario"
        descripcion="Agrega tu agenda a Google Calendar u Outlook y ve tus citas junto al resto de tus compromisos, incluidas las que crees tú."
      />
      <EnlaceCalendario urls={urls} soloLectura={ctx.suscripcion.estado === "suspendida"} />
    </div>
  );
}
