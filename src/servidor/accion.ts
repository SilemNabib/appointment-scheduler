import "server-only";
import { ErrorNegocio, fallo, type CodigoError, type Fallo } from "@/dominio/resultado";

// Envoltorio de las Server Actions (ARCH §7.5 y §18.4). Los casos de uso devuelven
// un `Resultado`; los errores de negocio que se lanzan (como `NEGOCIO_SUSPENDIDO` de
// `requireEscritura`) se convierten aquí en `{ ok: false, error }`, con los mismos
// códigos que la API pública (§18.5).
//
// Cualquier otro error se relanza sin tocarlo. Eso incluye `redirect()` y
// `notFound()` de Next, que funcionan lanzando un error que Next debe recibir.
//
// Uso, en un archivo con "use server":
//   export const crearAlgo = accion(async (datos: FormData) => { … });

export function accion<Argumentos extends unknown[], R>(
  fn: (...argumentos: Argumentos) => Promise<R>,
): (...argumentos: Argumentos) => Promise<R | Fallo<CodigoError>> {
  return async (...argumentos) => {
    try {
      return await fn(...argumentos);
    } catch (error) {
      if (error instanceof ErrorNegocio) return fallo(error.codigo);
      throw error;
    }
  };
}
