import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperadmin } from "@/servidor/auth/sesion";
import { EstadoEfectivo, ESTADOS_SUSCRIPCION, Vencimiento } from "@/componentes/admin/estado-suscripcion";
import { ANILLO_FOCO } from "@/componentes/estilos";
import { listarNegocios } from "@/servidor/casos-uso/listar-negocios";

export const metadata: Metadata = { title: "Negocios · Admin" };

// Lista de negocios (ADM-01). Cada nombre abre el detalle del negocio (ADM-03).
export default async function NegociosAdmin() {
  await requireSuperadmin();
  const negocios = await listarNegocios();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Negocios</h1>
        <Link
          href="/admin/negocios/nuevo"
          className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
        >
          Nuevo negocio
        </Link>
      </div>

      {negocios.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">Todavía no hay negocios.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="py-2 pr-4 font-medium">Slug</th>
                <th className="py-2 pr-4 font-medium">Nombre</th>
                <th className="py-2 pr-4 font-medium">Plan</th>
                <th className="py-2 pr-4 font-medium">Suscripción</th>
                <th className="py-2 pr-4 font-medium">Vence</th>
                <th className="py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {negocios.map((n) => (
                <tr key={n.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2 pr-4 font-mono">{n.slug}</td>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/negocios/${n.id}`}
                      className={`rounded-sm font-medium text-teal-700 underline dark:text-teal-400 ${ANILLO_FOCO}`}
                    >
                      {n.nombre}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{n.plan}</td>
                  <td className="py-2 pr-4">{ESTADOS_SUSCRIPCION[n.estadoSuscripcion]}</td>
                  <td className="py-2 pr-4">
                    <Vencimiento fecha={n.vencimiento} />
                  </td>
                  <td className="py-2">
                    <EstadoEfectivo estado={n.estado} zonaHoraria={n.zonaHoraria} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
