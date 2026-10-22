import type { Metadata } from "next";
import { TituloPagina } from "@/componentes/panel/titulo-pagina";
import { requireMiembro } from "@/servidor/auth/sesion";
import { leerConfiguracion } from "@/servidor/casos-uso/configuracion";
import { FormularioRecordatorio } from "./formulario";

export const metadata: Metadata = { title: "Recordatorios" };

// Recordatorio de las citas (PAN-16; RN-21, S-12). Con el negocio suspendido se ve y no
// se puede cambiar (D-14).
export default async function PaginaRecordatorios() {
  const ctx = await requireMiembro();
  const { recordatorioHorasAntes } = await leerConfiguracion(ctx);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <TituloPagina
        titulo="Recordatorios"
        descripcion="Tus clientes reciben un correo para recordarles su cita."
      />
      <FormularioRecordatorio
        horasAntes={recordatorioHorasAntes}
        soloLectura={ctx.suscripcion.estado === "suspendida"}
      />
    </div>
  );
}
