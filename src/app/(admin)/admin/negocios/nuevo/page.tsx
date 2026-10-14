import type { Metadata } from "next";
import { requireSuperadmin } from "@/servidor/auth/sesion";
import { listarPlanes } from "@/servidor/planes/acceso";
import { FormularioAlta } from "./formulario";

export const metadata: Metadata = { title: "Nuevo negocio · Admin" };

// Alta de un negocio (ADM-02, F-11).
export default async function NuevoNegocio() {
  await requireSuperadmin();
  const planes = await listarPlanes();

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nuevo negocio</h1>
      <FormularioAlta planes={planes.map(({ codigo, nombre }) => ({ codigo, nombre }))} />
    </section>
  );
}
