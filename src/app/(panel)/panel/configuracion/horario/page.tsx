import type { Metadata } from "next";
import { requireMiembro } from "@/servidor/auth/sesion";
import { leerHorarioSemanal } from "@/servidor/casos-uso/horario";
import { FormularioHorario } from "./formulario";

export const metadata: Metadata = { title: "Horario" };

// Horario semanal (PAN-14; RN-07). Es el de la sede principal, pero el panel no habla
// de sedes (RN-32, D-16). Con el negocio suspendido se ve y no se puede cambiar (D-14).
export default async function PaginaHorario() {
  const ctx = await requireMiembro();
  const franjas = await leerHorarioSemanal(ctx);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Horario</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Las horas en que atiendes cada día, en hora de Colombia. Usa varias franjas para dejar pausas, como la hora
          del almuerzo: una cita siempre cabe completa dentro de una sola franja.
        </p>
      </div>
      <FormularioHorario franjas={franjas} soloLectura={ctx.suscripcion.estado === "suspendida"} />
    </div>
  );
}
