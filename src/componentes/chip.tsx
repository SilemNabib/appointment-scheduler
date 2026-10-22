import type { ComponentProps, ReactNode } from "react";
import { ANILLO_FOCO } from "./estilos";

// Chip de selección (DESIGN §3, §6): categorías y horas. Es un botón real con
// `aria-pressed`, así que el estado no depende solo del color: el lector de pantalla
// dice "seleccionado". Seleccionado, fondo `tinta` y texto blanco.

export function Chip({
  seleccionado,
  children,
  className,
  ...props
}: { seleccionado: boolean; children: ReactNode } & Omit<ComponentProps<"button">, "type" | "aria-pressed">) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={seleccionado}
      className={
        "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-4 text-sm font-semibold " +
        "border-borde bg-superficie text-tinta hover:brightness-95 " +
        "aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-white " +
        "disabled:cursor-not-allowed disabled:border-deshabilitado disabled:bg-deshabilitado disabled:text-deshabilitado-texto " +
        `${ANILLO_FOCO} ${className ?? ""}`
      }
    >
      {children}
    </button>
  );
}
