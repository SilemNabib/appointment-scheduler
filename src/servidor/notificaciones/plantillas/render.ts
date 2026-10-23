import "server-only";
import { render, toPlainText } from "@react-email/render";
import type { ReactElement } from "react";

// HTML y texto plano de cada correo (RNF-02; ARCH §14.3, paso 3; Q-64). El texto plano sale
// del mismo HTML, así que trae la misma información. React Email omite en él las
// imágenes y la vista previa (`data-skip-in-text`).

export type CorreoRenderizado = { html: string; texto: string };

/** `html-to-text` pasa los títulos a mayúsculas por defecto; aquí quedan como se escribieron. */
const SIN_MAYUSCULAS = ["h1", "h2", "h3"].map((selector) => ({ selector, options: { uppercase: false } }));

export async function renderizar(correo: ReactElement): Promise<CorreoRenderizado> {
  const html = await render(correo);
  return { html, texto: toPlainText(html, { selectors: SIN_MAYUSCULAS }).trim() };
}
