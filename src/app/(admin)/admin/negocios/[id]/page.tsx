import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoEfectivo, ESTADOS_SUSCRIPCION, Vencimiento } from "@/componentes/admin/estado-suscripcion";
import { ANILLO_FOCO } from "@/componentes/estilos";
import { requireSuperadmin } from "@/servidor/auth/sesion";
import { detalleNegocioAdmin } from "@/servidor/casos-uso/detalle-negocio-admin";
import { BotonReenviarInvitacion, BotonSuspender, FormularioFinPrueba, FormularioPago } from "./formularios";

export const metadata: Metadata = { title: "Negocio · Admin" };

// Detalle de un negocio (ADM-01, ADM-03): los datos de la suscripción y sus acciones:
// registrar un pago, cambiar el fin de la prueba (solo en prueba, Q-25) y suspender.
// Mientras el dueño no entre al panel, "Reenviar invitación" (T6.33; ARCH §7.4). Un id
// que no existe responde 404.
export default async function DetalleNegocio({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperadmin();
  const { id } = await params;
  const negocio = await detalleNegocioAdmin(id);
  if (!negocio) notFound();

  const datos: [string, React.ReactNode][] = [
    ["Slug", <span key="slug" className="font-mono">{negocio.slug}</span>],
    ["Plan", negocio.plan],
    ["Zona horaria", negocio.zonaHoraria],
    ["Suscripción", ESTADOS_SUSCRIPCION[negocio.estadoSuscripcion]],
    ["Vence", <Vencimiento key="vence" fecha={negocio.vencimiento} />],
    ["Estado", <EstadoEfectivo key="estado" estado={negocio.estado} zonaHoraria={negocio.zonaHoraria} />],
  ];

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/admin"
          className={`self-start rounded-sm text-sm text-zinc-600 underline dark:text-zinc-400 ${ANILLO_FOCO}`}
        >
          Volver a la lista de negocios
        </Link>
        <h1 className="text-xl font-semibold">{negocio.nombre}</h1>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        {datos.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="contents">
            <dt className="font-medium text-zinc-600 dark:text-zinc-400">{etiqueta}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>

      {negocio.dueno && !negocio.dueno.vinculado && (
        <BotonReenviarInvitacion negocioId={negocio.id} correo={negocio.dueno.correo} />
      )}
      <FormularioPago negocioId={negocio.id} pagadoHasta={negocio.pagadoHasta} />
      {negocio.estadoSuscripcion === "prueba" && (
        <FormularioFinPrueba negocioId={negocio.id} finPrueba={negocio.finPrueba} />
      )}
      {negocio.estadoSuscripcion === "suspendida" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          El negocio está suspendido. Registra un pago para reactivarlo.
        </p>
      ) : (
        <BotonSuspender negocioId={negocio.id} nombre={negocio.nombre} />
      )}
    </section>
  );
}
