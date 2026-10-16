import type { Metadata } from "next";
import { requireMiembro } from "@/servidor/auth/sesion";
import { leerConfiguracion } from "@/servidor/casos-uso/configuracion";
import { FormularioReglas } from "./formulario";

export const metadata: Metadata = { title: "Reglas de reserva" };

// Reglas de reserva (PAN-15; RN-08, RN-09, RN-13, RN-16, RN-34; D-09, D-20, D-21). Con
// el negocio suspendido se ven y no se pueden cambiar (D-14).
export default async function PaginaReglas() {
  const ctx = await requireMiembro();
  const configuracion = await leerConfiguracion(ctx);

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Reglas de reserva</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Cómo y cuándo pueden reservar tus clientes. Los cambios aplican a las reservas siguientes: las citas que ya
          existen no cambian.
        </p>
      </div>
      <FormularioReglas reglas={configuracion} soloLectura={ctx.suscripcion.estado === "suspendida"} />
    </div>
  );
}
