import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ImagenValida, TipoImagen } from "@/dominio/imagen";

// Logos y fotos en R2 (ARCH §2, §19.2 y §21.2; Q-21). Cada imagen se guarda con un
// nombre aleatorio y la extensión del tipo que detectó `validarImagen`, nunca con el
// nombre del archivo original. El bucket no es público: la imagen se sirve desde el
// Worker en `/api/media/{clave}`, y esa ruta es la que se guarda en la base (por
// ejemplo, en `negocio.logo_url`).

const PREFIJO_URL = "/api/media/";

/** Clave aleatoria más la extensión: lo único que acepta la ruta pública. */
const FORMATO_CLAVE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

const TIPO_POR_EXTENSION: Record<ImagenValida["extension"], TipoImagen> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

const bucket = () => getCloudflareContext().env.MEDIA;

export function esClaveValida(clave: string): boolean {
  return FORMATO_CLAVE.test(clave);
}

/** Ruta pública de una imagen guardada. */
export function urlDeImagen(clave: string): string {
  return `${PREFIJO_URL}${clave}`;
}

/** Clave de una ruta de `urlDeImagen`, o `null` si la ruta no es de una imagen guardada aquí. */
export function claveDeUrl(url: string): string | null {
  if (!url.startsWith(PREFIJO_URL)) return null;
  const clave = url.slice(PREFIJO_URL.length);
  return esClaveValida(clave) ? clave : null;
}

/**
 * Guarda una imagen ya validada (`validarImagen`) y devuelve su clave. Quien llama
 * valida antes, para no subir nada que no sea PNG, JPEG o WebP de hasta 512 KB.
 */
export async function guardarImagen(bytes: Uint8Array, imagen: ImagenValida): Promise<string> {
  const clave = `${crypto.randomUUID()}.${imagen.extension}`;
  await bucket().put(clave, bytes, { httpMetadata: { contentType: imagen.tipo } });
  return clave;
}

/** Borra una imagen. Borrar una clave que no existe no es un error. */
export async function borrarImagen(clave: string): Promise<void> {
  await bucket().delete(clave);
}

/**
 * Imagen guardada, para servirla, o `null` si la clave no tiene el formato de
 * `guardarImagen` o no existe. El tipo sale de la extensión, que solo pueden ser las
 * tres admitidas.
 */
export async function leerImagen(clave: string) {
  if (!esClaveValida(clave)) return null;
  const objeto = await bucket().get(clave);
  if (!objeto) return null;
  const extension = clave.slice(clave.lastIndexOf(".") + 1) as ImagenValida["extension"];
  return {
    cuerpo: objeto.body,
    tipo: TIPO_POR_EXTENSION[extension],
    tamano: objeto.size,
    etag: objeto.httpEtag,
  };
}
