import { formatearFechaHora, formatearFechaLocal } from "@/dominio/formato";
import type { EstadoEfectivo as Efectivo, EstadoSuscripcion } from "@/dominio/suscripcion";
import type { FechaLocal } from "@/dominio/tiempo";

// Estado de la suscripción en el admin (ADM-01, ADM-03; RN-31; ARCH §7.6). Las fechas
// van en la zona del negocio (ARCH §9, regla 3), y el estado se dice con texto, no solo
// con el color (RNF-03).

export const ESTADOS_SUSCRIPCION: Record<EstadoSuscripcion, string> = {
  prueba: "Prueba",
  activa: "Activa",
  suspendida: "Suspendida",
};

/** Vencimiento como fecha local inclusiva, o una raya si no tiene. */
export function Vencimiento({ fecha }: { fecha: FechaLocal | null }) {
  return <>{fecha ? formatearFechaLocal(fecha) : "—"}</>;
}

/** Estado efectivo: al día, en gracia (con la fecha en que se suspende) o suspendido. */
export function EstadoEfectivo({ estado, zonaHoraria }: { estado: Efectivo; zonaHoraria: string }) {
  if (estado.estado === "al_dia") return <span className="text-emerald-700 dark:text-emerald-400">Al día</span>;
  if (estado.estado === "suspendida") {
    return <span className="font-medium text-red-700 dark:text-red-400">Suspendido</span>;
  }
  return (
    <span className="text-amber-700 dark:text-amber-400">
      En gracia: se suspende el {formatearFechaHora(estado.suspendeEn, zonaHoraria)}
    </span>
  );
}
