"use client";

import { ANILLO_FOCO } from "@/componentes/formulario";
import { formatearHora } from "@/dominio/formato";
import { minutosLocales } from "@/dominio/tiempo";

// Horas libres del día elegido (PUB-04; DESIGN §3, selector de hora): botones de 44 px
// con `aria-pressed`, agrupados en mañana y tarde, siempre en la zona del negocio y
// nunca en la del dispositivo (RN-03; ARCH §9, regla 3).

const MEDIODIA = 12 * 60;

export function HorasLibres({
  inicios,
  zonaHoraria,
  elegido,
  alElegir,
}: {
  /** Inicios en ISO 8601 UTC, como los devuelve la disponibilidad (ARCH §18.5). */
  inicios: readonly string[];
  zonaHoraria: string;
  elegido: string | null;
  alElegir: (inicio: string) => void;
}) {
  const grupos = [
    { titulo: "Mañana", inicios: inicios.filter((i) => minutosLocales(new Date(i), zonaHoraria) < MEDIODIA) },
    { titulo: "Tarde", inicios: inicios.filter((i) => minutosLocales(new Date(i), zonaHoraria) >= MEDIODIA) },
  ].filter((g) => g.inicios.length > 0);

  return (
    <div className="flex flex-col gap-3.5">
      {grupos.map((g) => (
        <div key={g.titulo} role="group" aria-label={`Horas de la ${g.titulo.toLowerCase()}`} className="flex flex-col gap-2">
          <span className="text-xs font-bold tracking-[0.08em] text-texto-muted uppercase">{g.titulo}</span>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
            {g.inicios.map((inicio) => {
              const esElegido = inicio === elegido;
              return (
                <button
                  key={inicio}
                  type="button"
                  aria-pressed={esElegido}
                  onClick={() => alElegir(inicio)}
                  className={
                    "min-h-11 cursor-pointer rounded-control border px-1.5 text-sm font-semibold " +
                    (esElegido ? "border-acento bg-acento text-sobre-acento" : "border-borde bg-superficie text-tinta") +
                    ` ${ANILLO_FOCO}`
                  }
                >
                  {formatearHora(new Date(inicio), zonaHoraria)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
