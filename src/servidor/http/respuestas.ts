import "server-only";
import type { CodigoError, Fallo, Resultado } from "@/dominio/resultado";
import { CAMPOS_RESERVA } from "@/servidor/casos-uso/reservar-cita";

// Respuestas JSON de la API pública (ARCH §18.5). Los errores salen con el formato
// `{ "error": { "codigo", "mensaje" } }` (y `campos` en DATOS_INVALIDOS de la reserva, Q-46)
// y el estado HTTP de la tabla de §18.5. Los
// mensajes están en español (RNF-02) y, donde el PRD tiene un texto, son ese texto.
// Nunca llevan datos del cliente ni detalles internos (ARCH §19.2).

/** Los códigos de la tabla de ARCH §18.5: los que puede devolver la API pública. */
export type CodigoPublico = Extract<
  CodigoError,
  | "DATOS_INVALIDOS"
  | "NO_ENCONTRADO"
  | "NEGOCIO_SUSPENDIDO"
  | "BLOQUEO_CON_CITAS"
  | "LIMITE_PLAN"
  | "HORARIO_NO_DISPONIBLE"
  | "FUERA_DE_PLAZO"
  | "LIMITE_REPROGRAMACIONES"
  | "ESTADO_INVALIDO"
  | "DEMASIADAS_SOLICITUDES"
>;

export const ERRORES_PUBLICOS: Record<CodigoPublico, { estado: number; mensaje: string }> = {
  DATOS_INVALIDOS: { estado: 422, mensaje: "Revisa los datos e intenta de nuevo." },
  NO_ENCONTRADO: { estado: 404, mensaje: "No encontrado." }, // RN-01, RN-13
  NEGOCIO_SUSPENDIDO: { estado: 403, mensaje: "Reservas no disponibles." }, // PUB-07
  BLOQUEO_CON_CITAS: { estado: 409, mensaje: "Hay citas confirmadas en ese horario: muévelas o cancélalas primero." }, // F-09
  LIMITE_PLAN: { estado: 403, mensaje: "Se alcanzó el límite del plan." }, // RN-25
  HORARIO_NO_DISPONIBLE: { estado: 409, mensaje: "Esa hora se acaba de ocupar." }, // ARCH §18.5
  FUERA_DE_PLAZO: { estado: 409, mensaje: "Para cambios, comunícate con el negocio." }, // F-02
  LIMITE_REPROGRAMACIONES: {
    estado: 409,
    mensaje: "Ya reprogramaste esta cita el máximo de veces. Para otro cambio, comunícate con el negocio.", // RN-34
  },
  ESTADO_INVALIDO: { estado: 409, mensaje: "Esta cita ya no admite ese cambio." },
  DEMASIADAS_SOLICITUDES: { estado: 429, mensaje: "Demasiadas solicitudes. Intenta en un minuto." }, // F-01, RN-23
};

/** Las respuestas de la API dependen de la agenda en ese momento: no se guardan en caché. */
const ENCABEZADOS = { "Cache-Control": "no-store" };

export function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return Response.json(cuerpo, { status: estado, headers: ENCABEZADOS });
}

/**
 * Solo el código y su mensaje fijo: nada de lo que llegó en la solicitud ni del error
 * interno. `DATOS_INVALIDOS` puede llevar `campos`: solo nombres de `CAMPOS_RESERVA`, sin
 * repetidos (Q-46); si no queda ninguno, no lleva la clave.
 */
export function respuestaError(codigo: CodigoPublico, campos?: readonly unknown[]): Response {
  const { estado, mensaje } = ERRORES_PUBLICOS[codigo];
  const validos =
    codigo === "DATOS_INVALIDOS" && campos
      ? CAMPOS_RESERVA.filter((c) => campos.includes(c))
      : [];
  return respuestaJson({ error: { codigo, mensaje, ...(validos.length > 0 ? { campos: validos } : {}) } }, estado);
}

/** El `Resultado` de un caso de uso público: el valor con `estadoExito`, o el error de §18.5. */
export function responder<T>(
  resultado: Resultado<T, CodigoPublico> | (Fallo<CodigoPublico> & { campos?: readonly string[] }),
  estadoExito = 200,
): Response {
  if (resultado.ok) return respuestaJson(resultado.valor, estadoExito);
  const campos = "campos" in resultado && Array.isArray(resultado.campos) ? resultado.campos : undefined;
  return respuestaError(resultado.error, campos);
}
