// Ayudantes para probar código que llama a `redirect()` o `notFound()` de Next.
// Las dos funciones lanzan un error con un `digest` que Next reconoce:
// `NEXT_REDIRECT;<tipo>;<url>;<estado>;` y `NEXT_HTTP_ERROR_FALLBACK;404`.

function digestDe(error: unknown): string | undefined {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" ? digest : undefined;
}

/** URL a la que redirige un error de `redirect()`, o `undefined` si no lo es. */
export function destinoDeRedireccion(error: unknown): string | undefined {
  const digest = digestDe(error);
  if (!digest?.startsWith("NEXT_REDIRECT;")) return undefined;
  return digest.split(";").slice(2, -2).join(";");
}

/** Si el error es el de `notFound()`. */
export function esNoEncontrado(error: unknown): boolean {
  return digestDe(error) === "NEXT_HTTP_ERROR_FALLBACK;404";
}

/** Espera que la promesa falle y devuelve el error. */
export async function errorDe(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba que la promesa fallara.");
}
