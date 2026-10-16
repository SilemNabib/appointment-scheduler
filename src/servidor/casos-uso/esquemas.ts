import "server-only";
import { z } from "zod";

// Piezas de Zod que repiten los casos de uso. Los formularios envían texto: un campo
// opcional llega vacío, no ausente.

/** Texto opcional de un formulario: vacío o ausente = `null`. */
export const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .nullish()
    .transform((valor) => valor || null);

/** Color `#rrggbb`, que se guarda en minúsculas (`CHECK` de `negocio`, ARCH §18.2). */
export const color = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/);
