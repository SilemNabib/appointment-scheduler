import type { ReactNode } from "react";

// Título de una página del panel (DESIGN §2.2 y §4.3): el `h1` con la tipografía de los
// títulos, una descripción opcional y, a la derecha (debajo en el celular), las acciones
// de la página.

export function TituloPagina({
  titulo,
  descripcion,
  acciones,
  antes,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  /** Lo que va encima del título, como el enlace para volver. */
  antes?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {antes}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-bold">{titulo}</h1>
          {descripcion && <p className="text-[15px] text-texto-muted">{descripcion}</p>}
        </div>
        {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
      </div>
    </div>
  );
}
