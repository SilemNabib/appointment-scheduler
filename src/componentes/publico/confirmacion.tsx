"use client";

import { claseBoton } from "@/componentes/formulario";
import { formatearDiaLocal, formatearHora } from "@/dominio/formato";
import { fechaLocal } from "@/dominio/tiempo";
import type { CitaCreada } from "./api";

// Confirmación de la reserva (PUB-06; D-28; DESIGN §4.1; Q-43): el código de reserva,
// el servicio, la fecha y la hora en la zona del negocio y la dirección. Dice a qué
// correo llega la confirmación, con el enlace para gestionar la cita y la invitación de
// calendario (C-01, Fase 6): sin "Agregar a mi calendario" ni "Gestionar mi cita" aquí
// (Q-43). El título lo pone el flujo, que le mueve el foco.

export function Confirmacion({
  cita,
  servicio,
  correo,
  direccion,
  zonaHoraria,
  alReservarOtra,
}: {
  cita: CitaCreada;
  servicio: string;
  correo: string;
  direccion: string | null;
  zonaHoraria: string;
  alReservarOtra: () => void;
}) {
  const inicio = new Date(cita.inicio);
  const datos = [
    { etiqueta: "Código de reserva", valor: cita.codigo, codigo: true },
    { etiqueta: "Servicio", valor: servicio },
    { etiqueta: "Fecha", valor: formatearDiaLocal(fechaLocal(inicio, zonaHoraria), true) },
    { etiqueta: "Hora", valor: `${formatearHora(inicio, zonaHoraria)} – ${formatearHora(new Date(cita.fin), zonaHoraria)}` },
    ...(direccion ? [{ etiqueta: "Dirección", valor: direccion }] : []),
  ];

  return (
    <div className="flex flex-col items-start gap-[18px]">
      <p className="m-0 text-texto-muted">
        Te enviamos un correo a <strong className="text-tinta">{correo}</strong> con los detalles, el enlace para cancelar
        o cambiar tu cita y la invitación para agregarla a tu calendario. Si hablas con el negocio, menciona tu código de
        reserva.
      </p>
      <dl className="m-0 grid w-full grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-3">
        {datos.map((d) => (
          <div key={d.etiqueta} className="flex flex-col gap-1 rounded-2xl bg-fondo p-4">
            <dt className="text-xs font-bold tracking-[0.08em] text-texto-muted uppercase">{d.etiqueta}</dt>
            <dd className={`m-0 font-bold break-words first-letter:uppercase ${d.codigo ? "font-codigo text-lg tracking-wide" : ""}`}>
              {d.valor}
            </dd>
          </div>
        ))}
      </dl>
      <button type="button" className={claseBoton("secundario")} onClick={alReservarOtra}>
        Reservar otra cita
      </button>
    </div>
  );
}
