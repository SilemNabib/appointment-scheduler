import type { Metadata } from "next";
import Link from "next/link";
import { ANILLO_FOCO } from "@/componentes/estilos";
import { TituloPagina } from "@/componentes/panel/titulo-pagina";
import { esFechaLocal, fechaLocal } from "@/dominio/tiempo";
import { requireMiembro } from "@/servidor/auth/sesion";
import { resumenNegocio } from "@/servidor/casos-uso/resumen-negocio";
import { listarServicios } from "@/servidor/casos-uso/servicios";
import { FormularioCitaManual } from "./formulario";

export const metadata: Metadata = { title: "Nueva cita" };

// Nueva cita manual (PAN-04, F-06; RN-15, D-01, D-11, S-05; Q-53, Q-54, Q-56). La fecha y
// la hora pueden llegar en la URL desde un espacio libre de la agenda
// (`?fecha=AAAA-MM-DD&hora=HH:mm`); un día pasado abre hoy. Con el negocio suspendido el
// formulario se ve deshabilitado (D-14), y el servidor lo rechaza igual.

export default async function PaginaNuevaCita({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const ctx = await requireMiembro();
  const [negocio, servicios] = await Promise.all([resumenNegocio(ctx), listarServicios(ctx)]);
  const zona = negocio.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const parametros = await searchParams;
  const pedida = esFechaLocal(parametros.fecha) && parametros.fecha >= hoy ? parametros.fecha : null;
  const hora = pedida && typeof parametros.hora === "string" && /^\d{2}:\d{2}$/.test(parametros.hora) ? parametros.hora : null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <TituloPagina
        antes={
          <Link
            href={`/panel/agenda?vista=dia&fecha=${pedida ?? hoy}`}
            className={`inline-flex min-h-11 items-center self-start rounded-sm text-sm font-semibold text-acento-texto underline ${ANILLO_FOCO}`}
          >
            ← Volver a la agenda
          </Link>
        }
        titulo="Nueva cita"
        descripcion="Agenda una cita que te pidieron por teléfono o WhatsApp, en una de las horas libres."
      />
      <FormularioCitaManual
        servicios={servicios.filter((s) => s.activo).map((s) => ({ id: s.id, nombre: s.nombre }))}
        zonaHoraria={zona}
        hoy={hoy}
        fechaInicial={pedida ?? hoy}
        horaInicial={hora}
        soloLectura={ctx.suscripcion.estado === "suspendida"}
      />
    </div>
  );
}
