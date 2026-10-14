// Estado efectivo de la suscripción (RN-04, RN-29, RN-31; ARCH §7.6, ADR-14).
// No basta con la columna `estado_suscripcion`: el estado se calcula en cada
// solicitud con el vencimiento y `ahora`, así la suspensión llega a tiempo aunque
// la tarea programada todavía no haya corrido.

/** Días de gracia después del vencimiento, con todas las funciones (D-13). */
export const DIAS_GRACIA = 3;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export type EstadoSuscripcion = "prueba" | "activa" | "suspendida";

export type EstadoEfectivo =
  | { estado: "al_dia" }
  | { estado: "en_gracia"; suspendeEn: Date }
  | { estado: "suspendida" };

export type DatosSuscripcion = {
  estadoSuscripcion: EstadoSuscripcion;
  finPrueba: Date | null;
  pagadoHasta: Date | null;
};

/**
 * Al día antes del vencimiento (fin de prueba o pagado hasta, según el estado); en
 * gracia desde el vencimiento y durante `DIAS_GRACIA` días; suspendida después, o
 * siempre que la columna ya diga `suspendida` (RN-04).
 */
export function estadoEfectivo(n: DatosSuscripcion, ahora: Date): EstadoEfectivo {
  if (n.estadoSuscripcion === "suspendida") return { estado: "suspendida" };
  const vence = n.estadoSuscripcion === "prueba" ? n.finPrueba : n.pagadoHasta;
  if (!vence) {
    // Los CHECK de `negocio` (ARCH §18.2) lo impiden: `prueba` exige `fin_prueba`
    // y `activa`, `pagado_hasta`.
    throw new Error(`Suscripción "${n.estadoSuscripcion}" sin fecha de vencimiento.`);
  }
  // Se suman días de 24 h: el vencimiento cae a las 00:00 locales y Colombia no
  // tiene horario de verano, así que también se suspende a las 00:00 locales.
  const suspendeEn = new Date(vence.getTime() + DIAS_GRACIA * MS_POR_DIA);
  if (ahora < vence) return { estado: "al_dia" };
  if (ahora < suspendeEn) return { estado: "en_gracia", suspendeEn };
  return { estado: "suspendida" };
}
