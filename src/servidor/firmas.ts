import "server-only";

// Firmas HMAC-SHA256 en base64url (ADR-09; ARCH §13 y §14.7). Los links de gestión y los
// enlaces de calendario no guardan su token: se deriva del id con un secreto, y se
// verifica con `crypto.subtle.verify`, que compara en tiempo constante.

/** 32 bytes de HMAC-SHA256 en base64url sin relleno: 43 caracteres (256 bits). */
const LARGO_TOKEN = 43;
const FORMATO_TOKEN = /^[A-Za-z0-9_-]+$/;

function clave(secreto: string, uso: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, [
    uso,
  ]);
}

function aBase64url(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Los bytes del token, o `null` si no puede ser una firma. Se exige la codificación
 * canónica: el último carácter de 43 lleva 2 bits que `atob` descarta, así que un token
 * con ese carácter cambiado decodificaría a los mismos bytes y pasaría la verificación.
 */
function deBase64url(token: string): Uint8Array<ArrayBuffer> | null {
  if (token.length !== LARGO_TOKEN || !FORMATO_TOKEN.test(token)) return null;
  const binario = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return aBase64url(bytes) === token ? bytes : null;
}

/** `base64url(HMAC-SHA256(secreto, mensaje))`. */
export async function firmar(secreto: string, mensaje: string): Promise<string> {
  const firma = await crypto.subtle.sign("HMAC", await clave(secreto, "sign"), new TextEncoder().encode(mensaje));
  return aBase64url(new Uint8Array(firma));
}

/**
 * Si `token` es la firma de `mensaje` con alguno de los secretos (el actual y, durante
 * una rotación, el anterior; ARCH §13). Los secretos vacíos no cuentan.
 */
export async function verificarFirma(secretos: readonly (string | undefined)[], mensaje: string, token: string): Promise<boolean> {
  const firma = deBase64url(token);
  if (!firma) return false;
  const datos = new TextEncoder().encode(mensaje);
  for (const secreto of secretos) {
    if (secreto && (await crypto.subtle.verify("HMAC", await clave(secreto, "verify"), firma, datos))) return true;
  }
  return false;
}
