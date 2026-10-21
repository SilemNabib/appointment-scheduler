import type { Metadata } from "next";
import { requireMiembro } from "@/servidor/auth/sesion";
import { listarCategorias, listarServicios } from "@/servidor/casos-uso/servicios";
import { Servicios } from "./formulario";

export const metadata: Metadata = { title: "Servicios" };

// Servicios del negocio (PAN-12; RN-05). Cada servicio nuevo se ofrece en la sede
// principal con su consultorio, sin que el panel hable de sedes (RN-32, D-16). Con el
// negocio suspendido se ve todo y no se puede cambiar nada (D-14).
export default async function PaginaServicios() {
  const ctx = await requireMiembro();
  const [servicios, categorias] = await Promise.all([listarServicios(ctx), listarCategorias(ctx)]);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Servicios</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Lo que tus clientes pueden reservar. Un servicio inactivo no se ofrece en tu página de reservas, pero sus
          citas se conservan.
        </p>
      </div>
      <Servicios servicios={servicios} categorias={categorias} soloLectura={ctx.suscripcion.estado === "suspendida"} />
    </div>
  );
}
