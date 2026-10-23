// Plazos de las acciones sobre una cita (RN-13, RN-16, RN-34; ARCH §4 y §18.3). Son
// comparaciones de instantes con el `ahora` inyectado: no dependen de ninguna zona
// horaria (RN-03). `accionesDelCliente` decide qué ofrece la página de gestión y qué
// aceptan las operaciones del cliente, para que lo que no se ofrece tampoco se pueda
// hacer (Q-69), igual que el motor decide qué horas se listan y cuáles se reservan.

import type { EstadoCita } from "./estados-cita";
import type { CodigoError } from "./resultado";
import type { EstadoEfectivo } from "./suscripcion";

const MS_POR_HORA = 60 * 60 * 1000;

/**
 * RN-16: el dueño marca la asistencia desde el instante del inicio (`ahora ≥ inicio`),
 * nunca antes. El borde está incluido (ARCH §20: "en el instante exacto del borde").
 */
export function puedeMarcarAsistencia(inicio: Date, ahora: Date): boolean {
  return ahora.getTime() >= inicio.getTime();
}

/**
 * RN-13: el cliente cancela o reprograma mientras `ahora ≤ inicio − plazo`, con el borde
 * incluido (ARCH §20). Un plazo de 0 horas llega hasta el inicio.
 */
export function dentroDelPlazo(inicio: Date, plazoHoras: number, ahora: Date): boolean {
  return ahora.getTime() <= inicio.getTime() - plazoHoras * MS_POR_HORA;
}

/** RN-34: las reprogramaciones que le quedan al cliente, o `null` si no hay límite. */
export function reprogramacionesRestantes(hechas: number, limite: number | null): number | null {
  return limite === null ? null : Math.max(0, limite - hechas);
}

/**
 * Por qué el cliente no puede hacer una acción. La página de gestión elige con él su
 * mensaje (Q-70):
 *
 * - `cancelada`: "Esta cita fue cancelada.";
 * - `pasada`: la cita empezó, o está `completada` o `no_asistio` (Q-69): "Esta cita ya pasó.";
 * - `estado_invalido`: un estado que ningún flujo del MVP alcanza (`pendiente_pago`, RN-12);
 * - `negocio_suspendido`: "Por ahora no puedes hacer cambios por aquí…" (D-14);
 * - `fuera_de_plazo`: "Ya no puedes cancelar ni reprogramar por aquí…" (RN-13);
 * - `sin_reprogramaciones`: llegó al límite: "Ya reprogramaste esta cita {n} veces…" (RN-34);
 * - `reprogramar_no_permitido`: el límite es 0, así que no se ofrece reprogramar (RN-34).
 */
export type MotivoSinAccion =
  | "cancelada"
  | "pasada"
  | "estado_invalido"
  | "negocio_suspendido"
  | "fuera_de_plazo"
  | "sin_reprogramaciones"
  | "reprogramar_no_permitido";

/** Una acción permitida o, si no, su motivo y el error con que el servidor la rechaza (ARCH §18.5). */
export type Accion = { permitida: true } | { permitida: false; motivo: MotivoSinAccion; error: CodigoError };

export type AccionesCliente = {
  cancelar: Accion;
  reprogramar: Accion;
  /** RN-34: `null` si el negocio no tiene límite. */
  reprogramacionesRestantes: number | null;
};

export type CitaDelCliente = { estado: EstadoCita; inicio: Date; reprogramacionesCliente: number };

/** Las reglas del negocio que aplican al cliente (PAN-15). */
export type ReglasDelCliente = {
  plazoCancelacionHoras: number;
  /** `null` = sin límite; 0 = no se permite reprogramar (RN-34). */
  maxReprogramacionesCliente: number | null;
};

const PERMITIDA: Accion = { permitida: true };

const sinAccion = (motivo: MotivoSinAccion, error: CodigoError): Accion => ({ permitida: false, motivo, error });

/** Lo que bloquea las dos acciones a la vez, o `null` si la cita admite alguna. */
function bloqueoComun(cita: CitaDelCliente, reglas: ReglasDelCliente, suscripcion: EstadoEfectivo, ahora: Date): Accion | null {
  // Primero lo que es de la cita y no cambia: su estado y si ya empezó (F-02, paso 6).
  if (cita.estado === "cancelada") return sinAccion("cancelada", "ESTADO_INVALIDO");
  if (cita.estado === "completada" || cita.estado === "no_asistio") return sinAccion("pasada", "ESTADO_INVALIDO");
  if (cita.estado !== "confirmada") return sinAccion("estado_invalido", "ESTADO_INVALIDO");
  if (ahora.getTime() >= cita.inicio.getTime()) return sinAccion("pasada", "FUERA_DE_PLAZO");
  // Después, lo que podría cambiar: la suscripción (D-14) y el plazo (RN-13).
  if (suscripcion.estado === "suspendida") return sinAccion("negocio_suspendido", "NEGOCIO_SUSPENDIDO");
  if (!dentroDelPlazo(cita.inicio, reglas.plazoCancelacionHoras, ahora)) {
    return sinAccion("fuera_de_plazo", "FUERA_DE_PLAZO");
  }
  return null;
}

/**
 * Si el cliente puede cancelar y reprogramar la cita (GES-02 a GES-05; F-02, F-03; Q-69):
 * las dos, si está `confirmada`, no ha empezado, el negocio no está suspendido y
 * `ahora ≤ inicio − plazo`; reprogramar, además, si le quedan reprogramaciones (RN-34).
 * Al llegar al límite, cancelar sigue disponible dentro del plazo.
 */
export function accionesDelCliente(
  cita: CitaDelCliente,
  reglas: ReglasDelCliente,
  suscripcion: EstadoEfectivo,
  ahora: Date,
): AccionesCliente {
  const restantes = reprogramacionesRestantes(cita.reprogramacionesCliente, reglas.maxReprogramacionesCliente);
  const comun = bloqueoComun(cita, reglas, suscripcion, ahora);
  if (comun) return { cancelar: comun, reprogramar: comun, reprogramacionesRestantes: restantes };

  let reprogramar = PERMITIDA;
  if (reglas.maxReprogramacionesCliente === 0) {
    reprogramar = sinAccion("reprogramar_no_permitido", "LIMITE_REPROGRAMACIONES");
  } else if (restantes === 0) {
    reprogramar = sinAccion("sin_reprogramaciones", "LIMITE_REPROGRAMACIONES");
  }
  return { cancelar: PERMITIDA, reprogramar, reprogramacionesRestantes: restantes };
}
