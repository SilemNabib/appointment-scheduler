// Máquina de estados de la cita (PRD §7; RN-12, RN-14, RN-16, S-08, S-09; ARCH §4 y
// §18.3). Dice qué estados se pueden cancelar, mover y marcar, y qué evento de
// `evento_cita` deja cada cambio (Q-55). La base de datos lo hace cumplir con
// `UPDATE … WHERE estado = <esperado>` (ARCH §18.4); aquí se decide qué se intenta.

/** Los valores del enum `estado_cita` (ARCH §18.2). */
export const ESTADOS_CITA = ["pendiente_pago", "confirmada", "completada", "cancelada", "no_asistio"] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];

/** Los valores de `evento_cita.tipo` (ARCH §18.2). */
export const TIPOS_EVENTO = [
  "creada",
  "reprogramada",
  "cancelada",
  "completada",
  "no_asistio",
  "estado_corregido",
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/** Los dos resultados de la asistencia que marca el dueño (PAN-07, F-08). */
export const ESTADOS_ASISTENCIA = ["completada", "no_asistio"] as const;
export type EstadoAsistencia = (typeof ESTADOS_ASISTENCIA)[number];

/** Si el valor es uno de los estados de la asistencia. */
export function esEstadoAsistencia(valor: unknown): valor is EstadoAsistencia {
  return (ESTADOS_ASISTENCIA as readonly unknown[]).includes(valor);
}

/**
 * Transiciones válidas de PRD §7, con el evento que deja cada una (Q-55):
 *
 * - `confirmada` a sí misma es el cambio de hora (RN-14): `reprogramada`.
 * - `completada` y `no_asistio` se corrigen entre sí (S-09): `estado_corregido`.
 * - Desde `cancelada`, ninguna: se crea una cita nueva (S-08).
 * - Ningún flujo del MVP llega a `pendiente_pago` ni sale de él (RN-12): sus
 *   transiciones (pago recibido o vencido) llegan con el módulo de pagos.
 */
const TRANSICIONES: Partial<Record<EstadoCita, Partial<Record<EstadoCita, TipoEvento>>>> = {
  confirmada: {
    confirmada: "reprogramada",
    cancelada: "cancelada",
    completada: "completada",
    no_asistio: "no_asistio",
  },
  completada: { no_asistio: "estado_corregido" },
  no_asistio: { completada: "estado_corregido" },
};

/** El tipo de evento que deja pasar de `de` a `a`, o `null` si PRD §7 no lo permite. */
export function eventoDeTransicion(de: EstadoCita, a: EstadoCita): TipoEvento | null {
  return TRANSICIONES[de]?.[a] ?? null;
}

/** Solo se cancela una cita `confirmada`, aunque ya haya empezado (PAN-06; Q-55). */
export function sePuedeCancelar(estado: EstadoCita): boolean {
  return eventoDeTransicion(estado, "cancelada") !== null;
}

/**
 * Solo se mueve una cita `confirmada`, aunque ya haya empezado (PAN-05; Q-55). Una
 * `completada` o `no_asistio` no se mueve: se corrige su asistencia.
 */
export function sePuedeMover(estado: EstadoCita): boolean {
  return eventoDeTransicion(estado, estado) === "reprogramada";
}

/**
 * Se marca la asistencia de una cita `confirmada` y se corrige la de una `completada` o
 * `no_asistio` (PAN-07, S-09). La regla del instante del inicio está en `plazos.ts` (RN-16).
 */
export function sePuedeMarcar(estado: EstadoCita): boolean {
  return ESTADOS_ASISTENCIA.some((a) => eventoDeTransicion(estado, a) !== null);
}
