import type { Metadata } from "next";
import { formatearIntervalo } from "@/dominio/formato";
import { fechaLocal } from "@/dominio/tiempo";
import { requireMiembro } from "@/servidor/auth/sesion";
import { listarBloqueos } from "@/servidor/casos-uso/bloqueos";
import { resumenNegocio } from "@/servidor/casos-uso/resumen-negocio";
import { FormularioBloqueo, ListaBloqueos } from "./formulario";

export const metadata: Metadata = { title: "Bloqueos" };

// Bloqueos puntuales (PAN-08; RN-07, D-15): horas, días o rangos en que no se atiende.
// Las fechas y horas se muestran en la zona del negocio (RN-03). Con el negocio
// suspendido se ven y no se pueden cambiar (D-14).
export default async function PaginaBloqueos() {
  const ctx = await requireMiembro();
  const [bloqueos, negocio] = await Promise.all([listarBloqueos(ctx), resumenNegocio(ctx)]);
  const zona = negocio.zonaHoraria;
  const soloLectura = ctx.suscripcion.estado === "suspendida";

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Bloqueos</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Horas o días en que no atiendes, como un festivo o una capacitación: tus clientes no podrán reservar en ese
          tiempo. No se puede bloquear un horario que ya tiene citas confirmadas.
        </p>
      </div>
      <FormularioBloqueo zonaHoraria={zona} hoy={fechaLocal(new Date(), zona)} soloLectura={soloLectura} />
      <ListaBloqueos
        bloqueos={bloqueos.map((b) => ({ id: b.id, texto: formatearIntervalo(b.inicio, b.fin, zona), motivo: b.motivo }))}
        soloLectura={soloLectura}
      />
    </div>
  );
}
