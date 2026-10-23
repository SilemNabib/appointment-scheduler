import "server-only";

// Remitente y `reply_to` de los correos (ARCH §14.3; Q-63, Q-66, Q-77). Los correos de
// citas (C-01 a C-06) salen a nombre del negocio desde `CORREO_REMITENTE`, y sus
// respuestas van a su contacto. Los de la cuenta (C-07 y C-08) salen a nombre del
// producto desde `CORREO_CUENTA`, y sus respuestas van a soporte (S-16). Hasta la
// Fase 9, los dos remitentes son el de pruebas de Resend (Q-62).

function variable(nombre: "CORREO_REMITENTE" | "CORREO_CUENTA" | "CORREO_SOPORTE" | "NOMBRE_PRODUCTO"): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} (ver .env.example).`);
  return valor;
}

/**
 * `"{nombre}" <correo>`, con el nombre como *quoted-string* (RFC 5322 §3.2.4): escapa
 * `\` y `"`, y quita los saltos de línea y los demás caracteres de control, para que el
 * nombre de un negocio no pueda agregar encabezados.
 */
export function conNombre(nombre: string, correo: string): string {
  const limpio = nombre
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .replace(/[\\"]/g, (c) => `\\${c}`);
  return `"${limpio}" <${correo}>`;
}

/** El remitente de los correos de citas: `"{nombre del negocio}" <CORREO_REMITENTE>`. */
export function remitenteDeCitas(nombreNegocio: string): string {
  return conNombre(nombreNegocio, variable("CORREO_REMITENTE"));
}

/** Los correos de dónde se elige el `reply_to` de un correo de citas (Q-63). */
export type CorreosDelNegocio = {
  /** `negocio.correo_contacto`, que todavía no tiene pantalla. */
  correoContacto: string | null;
  /** Los contactos `correo` de la sede principal, en su orden (D-29). */
  correosDeLaSede: string[];
  /** El correo del miembro `dueno` (Q-28 de TASKS-03). */
  correoDueno: string | null;
};

/**
 * El `reply_to` de un correo de citas: el primero que exista de `correo_contacto`, el
 * primer contacto `correo` de la sede principal y el correo del dueño (Q-63). `null` si
 * no hay ninguno: las respuestas irían al remitente, que no se lee.
 */
export function responderADeCitas(c: CorreosDelNegocio): string | null {
  return c.correoContacto || c.correosDeLaSede.find(Boolean) || c.correoDueno || null;
}

/** El remitente y el `reply_to` de C-07 y C-08: `"{NOMBRE_PRODUCTO}" <CORREO_CUENTA>` y `CORREO_SOPORTE` (Q-66). */
export function remitenteDeCuenta(): { remitente: string; responderA: string } {
  return {
    remitente: conNombre(variable("NOMBRE_PRODUCTO"), variable("CORREO_CUENTA")),
    responderA: variable("CORREO_SOPORTE"),
  };
}

/** El nombre del producto, con que se firman C-07 y C-08 (Q-66). */
export function nombreProducto(): string {
  return variable("NOMBRE_PRODUCTO");
}
