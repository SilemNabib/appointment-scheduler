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

/** Datos con los que se reserva, ya normalizados. El correo es opcional en las citas manuales (S-05). */
export type DatosIdentidad = {
  nombre: string;
  apellido: string;
  telefonoE164: string;
  correo: string | null;
};

/** Cliente del negocio que coincide por teléfono o por correo. */
export type ClienteConocido = { id: string; telefonoE164: string | null; correo: string | null };

/** Qué cambiar de un cliente existente: el nombre siempre; el contacto, solo si se completa. */
export type CambiosCliente = Pick<DatosIdentidad, "nombre" | "apellido"> & {
  telefonoE164?: string;
  correo?: string;
};

export type DecisionIdentidad =
  | { tipo: "existente"; clienteId: string; cambios: CambiosCliente }
  | { tipo: "nuevo"; datos: DatosIdentidad };

/**
 * A qué cliente se asocia la cita (RN-18, RN-19; ARCH §12), a partir del cliente del
 * negocio que coincide por teléfono y del que coincide por correo:
 *
 * 1. Por teléfono: se usa ese cliente (también con un teléfono compartido, RN-19), su
 *    nombre pasa a ser el más reciente (RN-18.3) y su correo solo se completa si estaba
 *    vacío y nadie más lo usa (S-15). Si el correo es de OTRO cliente, prevalece el
 *    teléfono y el otro no cambia (RN-18.5, D-22).
 * 2. Si no, por correo: se usa ese cliente y su teléfono se completa si estaba vacío
 *    (RN-18.2); nadie más lo usa, porque no hubo coincidencia por teléfono.
 * 3. Si no, un cliente nuevo (RN-18.4).
 *
 * La cita guarda aparte la instantánea de los datos con que se reservó (RN-18.3).
 */
export function decidirIdentidad(
  datos: DatosIdentidad,
  porTelefono: ClienteConocido | null,
  porCorreo: ClienteConocido | null,
): DecisionIdentidad {
  const nombre = { nombre: datos.nombre, apellido: datos.apellido };
  if (porTelefono) {
    const completaCorreo = porTelefono.correo === null && porCorreo === null;
    return {
      tipo: "existente",
      clienteId: porTelefono.id,
      cambios: completaCorreo && datos.correo !== null ? { ...nombre, correo: datos.correo } : nombre,
    };
  }
  if (porCorreo) {
    const completaTelefono = porCorreo.telefonoE164 === null;
    return {
      tipo: "existente",
      clienteId: porCorreo.id,
      cambios: completaTelefono ? { ...nombre, telefonoE164: datos.telefonoE164 } : nombre,
    };
  }
  return { tipo: "nuevo", datos };
}
