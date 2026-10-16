import type { Metadata } from "next";
import { requireMiembro } from "@/servidor/auth/sesion";
import { leerConsultorio } from "@/servidor/casos-uso/consultorio";
import { FormularioConsultorio } from "./formulario";

export const metadata: Metadata = { title: "Consultorio" };

// Consultorio de la sede principal (PAN-13; RN-06). Con el negocio suspendido se ve y
// no se puede cambiar (D-14).
export default async function PaginaConsultorio() {
  const ctx = await requireMiembro();
  const consultorio = await leerConsultorio(ctx);

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Consultorio</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          El lugar donde atiendes las citas. Todos tus servicios lo usan.
        </p>
      </div>
      <FormularioConsultorio
        nombre={consultorio.nombre}
        capacidad={consultorio.capacidad}
        soloLectura={ctx.suscripcion.estado === "suspendida"}
      />
    </div>
  );
}
