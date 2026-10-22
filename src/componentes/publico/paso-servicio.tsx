"use client";

import { useState } from "react";
import { Badge } from "@/componentes/badge";
import { Chip } from "@/componentes/chip";
import { ANILLO_FOCO } from "@/componentes/estilos";
import type { ServicioOfrecido } from "@/servidor/casos-uso/pagina-publica";

// Paso "Servicio" (PUB-02; D-26; Q-39): chips de categoría con "Todos" primero y después
// cada categoría en el orden de su primer servicio; los servicios sin categoría solo
// aparecen en "Todos", y sin ninguna categoría no hay chips. Cada tarjeta es un botón con
// la categoría, el nombre, la descripción y la duración, sin precio (D-25). Elegirla
// lleva al paso siguiente.

const TODOS = "Todos";

/** "30 min", "1 h" o "1 h 30 min". */
export function duracionTexto(minutos: number): string {
  const [h, m] = [Math.floor(minutos / 60), minutos % 60];
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Las categorías de los servicios, sin repetir, en el orden en que aparece su primer servicio (Q-39). */
export function categoriasDe(servicios: readonly ServicioOfrecido[]): string[] {
  return [...new Set(servicios.flatMap((s) => (s.categoria ? [s.categoria] : [])))];
}

export function PasoServicio({
  servicios,
  elegido,
  alElegir,
}: {
  servicios: readonly ServicioOfrecido[];
  elegido: string | null;
  alElegir: (servicioId: string) => void;
}) {
  const categorias = categoriasDe(servicios);
  const [filtro, setFiltro] = useState<string>(TODOS);
  const visibles = filtro === TODOS ? servicios : servicios.filter((s) => s.categoria === filtro);

  return (
    <div className="flex flex-col gap-[18px]">
      {categorias.length > 0 && (
        <div role="group" aria-label="Filtrar por categoría" className="flex flex-wrap gap-2">
          {[TODOS, ...categorias].map((c) => (
            <Chip key={c} seleccionado={filtro === c} onClick={() => setFiltro(c)}>
              {c}
            </Chip>
          ))}
        </div>
      )}
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-3.5 p-0">
        {visibles.map((s) => {
          const esElegido = s.id === elegido;
          return (
            <li key={s.id} className="flex">
              <button
                type="button"
                aria-pressed={esElegido}
                onClick={() => alElegir(s.id)}
                className={
                  "flex w-full cursor-pointer flex-col gap-2.5 rounded-[18px] border-[1.5px] bg-superficie p-[18px] text-left text-[15px] text-tinta hover:brightness-[0.98] " +
                  (esElegido ? "border-acento shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-acento)_25%,transparent)]" : "border-borde") +
                  ` ${ANILLO_FOCO}`
                }
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-bold tracking-[0.08em] text-texto-muted uppercase">{s.categoria ?? "Servicio"}</span>
                  {esElegido && <Badge tono="destaque">Elegido</Badge>}
                </span>
                <span className="font-titulos text-xl leading-tight font-bold tracking-[-0.01em]">{s.nombre}</span>
                {s.descripcion && <span className="text-sm text-texto-muted">{s.descripcion}</span>}
                <span className="mt-auto flex items-center gap-1.5 pt-1.5 text-sm text-tinta-suave">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  <span>
                    <span className="sr-only">Duración: </span>
                    {duracionTexto(s.duracionMinutos)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
