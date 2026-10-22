import { Badge, type TonoBadge } from "@/componentes/badge";
import type { EstadoCita } from "@/dominio/estados-cita";

// Badge del estado de una cita (DESIGN §3): "Confirmada", "Asistió", "No asistió" o
// "Cancelada". Siempre lleva el texto, así una cita cancelada se distingue por su badge
// y no solo por el color (RNF-03).

export const TEXTO_ESTADO: Record<EstadoCita, string> = {
  confirmada: "Confirmada",
  completada: "Asistió",
  no_asistio: "No asistió",
  cancelada: "Cancelada",
  pendiente_pago: "Pendiente de pago", // RN-12: ningún flujo del MVP llega aquí
};

const TONO: Record<EstadoCita, TonoBadge> = {
  confirmada: "neutro",
  completada: "exito",
  no_asistio: "aviso",
  cancelada: "error",
  pendiente_pago: "aviso",
};

export function BadgeEstadoCita({ estado, className }: { estado: EstadoCita; className?: string }) {
  return (
    <Badge tono={TONO[estado]} className={className}>
      {TEXTO_ESTADO[estado]}
    </Badge>
  );
}
