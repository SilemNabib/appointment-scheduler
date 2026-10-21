// Color de marca y contraste (RNF-03; DESIGN §2.1; Q-42). El negocio elige su color
// (`negocio.color_primario`), que es el token `acento`. Para que cualquier color cumpla
// 4.5:1, el texto sobre el acento es blanco o `tinta`, y si el acento no se lee como
// texto sobre `superficie` y `fondo`, esos textos usan `tinta`.

/** Tokens de DESIGN §2.1 que intervienen en las decisiones. */
export const BLANCO = "#ffffff";
export const TINTA = "#15171a";
export const SUPERFICIE = "#ffffff";
export const FONDO = "#f5f6f2";
export const LIMA = "#d9f36b";

/** Contraste mínimo del texto normal (WCAG 2.1, 1.4.3, nivel AA). */
export const CONTRASTE_MINIMO = 4.5;

const FORMATO_COLOR = /^#[0-9a-f]{6}$/i;

/** Luminancia relativa de un color `#rrggbb` (WCAG 2.1). */
export function luminancia(color: string): number {
  if (!FORMATO_COLOR.test(color)) throw new Error(`Color inválido: ${color}`);
  const canal = (desde: number) => {
    const c = parseInt(color.slice(desde, desde + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Razón de contraste entre dos colores, de 1 a 21 (WCAG 2.1). El orden no importa. */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Último recurso: con blanco o negro puro, todo color llega al menos a 4.58:1. */
export const NEGRO = "#000000";

/**
 * El texto que va sobre el acento: blanco si cumple 4.5:1; si no, `tinta`. Con algunos
 * grises medios (como `#777777`) ninguno de los dos llega a 4.5:1, así que entonces va
 * el negro puro, que sí cumple.
 */
export function textoSobre(acento: string): string {
  if (contraste(BLANCO, acento) >= CONTRASTE_MINIMO) return BLANCO;
  if (contraste(TINTA, acento) >= CONTRASTE_MINIMO) return TINTA;
  return NEGRO;
}

/** Si el acento sirve como color de texto sobre `superficie` y sobre `fondo`. */
export function sirveComoTexto(acento: string): boolean {
  return contraste(acento, SUPERFICIE) >= CONTRASTE_MINIMO && contraste(acento, FONDO) >= CONTRASTE_MINIMO;
}

export type ColoresMarca = {
  /** Fondo de botones y marcas del negocio. */
  acento: string;
  /** Texto e iconos sobre el acento. */
  sobreAcento: string;
  /** El acento usado como texto (enlaces, etiquetas): él mismo o `tinta`. */
  acentoTexto: string;
  /** Destaques sobre fondo oscuro: el color secundario si contrasta con `tinta`, si no `lima`. */
  destaque: string;
};

/** Los colores de la página pública para el color principal y el secundario del negocio (Q-42). */
export function coloresMarca(primario: string, secundario: string | null = null): ColoresMarca {
  const acento = primario.toLowerCase();
  return {
    acento,
    sobreAcento: textoSobre(acento),
    acentoTexto: sirveComoTexto(acento) ? acento : TINTA,
    destaque: secundario && contraste(secundario, TINTA) >= CONTRASTE_MINIMO ? secundario.toLowerCase() : LIMA,
  };
}
