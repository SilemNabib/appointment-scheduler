import type { Metadata } from "next";
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
    <div className="flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Recordatorios</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Tus clientes reciben un correo para recordarles su cita.
        </p>
      </div>
      <FormularioRecordatorio
        horasAntes={recordatorioHorasAntes}
        soloLectura={ctx.suscripcion.estado === "suspendida"}
      />
    </div>
  );
}
