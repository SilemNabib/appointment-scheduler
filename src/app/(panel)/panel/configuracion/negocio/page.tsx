import type { Metadata } from "next";
import { Seccion } from "@/componentes/formulario";
import { requireMiembro } from "@/servidor/auth/sesion";
import { listarContactos } from "@/servidor/casos-uso/contactos";
import { leerNegocio } from "@/servidor/casos-uso/guardar-negocio";
import { FormularioContactos } from "./contactos";
import { FormularioLogo, FormularioNegocio } from "./formulario";

export const metadata: Metadata = { title: "Negocio" };

// Configuración del negocio y su marca (PAN-11). La dirección y los contactos son los de
// la sede principal, pero el panel no habla de sedes (RN-32, D-16). Con el negocio
// suspendido se ve todo y no se puede cambiar nada (D-14).
export default async function PaginaNegocio() {
  const ctx = await requireMiembro();
  const [datos, contactos] = await Promise.all([leerNegocio(ctx), listarContactos(ctx)]);
  const soloLectura = ctx.suscripcion.estado === "suspendida";

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Negocio</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Así se presenta tu negocio en tu página de reservas y en los correos a tus clientes.
        </p>
      </div>
      <FormularioLogo logoUrl={datos.logoUrl} soloLectura={soloLectura} />
      <FormularioNegocio datos={datos} soloLectura={soloLectura} />
      <Seccion
        titulo="Contactos"
        descripcion="Tus clientes los ven en tu página de reservas, en este orden, con un botón para escribirte o llamarte."
      >
        <FormularioContactos contactos={contactos} soloLectura={soloLectura} />
      </Seccion>
    </div>
  );
}
