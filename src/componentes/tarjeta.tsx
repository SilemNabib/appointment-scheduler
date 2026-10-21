import type { ReactNode } from "react";

// Tarjeta (DESIGN §2.3): superficie blanca con borde `borde`, radio de 24 px y padding
// de 24 px (18 px en móvil). Los elementos de adentro van separados 16 px.

export function Tarjeta({
  children,
  como: Elemento = "div",
  className,
  ...props
}: {
  children: ReactNode;
  /** `section` cuando la tarjeta es una región con título (`aria-labelledby`). */
  como?: "div" | "section" | "article" | "aside";
  className?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  return (
    <Elemento
      {...props}
      className={`flex min-w-0 flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-[18px] sm:p-6 ${className ?? ""}`}
    >
      {children}
    </Elemento>
  );
}
