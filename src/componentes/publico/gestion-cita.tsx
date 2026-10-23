import type { ReactNode } from "react";
import { Aviso } from "@/componentes/aviso";
import { ANILLO_FOCO } from "@/componentes/estilos";
import { BadgeEstadoCita } from "@/componentes/panel/estado-cita";
import { Tarjeta } from "@/componentes/tarjeta";
import { enlaceMapa, type Contacto } from "@/dominio/contactos";
import { formatearDiaLocal, formatearHora } from "@/dominio/formato";
import type { AccionesCliente, MotivoSinAccion } from "@/dominio/plazos";
import { fechaLocal } from "@/dominio/tiempo";
import type { CitaPorLink } from "@/servidor/casos-uso/gestion-cita";
import { TarjetaContacto } from "./tarjeta-contacto";

// Detalle de la cita en la página de gestión (GES-01, GES-04, GES-05; RN-03, D-14, D-28,
// D-29, D-30; DESIGN §3 y §4.2; Q-70): el código en monoespaciada, el estado, el servicio,
// la fecha y la hora en la zona del negocio y la dirección con "Cómo llegar". Sin
// historial (Q-70: prevalece el PRD). Debajo van `children`: las acciones (T6.23), que
// también muestran el mensaje de Q-70 con la tarjeta de contactos cuando el cliente no
// puede actuar (`mensajeSinAccion`).

/**
 * El texto de Q-70 para un motivo, o `null` si no lleva mensaje: con el límite en 0, el
 * link simplemente no ofrece reprogramar (RN-34). Nunca menciona la suscripción (Q-70).
 */
export function mensajeSinAccion(motivo: MotivoSinAccion, limite: number | null): string | null {
  switch (motivo) {
    case "cancelada":
      return "Esta cita fue cancelada.";
    case "pasada":
      return "Esta cita ya pasó.";
    case "negocio_suspendido":
      return "Por ahora no puedes hacer cambios por aquí. Para cambios, comunícate con el negocio.";
    case "fuera_de_plazo":
      return "Ya no puedes cancelar ni reprogramar por aquí. Para cambios, comunícate con el negocio.";
    case "sin_reprogramaciones":
      return `Ya reprogramaste esta cita ${limite ?? 0} ${limite === 1 ? "vez" : "veces"}. Para otro cambio, comunícate con el negocio.`;
    case "estado_invalido":
      return "Esta cita no admite cambios por aquí. Para cambios, comunícate con el negocio.";
    case "reprogramar_no_permitido":
      return null;
  }
}

/**
 * El motivo que la página explica: el que bloquea las dos acciones o, si se puede
 * cancelar, el que impide reprogramar.
 */
export function motivoVisible(acciones: AccionesCliente): MotivoSinAccion | null {
  if (!acciones.cancelar.permitida) return acciones.cancelar.motivo;
  if (!acciones.reprogramar.permitida) return acciones.reprogramar.motivo;
  return null;
}

const conMayuscula = (texto: string) => texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1);

function Dato({ etiqueta, children, codigo = false }: { etiqueta: string; children: ReactNode; codigo?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl bg-fondo p-4">
      <dt className="text-xs font-bold tracking-[0.08em] text-texto-muted uppercase">{etiqueta}</dt>
      <dd className={`m-0 font-bold break-words ${codigo ? "font-codigo text-lg tracking-wide" : ""}`}>{children}</dd>
    </div>
  );
}

export function DetalleGestion({ datos, children }: { datos: Pick<CitaPorLink, "cita" | "marca">; children?: ReactNode }) {
  const { cita, marca } = datos;
  const zona = marca.zonaHoraria;

  return (
    <Tarjeta como="section" aria-labelledby="titulo-cita">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-cita" className="m-0 text-2xl font-bold tracking-[-0.02em]">
          Tu cita
        </h2>
        <BadgeEstadoCita estado={cita.estado} />
      </div>

      <dl className="m-0 grid w-full grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
        <Dato etiqueta="Código de reserva" codigo>
          {cita.codigo}
        </Dato>
        <Dato etiqueta="Servicio">{cita.servicio}</Dato>
        <Dato etiqueta="Fecha">{conMayuscula(formatearDiaLocal(fechaLocal(cita.inicio, zona), true))}</Dato>
        <Dato etiqueta="Hora">{`${formatearHora(cita.inicio, zona)} – ${formatearHora(cita.fin, zona)}`}</Dato>
        {cita.direccion && (
          <Dato etiqueta="Dirección">
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span>{cita.direccion}</span>
              <a
                href={enlaceMapa(cita.direccion)}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex min-h-11 items-center text-sm font-bold text-acento-texto underline ${ANILLO_FOCO}`}
              >
                Cómo llegar<span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            </span>
          </Dato>
        )}
      </dl>

      {children}
    </Tarjeta>
  );
}

/** El mensaje de Q-70 con la tarjeta de contactos del negocio (GES-04, GES-05; D-29). */
export function AvisoConContactos({ mensaje, contactos }: { mensaje: string; contactos: readonly Contacto[] }) {
  return (
    <div className="flex flex-col gap-3">
      <Aviso tipo="info">{mensaje}</Aviso>
      <TarjetaContacto contactos={contactos} />
    </div>
  );
}
