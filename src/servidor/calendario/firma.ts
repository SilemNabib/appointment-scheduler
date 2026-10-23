import "server-only";
import { firmar, verificarFirma } from "@/servidor/firmas";

// Token del enlace de calendario del dueño (RN-35; ADR-17, ARCH §14.7):
// `base64url(HMAC-SHA256(CALENDARIO_SECRET, "cal." + enlaceId))`. Como el de gestión
// (ARCH §13), no se guarda, así que el panel lo puede volver a mostrar cuando quiera;
// regenerar crea otro enlace y revoca el anterior. El secreto y el prefijo son
// distintos de los de gestión: un token de un link no sirve en el otro.

const mensaje = (enlaceId: string) => `cal.${enlaceId}`;

function secreto(): string {
  const valor = process.env.CALENDARIO_SECRET;
  if (!valor) throw new Error("Falta CALENDARIO_SECRET (ver .env.example).");
  return valor;
}

/** El token del enlace. Lanza si falta el secreto. */
export async function tokenDeCalendario(enlaceId: string): Promise<string> {
  return firmar(secreto(), mensaje(enlaceId));
}

/** Si el token es el del enlace. Lanza si falta el secreto: es configuración, no un enlace inválido. */
export async function verificarTokenDeCalendario(enlaceId: string, token: string): Promise<boolean> {
  return verificarFirma([secreto()], mensaje(enlaceId), token);
}

export type UrlsDeCalendario = {
  /** `{APP_URL}/api/calendario/{enlaceId}/{token}`, para "Desde URL" en Google Calendar. */
  https: string;
  /** La misma con el esquema `webcal://`, para Outlook y Apple. */
  webcal: string;
};

/** Las dos URL del enlace (ARCH §14.7). */
export async function urlsDeCalendario(enlaceId: string): Promise<UrlsDeCalendario> {
  const base = process.env.APP_URL;
  if (!base) throw new Error("Falta APP_URL (ver .env.example).");
  const https = new URL(`/api/calendario/${enlaceId}/${await tokenDeCalendario(enlaceId)}`, base).toString();
  return { https, webcal: https.replace(/^https?:\/\//, "webcal://") };
}
