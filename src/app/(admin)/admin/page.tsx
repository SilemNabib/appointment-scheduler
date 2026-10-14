import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperadmin } from "@/servidor/auth/sesion";
import { listarNegocios, type NegocioEnLista } from "@/servidor/casos-uso/listar-negocios";

export const metadata: Metadata = { title: "Negocios · Admin" };

const ESTADOS_SUSCRIPCION: Record<NegocioEnLista["estadoSuscripcion"], string> = {
  prueba: "Prueba",
  activa: "Activa",
  suspendida: "Suspendida",
};

/** Fecha local inclusiva `YYYY-MM-DD`, sin pasar por la zona del servidor. */
function fechaLocal(fecha: string) {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(anio, mes - 1, dia)),
  );
}

/** Instante en la zona del negocio (ARCH §9, regla 3). */
function instante(valor: Date, zonaHoraria: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: zonaHoraria }).format(
    valor,
  );
}

function EstadoEfectivo({ negocio }: { negocio: NegocioEnLista }) {
  const { estado } = negocio;
  if (estado.estado === "al_dia") return <span className="text-emerald-700 dark:text-emerald-400">Al día</span>;
  if (estado.estado === "suspendida") return <span className="font-medium text-red-700 dark:text-red-400">Suspendido</span>;
  return (
    <span className="text-amber-700 dark:text-amber-400">
      En gracia: se suspende el {instante(estado.suspendeEn, negocio.zonaHoraria)}
    </span>
  );
}

// Lista de negocios (ADM-01).
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
                  <td className="py-2 pr-4">{n.nombre}</td>
                  <td className="py-2 pr-4">{n.plan}</td>
                  <td className="py-2 pr-4">{ESTADOS_SUSCRIPCION[n.estadoSuscripcion]}</td>
                  <td className="py-2 pr-4">{n.vencimiento ? fechaLocal(n.vencimiento) : "—"}</td>
                  <td className="py-2">
                    <EstadoEfectivo negocio={n} />
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
