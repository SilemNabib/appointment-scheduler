import type { Metadata } from "next";
import { requireMiembro } from "@/servidor/auth/sesion";
import { resumenNegocio } from "@/servidor/casos-uso/resumen-negocio";

export const metadata: Metadata = { title: "Panel" };

// Página provisional del panel: el calendario, la configuración y la lista de
// verificación de F-05 (paso 3) llegan en las fases siguientes.
export default async function Panel() {
  const ctx = await requireMiembro();
  const negocio = await resumenNegocio(ctx);

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Hola, este es el panel de {negocio.nombre}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Pronto podrás configurar tus servicios, tu horario y tus reservas desde aquí.
      </p>
    </section>
  );
}
