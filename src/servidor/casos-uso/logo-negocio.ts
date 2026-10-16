import "server-only";
import { validarImagen, TAMANO_MAXIMO_IMAGEN } from "@/dominio/imagen";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import { borrarImagen, claveDeUrl, guardarImagen, urlDeImagen } from "@/servidor/archivos/imagenes";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { enTransaccion } from "@/servidor/db/cliente";
import * as negocios from "@/servidor/db/repositorios/negocios";

// Logo del negocio (PAN-11; ARCH §19.2; Q-21). La imagen va a R2 y `negocio.logo_url`
// guarda su ruta pública. R2 y la base no comparten transacción: si falla la escritura
// en la base, se borra la imagen recién subida; si sale bien, se borra la anterior.
// La Server Action ya llamó a `requireEscritura`.

/**
 * Valida el archivo (PNG, JPEG o WebP de hasta 512 KB, por su contenido), lo sube a
 * R2 y lo deja como logo. Devuelve la ruta nueva. Cualquier otra cosa devuelve
 * `DATOS_INVALIDOS` sin guardar nada.
 */
export async function subirLogo(
  ctx: Pick<ContextoMiembro, "negocioId">,
  archivo: unknown,
): Promise<Resultado<{ logoUrl: string }, "DATOS_INVALIDOS">> {
  // El tamaño se mira antes de leer el archivo, para no cargar en memoria uno enorme.
  if (!(archivo instanceof Blob) || archivo.size > TAMANO_MAXIMO_IMAGEN) return fallo("DATOS_INVALIDOS");
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const imagen = validarImagen(bytes);
  if (!imagen.ok) return fallo("DATOS_INVALIDOS");

  const clave = await guardarImagen(bytes, imagen.valor);
  const logoUrl = urlDeImagen(clave);
  let cambio: { anterior: string | null };
  try {
    cambio = await enTransaccion(async (tx) => {
      const resultado = await negocios.reemplazarLogo(ctx.negocioId, logoUrl, tx);
      if (!resultado) throw new Error(`No existe el negocio ${ctx.negocioId} del contexto.`);
      return resultado;
    });
  } catch (error) {
    await borrarSinFallar(ctx.negocioId, clave);
    throw error;
  }

  await borrarAnterior(ctx.negocioId, cambio.anterior);
  return exito({ logoUrl });
}

/** Deja el negocio sin logo y borra la imagen de R2. */
export async function quitarLogo(ctx: Pick<ContextoMiembro, "negocioId">): Promise<Resultado<void, never>> {
  const cambio = await enTransaccion(async (tx) => {
    const resultado = await negocios.reemplazarLogo(ctx.negocioId, null, tx);
    if (!resultado) throw new Error(`No existe el negocio ${ctx.negocioId} del contexto.`);
    return resultado;
  });
  await borrarAnterior(ctx.negocioId, cambio.anterior);
  return exito(undefined);
}

/** Borra el logo anterior, si era una imagen de R2 (no una ruta guardada a mano). */
async function borrarAnterior(negocioId: string, anterior: string | null) {
  const clave = anterior ? claveDeUrl(anterior) : null;
  if (clave) await borrarSinFallar(negocioId, clave);
}

/**
 * El cambio en la base ya está hecho, o ya falló por otra causa: si R2 no borra, la
 * imagen queda huérfana, pero el dueño no debe ver un error por eso. Se registra
 * para limpiarla después (ARCH §19.2: sin datos personales en el registro).
 */
async function borrarSinFallar(negocioId: string, clave: string) {
  try {
    await borrarImagen(clave);
  } catch (error) {
    console.error(
      JSON.stringify({
        evento: "imagen_no_borrada",
        negocioId,
        clave,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
