import type { Contacto } from "@/dominio/contactos";
import { Tarjeta } from "@/componentes/tarjeta";
import { TarjetaContacto } from "./tarjeta-contacto";

// Los estados de la página pública en que no se puede reservar, con los contactos del
// negocio para agendar por otro medio: negocio suspendido (PUB-07; RN-04) y sin
// horarios (F-05, paso 4). Textos de DESIGN §4.1 y §5.

export type EstadoSinReserva = "suspendida" | "sin_horarios";

const TEXTOS: Record<EstadoSinReserva, { titulo: string; texto: (nombre: string) => string }> = {
  suspendida: {
    titulo: "Reservas no disponibles",
    texto: (nombre) =>
      `Por ahora no es posible reservar en línea en ${nombre}. Para agendar o cambiar una cita, comunícate directamente con el negocio.`,
  },
  sin_horarios: {
    titulo: "Aún no hay horarios disponibles",
    texto: (nombre) =>
      `Estamos preparando la agenda en línea de ${nombre}. Mientras tanto, puedes escribirnos o llamarnos para agendar.`,
  },
};

const ICONOS: Record<EstadoSinReserva, React.ReactNode> = {
  suspendida: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4M10 14l4 4M14 14l-4 4" />
    </>
  ),
  sin_horarios: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
};

export function EstadoPagina({
  estado,
  nombre,
  contactos,
  idTitulo = "estado-pagina",
}: {
  estado: EstadoSinReserva;
  nombre: string;
  contactos: readonly Contacto[];
  /** Para mover el foco al título cuando el estado aparece después de cargar (T4.27). */
  idTitulo?: string;
}) {
  const { titulo, texto } = TEXTOS[estado];
  return (
    <Tarjeta como="section" aria-labelledby={idTitulo} className="items-start sm:p-8">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-fondo-suave text-tinta-suave">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
          {ICONOS[estado]}
        </svg>
      </span>
      <h2 id={idTitulo} tabIndex={-1} className="text-[28px] leading-tight font-bold outline-none">
        {titulo}
      </h2>
      <p className="m-0 max-w-[600px] text-texto-muted">{texto(nombre)}</p>
      <TarjetaContacto contactos={contactos} className="w-full" />
    </Tarjeta>
  );
}
