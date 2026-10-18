import { parsePhoneNumberFromString } from "libphonenumber-js";

// Identidad del cliente (RN-18, RN-19; ARCH §12). El cliente no tiene cuenta: se
// reconoce por el teléfono normalizado y, si no, por el correo en minúsculas.

/** País que se asume cuando el teléfono no trae prefijo internacional (PUB-05: `+57` por defecto). */
export const PAIS_POR_DEFECTO = "CO";

/** El `CHECK` de `cliente.telefono_e164` (ARCH §18.2). */
const E164 = /^\+[1-9][0-9]{6,14}$/;

/**
 * Teléfono en E.164 (`+573001234567`), sin espacios ni guiones (RN-18.1). Sin prefijo
 * internacional se asume Colombia. Devuelve `null` si no es un número válido: la
 * reserva lo rechaza con `DATOS_INVALIDOS` (ARCH §12).
 */
export function normalizarTelefono(telefono: string): string | null {
  const numero = parsePhoneNumberFromString(telefono.trim(), PAIS_POR_DEFECTO);
  if (!numero?.isValid()) return null;
  return E164.test(numero.number) ? numero.number : null;
}

/** Correo sin espacios alrededor y en minúsculas (RN-18.2; `CHECK` de `cliente.correo`). */
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}
