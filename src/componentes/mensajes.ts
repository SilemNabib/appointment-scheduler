import type { CodigoError } from "@/dominio/resultado";

// Mensajes de los códigos de error (ARCH §18.5) en los formularios del panel. Cada
// formulario puede dar su propio texto para un código, sobre todo para
// DATOS_INVALIDOS, que depende de los campos.

const GENERALES: Partial<Record<CodigoError, string>> = {
  NEGOCIO_SUSPENDIDO: "Tu suscripción está suspendida: el panel está en solo lectura y no se guardó ningún cambio.",
  NO_ENCONTRADO: "No encontramos lo que intentas cambiar. Recarga la página e intenta de nuevo.",
  LIMITE_PLAN: "Llegaste al límite de tu plan.",
  DATOS_INVALIDOS: "Revisa los datos del formulario.",
};

export function mensajeDeError(codigo: CodigoError, propios: Partial<Record<CodigoError, string>> = {}): string {
  return propios[codigo] ?? GENERALES[codigo] ?? "No se pudo guardar. Intenta de nuevo.";
}
