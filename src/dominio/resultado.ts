// Resultado de los casos de uso y errores de negocio (ARCH §18.4 y §18.5).
// Los casos de uso devuelven un `Resultado` en lugar de lanzar excepciones por
// errores de negocio. `ErrorNegocio` existe para los puntos donde lanzar es más
// natural (por ejemplo, `requireEscritura`): el envoltorio de las Server Actions
// lo convierte en `{ ok: false, error }`.

/** Códigos de error de la API y de las Server Actions (ARCH §18.4 y §18.5). */
export const CODIGOS_ERROR = [
  // Tabla de ARCH §18.5
  "DATOS_INVALIDOS",
  "NO_ENCONTRADO",
  "NEGOCIO_SUSPENDIDO",
  "BLOQUEO_CON_CITAS",
  "LIMITE_PLAN",
  "HORARIO_NO_DISPONIBLE",
  "FUERA_DE_PLAZO",
  "LIMITE_REPROGRAMACIONES",
  "ESTADO_INVALIDO",
  "DEMASIADAS_SOLICITUDES",
  // Solo en operaciones del panel o del admin (ARCH §18.4)
  "SLUG_NO_DISPONIBLE",
  "CONFLICTO_VERSION",
  "ANTES_DEL_INICIO",
  "FRANJAS_SOLAPADAS",
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number];

export type Resultado<T, E = CodigoError> =
  | { ok: true; valor: T }
  | { ok: false; error: E };

export function exito<T>(valor: T): Resultado<T, never> {
  return { ok: true, valor };
}

export function fallo<E>(error: E): Resultado<never, E> {
  return { ok: false, error };
}

/** Error de negocio que se lanza y se convierte en `{ ok: false, error: codigo }`. */
export class ErrorNegocio extends Error {
  readonly codigo: CodigoError;

  constructor(codigo: CodigoError, mensaje?: string) {
    super(mensaje ?? codigo);
    this.name = "ErrorNegocio";
    this.codigo = codigo;
  }
}
