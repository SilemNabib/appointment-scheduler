// Clases de estilo que comparten los componentes (DESIGN §2.1, §2.3 y §3; Q-44). Viven
// aquí, en un módulo sin "use client", para que los componentes de servidor también las
// usen: importada desde un módulo de cliente, una constante llega al servidor como una
// referencia de cliente y no como el texto de la clase.

/** Foco visible, igual en todos los controles (DESIGN §2.1: `foco`, 3 px, desfase 2 px). */
export const ANILLO_FOCO = "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-foco";

/** Campo de texto y selector (DESIGN §3): 48 px de alto, radio de 12 px. Para un control que va dentro de `Campo`. */
export const CLASE_CONTROL =
  "min-h-12 rounded-control border border-borde-control bg-superficie px-3.5 text-[15px] text-tinta " +
  "aria-[invalid=true]:border-2 aria-[invalid=true]:border-error-texto " +
  "disabled:bg-[#f3f4f1] disabled:text-deshabilitado-texto " +
  // El campo de archivo: su botón, dentro de los 48 px.
  "file:my-1.5 file:mr-3 file:min-h-9 file:cursor-pointer file:rounded-[10px] file:border-0 file:bg-fondo-suave " +
  "file:px-3 file:text-sm file:font-semibold file:text-tinta " +
  ANILLO_FOCO;

/**
 * Botones de DESIGN §3: el primario con el acento (y su texto, que contrasta; Q-42), el
 * secundario blanco con borde, y el destructivo, secundario con el texto `error-acción`.
 * Deshabilitados, todos en gris (`deshabilitado`).
 */
const VARIANTES_BOTON = {
  primario: "border border-acento bg-acento px-5 font-bold text-sobre-acento",
  secundario: "border border-borde-control bg-superficie px-[18px] font-semibold text-tinta",
  peligro: "border border-borde-control bg-superficie px-[18px] font-bold text-error-accion",
};

export const claseBoton = (variante: keyof typeof VARIANTES_BOTON = "primario") =>
  "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-boton text-[15px] no-underline " +
  "hover:brightness-95 disabled:cursor-not-allowed disabled:border-deshabilitado disabled:bg-deshabilitado " +
  `disabled:text-deshabilitado-texto disabled:hover:brightness-100 ${VARIANTES_BOTON[variante]} ${ANILLO_FOCO}`;

export type VarianteBoton = keyof typeof VARIANTES_BOTON;
