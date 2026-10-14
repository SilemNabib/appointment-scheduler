import "server-only";

// Autorización de la ruta interna del cron (ARCH §5 y §14.5): solo el manejador
// `scheduled` del Worker conoce `CRON_SECRET`.

/** Compara sin cortar en el primer byte distinto, para no filtrar el secreto por el tiempo de respuesta. */
function igualesEnTiempoConstante(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diferencia = 0;
  for (let i = 0; i < x.length; i++) diferencia |= x[i] ^ y[i];
  return diferencia === 0;
}

/** Si el encabezado es `Authorization: Bearer CRON_SECRET`. Sin secreto configurado, nadie pasa. */
export function esCronAutorizado(
  authorization: string | null,
  secreto: string | undefined = process.env.CRON_SECRET,
): boolean {
  if (!secreto || !authorization) return false;
  return igualesEnTiempoConstante(authorization, `Bearer ${secreto}`);
}
