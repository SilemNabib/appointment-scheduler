// Revalidación de un envío (RN-04, RN-20, RN-21, D-14, S-16; ARCH §14.1 y §14.3, paso 1;
// Q-67). Antes de enviar una notificación reclamada, se decide con los datos actuales si
// todavía corresponde: si no, se anula (`cancelada`) con su motivo en `ultimo_error`.
// Las notificaciones aún no vencidas siguen `pendiente`: si el negocio se reactiva antes
// de su hora, salen con normalidad.

import type { EstadoCita } from "./estados-cita";
import type { EstadoEfectivo } from "./suscripcion";

/** Los valores del enum `tipo_notificacion` (ARCH §14.1 y §18.2). */
export const TIPOS_NOTIFICACION = [
  "confirmacion", // C-01
  "recordatorio", // C-02
  "cancelacion", // C-03
  "reprogramacion", // C-04
  "dueno_cita_nueva", // C-05
  "dueno_cambio", // C-06
  "dueno_gracia", // C-07
  "dueno_suspension", // C-08
  "empleado_cita_nueva", // C-09 (módulo de empleados)
  "empleado_cambio", // C-10 (módulo de empleados)
] as const;
export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];

/**
 * Los correos de la cuenta (C-07 y C-08; S-16): no tienen cita, salen a nombre del
 * producto y no cuentan para `max_emails_per_month` (ARCH §14.1). Los demás son correos
 * de citas.
 */
export function esCorreoDeCuenta(tipo: TipoNotificacion): boolean {
  return tipo === "dueno_gracia" || tipo === "dueno_suspension";
}

/** El motivo de una anulación, que queda en `ultimo_error` (Q-67). */
export type MotivoAnulacion =
  /** Un correo de citas con el negocio suspendido (D-14). */
  | "NEGOCIO_SUSPENDIDO"
  /** C-02 o C-04 de una cita que ya no está `confirmada`. */
  | "CITA_NO_CONFIRMADA"
  /** C-01 de una cita ya cancelada (Q-67). */
  | "CITA_CANCELADA"
  /** C-02 de otra versión, o C-04 de una versión anterior: lo reemplaza el siguiente. */
  | "VERSION_ANTERIOR"
  /** C-02 o C-04 sin `version` en `datos`: no se puede saber si sigue vigente. */
  | "SIN_VERSION"
  /** Un correo de citas cuya cita ya no existe. */
  | "CITA_INEXISTENTE"
  /** C-07 de un negocio que ya no está en gracia: pagó o ya fue suspendido. */
  | "NEGOCIO_NO_EN_GRACIA"
  /** C-08 de un negocio que se reactivó antes del envío. */
  | "NEGOCIO_NO_SUSPENDIDO";

export type DecisionEnvio = { enviar: true } | { enviar: false; ultimoError: MotivoAnulacion };

export type NotificacionAValidar = {
  tipo: TipoNotificacion;
  /** `notificacion.datos`, por ejemplo `{ version: 2 }` (ARCH §14.1). */
  datos: unknown;
};

/** El estado y la versión actuales de la cita; `null` en los correos de la cuenta. */
export type CitaActual = { estado: EstadoCita; version: number } | null;

const ENVIAR: DecisionEnvio = { enviar: true };
const anular = (ultimoError: MotivoAnulacion): DecisionEnvio => ({ enviar: false, ultimoError });

/** `datos.version`, si es un entero. */
function versionDe(datos: unknown): number | null {
  if (typeof datos !== "object" || datos === null) return null;
  const version = (datos as { version?: unknown }).version;
  return Number.isInteger(version) ? (version as number) : null;
}

/**
 * Si la notificación todavía se envía (ARCH §14.3, paso 1; Q-67):
 *
 * - todo correo de citas se anula con el negocio suspendido (D-14);
 * - C-02 se anula si la cita ya no está `confirmada` o si su versión no es la de `datos`;
 * - C-01 se anula si la cita ya está cancelada;
 * - C-04 se anula si la cita ya no está `confirmada` o si su versión es mayor que la de
 *   `datos`, porque el C-04 o el C-03 siguiente lo reemplaza;
 * - C-07 se anula si el negocio ya no está en gracia, y C-08, si ya no está suspendido;
 * - C-03, C-05 y C-06 siempre salen, salvo con el negocio suspendido.
 */
export function decidirEnvio(n: NotificacionAValidar, cita: CitaActual, suscripcion: EstadoEfectivo): DecisionEnvio {
  if (n.tipo === "dueno_gracia") return suscripcion.estado === "en_gracia" ? ENVIAR : anular("NEGOCIO_NO_EN_GRACIA");
  if (n.tipo === "dueno_suspension") return suscripcion.estado === "suspendida" ? ENVIAR : anular("NEGOCIO_NO_SUSPENDIDO");

  if (suscripcion.estado === "suspendida") return anular("NEGOCIO_SUSPENDIDO");
  if (!cita) return anular("CITA_INEXISTENTE");

  switch (n.tipo) {
    case "confirmacion":
      return cita.estado === "cancelada" ? anular("CITA_CANCELADA") : ENVIAR;
    case "recordatorio": {
      if (cita.estado !== "confirmada") return anular("CITA_NO_CONFIRMADA");
      const version = versionDe(n.datos);
      if (version === null) return anular("SIN_VERSION");
      return cita.version === version ? ENVIAR : anular("VERSION_ANTERIOR");
    }
    case "reprogramacion": {
      if (cita.estado !== "confirmada") return anular("CITA_NO_CONFIRMADA");
      const version = versionDe(n.datos);
      if (version === null) return anular("SIN_VERSION");
      return cita.version > version ? anular("VERSION_ANTERIOR") : ENVIAR;
    }
    default:
      return ENVIAR;
  }
}
