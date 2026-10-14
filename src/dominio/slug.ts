import { exito, fallo, type Resultado } from "./resultado";

// Slug de la URL pública de cada negocio (RN-02, ARCH §5).

/**
 * Slugs del sistema: rutas propias y nombres que se prevén para el sitio (ARCH §5).
 * Los nombres de archivo y `_next` no hacen falta: el formato ya los excluye.
 */
export const RESERVADOS: readonly string[] = [
  "admin",
  "api",
  "app",
  "ayuda",
  "blog",
  "cita",
  "citas",
  "contacto",
  "legal",
  "login",
  "logout",
  "panel",
  "planes",
  "precios",
  "privacidad",
  "registro",
  "sin-acceso",
  "soporte",
  "static",
  "status",
  "terminos",
  "www",
];

/** Igual que el `CHECK` de `negocio.slug` (ARCH §18.2). */
const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const LONGITUD_MINIMA_SLUG = 3;
export const LONGITUD_MAXIMA_SLUG = 40;

/** Por qué se rechaza un slug: el formato, o que lo usa el sistema. */
export type MotivoSlugInvalido = "formato" | "reservado";

/**
 * Valida el formato (solo `a-z`, `0-9` y guiones simples entre ellos, de 3 a 40
 * caracteres) y que no esté reservado. No normaliza: un slug con mayúsculas o
 * espacios es inválido. La unicidad la decide la base de datos.
 */
export function validarSlug(slug: string): Resultado<string, MotivoSlugInvalido> {
  if (
    slug.length < LONGITUD_MINIMA_SLUG ||
    slug.length > LONGITUD_MAXIMA_SLUG ||
    !FORMATO_SLUG.test(slug)
  ) {
    return fallo("formato");
  }
  if (RESERVADOS.includes(slug)) return fallo("reservado");
  return exito(slug);
}
