import "server-only";
import { firmar, verificarFirma } from "@/servidor/firmas";

// Token del link de gestión de una cita (RN-13; ADR-09, ARCH §13):
// `base64url(HMAC-SHA256(GESTION_CITA_SECRET, "{citaId}.{token_version}"))`. No se guarda:
// el correo lo vuelve a derivar cada vez, y subir `token_version` invalida los links
// anteriores. Durante una rotación también se acepta `GESTION_CITA_SECRET_ANTERIOR`.

export type CitaFirmable = { id: string; tokenVersion: number };

const mensaje = (cita: CitaFirmable) => `${cita.id}.${cita.tokenVersion}`;

function secretoActual(): string {
  const secreto = process.env.GESTION_CITA_SECRET;
  if (!secreto) throw new Error("Falta GESTION_CITA_SECRET (ver .env.example).");
  return secreto;
}

/** El token de la cita con su `token_version` actual. Lanza si falta el secreto. */
export async function tokenDeGestion(cita: CitaFirmable): Promise<string> {
  return firmar(secretoActual(), mensaje(cita));
}

/**
 * Si el token es el de la cita con su `token_version`, firmado con el secreto actual o
 * con el anterior mientras exista (rotación). Lanza si falta el secreto actual: es un
 * error de configuración, no un link inválido.
 */
export async function verificarTokenDeGestion(cita: CitaFirmable, token: string): Promise<boolean> {
  return verificarFirma([secretoActual(), process.env.GESTION_CITA_SECRET_ANTERIOR], mensaje(cita), token);
}

/** `{APP_URL}/{slug}/cita/{citaId}/{token}`: el link que llevan C-01, C-02 y C-04. */
export async function urlDeGestion(slug: string, cita: CitaFirmable): Promise<string> {
  const base = process.env.APP_URL;
  if (!base) throw new Error("Falta APP_URL (ver .env.example).");
  return new URL(`/${slug}/cita/${cita.id}/${await tokenDeGestion(cita)}`, base).toString();
}
