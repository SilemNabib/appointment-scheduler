import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Seccion } from "@/componentes/formulario";
import { ANILLO_FOCO } from "@/componentes/estilos";
import { BadgeEstadoCita } from "@/componentes/panel/estado-cita";
import { HistorialCita } from "@/componentes/panel/historial-cita";
import { TituloPagina } from "@/componentes/panel/titulo-pagina";
import { TarjetaContacto } from "@/componentes/publico/tarjeta-contacto";
import type { Contacto } from "@/dominio/contactos";
import { formatearDiaLocal, formatearHora } from "@/dominio/formato";
import { fechaLocal } from "@/dominio/tiempo";
import { requireMiembro } from "@/servidor/auth/sesion";
import { detalleCita } from "@/servidor/casos-uso/detalle-cita";

export const metadata: Metadata = { title: "Detalle de la cita" };

// Detalle de la cita (PAN-03; RN-01, RN-03, RNF-02, RNF-03, D-28; Q-61): el código en
// monoespaciada, el estado, el servicio, la fecha y la hora en la zona del negocio, el
// cliente con los datos con que reservó y sus enlaces de contacto, y el historial. Una
// cita de otro negocio o un id inválido responden 404, como una inexistente (ARCH §6).

const enlace = `rounded-sm font-semibold text-acento-texto underline ${ANILLO_FOCO}`;

/** WhatsApp, llamada y correo con los datos de la cita (D-29 da los enlaces). */
function contactosDe(cliente: { telefono: string | null; correo: string | null }): Contacto[] {
  return [
    ...(cliente.telefono
      ? [
          { tipo: "whatsapp" as const, valor: cliente.telefono, etiqueta: null },
          { tipo: "telefono" as const, valor: cliente.telefono, etiqueta: null },
        ]
      : []),
    ...(cliente.correo ? [{ tipo: "correo" as const, valor: cliente.correo, etiqueta: null }] : []),
  ];
}

export default async function PaginaCita({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMiembro();
  const { id } = await params;
  const resultado = await detalleCita(ctx, id, new Date());
  if (!resultado.ok) notFound();
  const cita = resultado.valor;
  const zona = cita.zonaHoraria;
  const dia = fechaLocal(cita.inicio, zona);
  const contactos = contactosDe(cita.cliente);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <TituloPagina
        antes={
          <Link href={`/panel/agenda?vista=dia&fecha=${dia}`} className={`inline-flex min-h-11 items-center self-start text-sm ${enlace}`}>
            ← Volver a la agenda
          </Link>
        }
        titulo={cita.servicio}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              Código <span className="font-codigo text-sm text-tinta">{cita.codigo}</span>
            </span>
            <BadgeEstadoCita estado={cita.estado} />
          </span>
        }
      />

      <Seccion titulo="Cita">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[13px] font-semibold text-texto-muted">Fecha</dt>
            <dd className="first-letter:uppercase">{formatearDiaLocal(dia, true)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[13px] font-semibold text-texto-muted">Hora</dt>
            <dd>
              {formatearHora(cita.inicio, zona)} a {formatearHora(cita.fin, zona)}
            </dd>
          </div>
        </dl>
      </Seccion>

      <Seccion titulo="Cliente" descripcion="Los datos con que se hizo la reserva.">
        <p className="text-lg font-semibold">
          {cita.cliente.nombre} {cita.cliente.apellido}
        </p>
        {contactos.length > 0 ? (
          <TarjetaContacto contactos={contactos} />
        ) : (
          <p className="text-sm text-texto-muted">Esta cita no tiene teléfono ni correo.</p>
        )}
      </Seccion>

      {/* Las acciones (mover, cancelar y marcar la asistencia) llegan con T5.21 y T5.22. */}

      <Seccion titulo="Historial">
        <HistorialCita lineas={cita.historial} />
      </Seccion>
    </div>
  );
}
