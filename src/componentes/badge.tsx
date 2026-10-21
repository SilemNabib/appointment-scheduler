import type { ReactNode } from "react";

// Badge de estado (DESIGN §3): el estado de una cita, de la suscripción o de un aviso.
// Siempre lleva el texto del estado ("Confirmada", "En gracia"…): el tono solo lo
// acompaña (DESIGN §2.1).

export type TonoBadge = "exito" | "aviso" | "error" | "neutro" | "destaque";

const TONOS: Record<TonoBadge, string> = {
  exito: "bg-exito-fondo text-exito-texto",
  aviso: "bg-aviso-fondo text-aviso-texto",
  error: "bg-error-fondo text-error-texto",
  neutro: "bg-fondo-suave text-tinta-suave",
  destaque: "bg-lima text-tinta",
};

export function Badge({ tono, children, className }: { tono: TonoBadge; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${TONOS[tono]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
