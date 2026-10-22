// Código de reserva (D-28; ARCH §11.4; Q-41): identifica la cita al hablar con el
// negocio. No es una credencial: la gestión sigue exigiendo el link firmado (ARCH §13).

/** Igual que el `CHECK` de `cita.codigo` (ARCH §18.2). */
export const FORMATO_CODIGO = /^[A-Z]{2}-[0-9]{4,6}$/;

/** Dígitos del código normal, y los que se usan después de 5 choques (Q-41). */
export const DIGITOS_CODIGO = 4;
export const DIGITOS_CODIGO_LARGO = 6;

/** Prefijo de un nombre sin letras. */
const PREFIJO_SIN_LETRAS = "XX";

/**
 * Entero al azar en `[0, maximo)`. Llega como parámetro para que el dominio siga siendo
 * puro (ARCH §4): el servidor usa `crypto.getRandomValues`, y las pruebas, un valor fijo.
 */
export type Azar = (maximo: number) => number;

/**
 * Dos letras del nombre del negocio: las iniciales de sus dos primeras palabras o, si
 * hay una sola, sus dos primeras letras. Sin tildes y en mayúsculas ("Óptica Visión
 * Clara" da `OV`; "Ébano", `EB`). Un nombre sin letras da `XX`, y una palabra de una sola
 * letra se completa con `X`.
 */
export function prefijoCodigo(nombre: string): string {
  const palabras = nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
  if (palabras.length === 0) return PREFIJO_SIN_LETRAS;
  const letras = palabras.length === 1 ? palabras[0].slice(0, 2) : palabras[0][0] + palabras[1][0];
  return letras.padEnd(2, "X");
}

/** Código `AA-0000` (o `AA-000000` con 6 dígitos) con el prefijo y un número al azar (Q-41). */
export function generarCodigo(prefijo: string, azar: Azar, digitos: number = DIGITOS_CODIGO): string {
  const numero = azar(10 ** digitos);
  return `${prefijo}-${String(numero).padStart(digitos, "0")}`;
}

/** Un código como lo escribe una persona: dos letras y de 4 a 6 dígitos, con guion, espacio o nada entre ellos. */
const CODIGO_ESCRITO = /^([A-Z]{2})[-\s]?([0-9]{4,6})$/;

/**
 * El código que el dueño escribe en "Buscar por código" (Q-59), como se guarda: recorta,
 * pasa a mayúsculas y agrega el guion si falta (" ov-4821 " y "OV4821" dan `OV-4821`).
 * `null` si no puede ser un código (Q-41): así se rechaza sin consultar la base.
 */
export function normalizarCodigo(texto: string): string | null {
  const m = CODIGO_ESCRITO.exec(texto.trim().toUpperCase());
  return m ? `${m[1]}-${m[2]}` : null;
}
