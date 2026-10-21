"use client";

import { startTransition, useActionState, useId, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Piezas que repiten los formularios del panel y del admin (RNF-03), con los tokens, los
// radios y las alturas de DESIGN §2.3 y §3 (Q-44): campos de 48 px, botones de al menos
// 48 px y el anillo de foco `foco`. Solo tema claro. Cada campo asocia su etiqueta con
// `htmlFor`, y su ayuda y su error con `aria-describedby`; el foco siempre se ve. La
// validación vive en el servidor (Q-02): los atributos de HTML solo ayudan a escribir bien.

/** Foco visible, igual en todos los controles (DESIGN §2.1: `foco`, 3 px, desfase 2 px). */
export const ANILLO_FOCO = "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-foco";

/** Campo de texto y selector (DESIGN §3): 48 px de alto, radio de 12 px. */
const CLASE_CONTROL =
  "min-h-12 rounded-control border border-borde-control bg-superficie px-3.5 text-[15px] text-tinta " +
  "aria-[invalid=true]:border-2 aria-[invalid=true]:border-error-texto " +
  "disabled:bg-[#f3f4f1] disabled:text-deshabilitado-texto " +
  // El campo de archivo: su botón, dentro de los 48 px.
  "file:my-1.5 file:mr-3 file:min-h-9 file:cursor-pointer file:rounded-[10px] file:border-0 file:bg-fondo-suave " +
  "file:px-3 file:text-sm file:font-semibold file:text-tinta " +
  ANILLO_FOCO;

/** El área de texto crece con sus filas. */
const CLASE_AREA = "py-3";

const CLASE_AYUDA = "text-sm text-texto-muted";
const CLASE_ERROR = "text-[13px] font-semibold text-error-texto";

type DatosCampo = {
  etiqueta: ReactNode;
  /** Explica el efecto o el formato del campo. */
  ayuda?: ReactNode;
  /** Error de este campo, que devolvió el servidor. */
  error?: string;
};

/** Atributos que un control recibe de `Campo`. */
export type AtributosControl = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

/** Ids de la ayuda y del error, para `aria-describedby`. */
function descripciones(id: string, { ayuda, error }: Pick<DatosCampo, "ayuda" | "error">) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = error ? `${id}-error` : undefined;
  return { idAyuda, idError, describedBy: [idAyuda, idError].filter(Boolean).join(" ") || undefined };
}

/**
 * Etiqueta, control, ayuda y error. El control lo dibuja `children`, que recibe el
 * `id` y los atributos ARIA. Para los controles de siempre, usa `Entrada`, `Selector`
 * o `AreaTexto`.
 */
export function Campo({
  id,
  etiqueta,
  ayuda,
  error,
  children,
}: DatosCampo & { id?: string; children: (control: AtributosControl) => ReactNode }) {
  const generado = useId();
  const idControl = id ?? generado;
  const { idAyuda, idError, describedBy } = descripciones(idControl, { ayuda, error });

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={idControl} className="text-sm font-semibold">
        {etiqueta}
      </label>
      {children({ id: idControl, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {ayuda && (
        <p id={idAyuda} className={CLASE_AYUDA}>
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className={CLASE_ERROR}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Entrada({ id, etiqueta, ayuda, error, className, ...props }: DatosCampo & ComponentProps<"input">) {
  return (
    <Campo id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      {(control) => <input {...props} {...control} className={`${CLASE_CONTROL} ${className ?? ""}`} />}
    </Campo>
  );
}

export function Selector({ id, etiqueta, ayuda, error, className, ...props }: DatosCampo & ComponentProps<"select">) {
  return (
    <Campo id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      {(control) => <select {...props} {...control} className={`${CLASE_CONTROL} ${className ?? ""}`} />}
    </Campo>
  );
}

export function AreaTexto({ id, etiqueta, ayuda, error, className, ...props }: DatosCampo & ComponentProps<"textarea">) {
  return (
    <Campo id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      {(control) => <textarea {...props} {...control} className={`${CLASE_CONTROL} ${CLASE_AREA} ${className ?? ""}`} />}
    </Campo>
  );
}

/** Grupo de campos o de opciones con su leyenda (`fieldset`), su ayuda y su error. */
export function GrupoCampos({
  leyenda,
  ayuda,
  error,
  children,
  className,
}: { leyenda: ReactNode; ayuda?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  const id = useId();
  const { idAyuda, idError, describedBy } = descripciones(id, { ayuda, error });

  return (
    <fieldset aria-describedby={describedBy} className={`flex flex-col gap-3 ${className ?? ""}`}>
      <legend className="mb-2 text-sm font-semibold">{leyenda}</legend>
      {children}
      {ayuda && (
        <p id={idAyuda} className={CLASE_AYUDA}>
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className={CLASE_ERROR}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Una opción (`radio` o `checkbox`) con su etiqueta a la derecha. Va dentro de un `GrupoCampos`. */
export function Opcion({ etiqueta, className, ...props }: { etiqueta: ReactNode } & ComponentProps<"input">) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-[15px]">
      <input {...props} className={`size-5 shrink-0 accent-acento ${ANILLO_FOCO} ${className ?? ""}`} />
      {etiqueta}
    </label>
  );
}

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

/**
 * Envía un formulario a una Server Action sin el reinicio automático que React hace
 * al terminar una `<form action>`. Ese reinicio devuelve cada campo a su valor
 * inicial, también los controlados por estado (radios, casillas o listas): el
 * formulario mostraría una opción y enviaría otra. Úsalo cuando el formulario tenga
 * campos controlados: `<form onSubmit={alEnviar}>` y `<BotonEnviar enviando={enviando}>`.
 * Los valores escritos se quedan como están, también después de un error.
 */
export function useEnvio<E>(fn: (previo: Awaited<E>, datos: FormData) => Promise<E>, inicial: Awaited<E>) {
  const [estado, despachar, enviando] = useActionState<E, FormData>(fn, inicial);
  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget, (evento.nativeEvent as SubmitEvent).submitter);
    startTransition(() => despachar(datos));
  };
  return [estado, alEnviar, enviando] as const;
}

/**
 * Botón de envío que se deshabilita y cambia su texto mientras la Server Action del
 * formulario corre. Con `<form action>` lee su estado con `useFormStatus`; con
 * `useEnvio`, recibe `enviando`. Si el formulario tiene varios botones con `name` y
 * `value`, todos se deshabilitan, pero solo cambia el texto del que se pulsó.
 */
export function BotonEnviar({
  children,
  textoEnviando = "Procesando…",
  variante,
  enviando = false,
  ...props
}: {
  children: ReactNode;
  /** Lo que dice mientras se envía, como "Guardando…". Por defecto, "Procesando…" (DESIGN §3). */
  textoEnviando?: ReactNode;
  variante?: keyof typeof VARIANTES_BOTON;
  /** Para formularios con `useEnvio`, que `useFormStatus` no ve. */
  enviando?: boolean;
} & Omit<ComponentProps<"button">, "type" | "children">) {
  const { pending, data } = useFormStatus();
  const pulsado = props.name === undefined || data?.get(props.name) === String(props.value);
  const ocupado = pending || enviando;
  return (
    <button {...props} type="submit" disabled={ocupado || props.disabled} className={claseBoton(variante)}>
      {(pending && pulsado) || enviando ? textoEnviando : children}
    </button>
  );
}

/** Sección de una página, como tarjeta (DESIGN §2.3), con su título (`h2`) y una descripción opcional. */
export function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-[18px] sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-2xl leading-tight font-bold">
          {titulo}
        </h2>
        {descripcion && <p className="text-sm text-texto-muted">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}
