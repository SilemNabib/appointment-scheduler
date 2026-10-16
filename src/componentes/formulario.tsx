"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Piezas que repiten los formularios del panel y del admin (RNF-03; Q-26: estilo de la
// Fase 1, Tailwind con `teal` y `zinc`, hasta que exista docs/DESIGN.md). Cada campo
// asocia su etiqueta con `htmlFor`, y su ayuda y su error con `aria-describedby`; el
// foco siempre se ve. La validación vive en el servidor (Q-02): los atributos de HTML
// solo ayudan a escribir bien.

/** Foco visible, igual en todos los controles. */
export const ANILLO_FOCO =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-400";

const CLASE_CONTROL =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm disabled:opacity-60 " +
  "aria-[invalid=true]:border-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:aria-[invalid=true]:border-red-400 " +
  ANILLO_FOCO;

const CLASE_AYUDA = "text-xs text-zinc-600 dark:text-zinc-400";
const CLASE_ERROR = "text-xs font-medium text-red-700 dark:text-red-400";

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
    <div className="flex flex-col gap-1">
      <label htmlFor={idControl} className="text-sm font-medium">
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
      {(control) => <textarea {...props} {...control} className={`${CLASE_CONTROL} ${className ?? ""}`} />}
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
      <legend className="mb-2 text-sm font-medium">{leyenda}</legend>
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
    <label className="flex items-center gap-2 text-sm">
      <input {...props} className={`${ANILLO_FOCO} ${className ?? ""}`} />
      {etiqueta}
    </label>
  );
}

const VARIANTES_BOTON = {
  primario: "bg-teal-700 text-white hover:bg-teal-800",
  secundario:
    "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  peligro: "bg-red-700 text-white hover:bg-red-800",
};

export const claseBoton = (variante: keyof typeof VARIANTES_BOTON = "primario") =>
  `rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 ${VARIANTES_BOTON[variante]} ${ANILLO_FOCO}`;

/**
 * Botón de envío que se deshabilita y cambia su texto mientras la Server Action del
 * formulario corre. Va dentro del `<form>`: lee su estado con `useFormStatus`. Si el
 * formulario tiene varios botones con `name` y `value`, todos se deshabilitan, pero
 * solo cambia el texto del que se pulsó.
 */
export function BotonEnviar({
  children,
  textoEnviando,
  variante,
  ...props
}: {
  children: ReactNode;
  /** Lo que dice mientras se envía, como "Guardando…". */
  textoEnviando: ReactNode;
  variante?: keyof typeof VARIANTES_BOTON;
} & Omit<ComponentProps<"button">, "type" | "children">) {
  const { pending, data } = useFormStatus();
  const pulsado = props.name === undefined || data?.get(props.name) === String(props.value);
  return (
    <button {...props} type="submit" disabled={pending || props.disabled} className={claseBoton(variante)}>
      {pending && pulsado ? textoEnviando : children}
    </button>
  );
}

/** Sección de una página con su título (`h2`) y una descripción opcional. */
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
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-lg font-semibold">
          {titulo}
        </h2>
        {descripcion && <p className="text-sm text-zinc-600 dark:text-zinc-400">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}
