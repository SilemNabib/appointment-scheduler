import { normalizarCorreo, normalizarTelefono } from "./identidad-cliente";
import { exito, fallo, type Resultado } from "./resultado";

// Contactos de la sede (D-29; Q-40): WhatsApp, teléfono y correo, en orden, que la
// página pública muestra con su enlace (PUB-01, PUB-07) y el dueño edita en PAN-11.
// El valor se guarda normalizado, como piden los `CHECK` de `contacto_sede` (ARCH §18.2).

export const TIPOS_CONTACTO = ["whatsapp", "telefono", "correo"] as const;
export type TipoContacto = (typeof TIPOS_CONTACTO)[number];

/** Hasta 6 contactos por sede, validados en código (Q-40). */
export const MAXIMO_CONTACTOS = 6;
/** El `CHECK` de `contacto_sede.etiqueta`. */
export const LONGITUD_MAXIMA_ETIQUETA = 40;
/** Lo que se acepta escrito antes de normalizar: un teléfono con espacios o un correo (RFC 5321). */
const LONGITUD_MAXIMA_VALOR = 254;

/** Lo que llega del formulario, sin normalizar. Una etiqueta vacía es "sin etiqueta". */
export type ContactoEntrada = { tipo: string; valor: string; etiqueta?: string | null };

/** Un contacto válido: `valor` en E.164 (WhatsApp y teléfono) o el correo en minúsculas. */
export type Contacto = { tipo: TipoContacto; valor: string; etiqueta: string | null };

/** Qué falló: el contacto (`indice`, desde 0) y su campo, o que sobran contactos. */
export type ErrorContactos =
  | { motivo: "demasiados" }
  | { motivo: "tipo" | "valor" | "etiqueta"; indice: number };

/** Correo con una arroba, sin espacios y con un punto en el dominio. */
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const esTipo = (tipo: string): tipo is TipoContacto => (TIPOS_CONTACTO as readonly string[]).includes(tipo);

/**
 * Valida y normaliza una lista de contactos, en el orden recibido. Los teléfonos y los
 * WhatsApp pasan a E.164 con `normalizarTelefono` (sin prefijo se asume Colombia), y
 * el correo, a minúsculas. El primer contacto que falla detiene la validación.
 */
export function validarContactos(lista: readonly ContactoEntrada[]): Resultado<Contacto[], ErrorContactos> {
  if (lista.length > MAXIMO_CONTACTOS) return fallo({ motivo: "demasiados" });
  const contactos: Contacto[] = [];
  for (const [indice, entrada] of lista.entries()) {
    if (!esTipo(entrada.tipo)) return fallo({ motivo: "tipo", indice });
    const valor = normalizarValor(entrada.tipo, entrada.valor);
    if (valor === null) return fallo({ motivo: "valor", indice });
    const etiqueta = entrada.etiqueta?.trim() || null;
    if (etiqueta !== null && etiqueta.length > LONGITUD_MAXIMA_ETIQUETA) return fallo({ motivo: "etiqueta", indice });
    contactos.push({ tipo: entrada.tipo, valor, etiqueta });
  }
  return exito(contactos);
}

/** El valor normalizado, o `null` si no es un teléfono o un correo válido. */
export function normalizarValor(tipo: TipoContacto, valor: string): string | null {
  if (valor.length > LONGITUD_MAXIMA_VALOR) return null;
  if (tipo === "correo") {
    const correo = normalizarCorreo(valor);
    return FORMATO_CORREO.test(correo) ? correo : null;
  }
  return normalizarTelefono(valor);
}

/** El enlace de un contacto ya normalizado: WhatsApp (`wa.me`), llamada o correo. */
export function enlaceContacto(contacto: Pick<Contacto, "tipo" | "valor">): string {
  switch (contacto.tipo) {
    case "whatsapp":
      return `https://wa.me/${contacto.valor.slice(1)}`; // wa.me pide el número sin "+"
    case "telefono":
      return `tel:${contacto.valor}`;
    case "correo":
      return `mailto:${contacto.valor}`;
  }
}

/** "Cómo llegar": la búsqueda de la dirección en Google Maps (D-30). */
export function enlaceMapa(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion.trim())}`;
}

/**
 * El número o el correo como se muestra. Un número de Colombia de 10 dígitos va sin el
 * indicativo y en grupos ("300 123 4567"); los demás, en E.164. No usa
 * libphonenumber-js, para poder mostrarse en el navegador sin cargarla (RNF-01; Q-46).
 */
export function valorVisible(contacto: Pick<Contacto, "tipo" | "valor">): string {
  if (contacto.tipo === "correo") return contacto.valor;
  const colombiano = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(contacto.valor);
  return colombiano ? `${colombiano[1]} ${colombiano[2]} ${colombiano[3]}` : contacto.valor;
}
