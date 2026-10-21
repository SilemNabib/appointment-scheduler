"use client";

import { ANILLO_FOCO } from "@/componentes/formulario";
import { semanasDelMes, type Mes } from "@/dominio/calendario";
import { formatearDiaLocal, formatearMesLocal } from "@/dominio/formato";
import type { FechaLocal } from "@/dominio/tiempo";

// Calendario de PUB-03 (DESIGN §3): el mes visible, con el lunes primero. Un día antes
// de hoy, después del último día reservable o sin inicios está deshabilitado; los días
// sin cupo dicen "Sin cupos" (tachados y en su etiqueta: no solo por color). No avanza
// más allá del último mes reservable (Q-48). Las fechas son locales del negocio.

const DIAS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

export type EstadoDia = "disponible" | "sin_cupos" | "fuera";

export function Calendario({
  mes,
  estadoDe,
  hoy,
  seleccionado,
  cargando,
  puedeAnterior,
  puedeSiguiente,
  alElegir,
  alMover,
}: {
  mes: Mes;
  /** Si el día se puede elegir; `fuera` también mientras el mes se carga. */
  estadoDe: (fecha: FechaLocal) => EstadoDia;
  hoy: FechaLocal;
  seleccionado: FechaLocal | null;
  cargando: boolean;
  puedeAnterior: boolean;
  puedeSiguiente: boolean;
  alElegir: (fecha: FechaLocal) => void;
  alMover: (pasos: -1 | 1) => void;
}) {
  const semanas = semanasDelMes(mes);
  const etiquetaMes = formatearMesLocal(`${mes.anio}-${String(mes.mes).padStart(2, "0")}-01`);
  const flecha = (d: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
  const botonMes = "grid size-11 place-items-center rounded-boton border border-borde-control bg-superficie text-tinta disabled:cursor-not-allowed disabled:text-[#b7bbb4] " + ANILLO_FOCO;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={botonMes} disabled={!puedeAnterior} onClick={() => alMover(-1)} aria-label="Mes anterior">
          {flecha("M15 6l-6 6 6 6")}
        </button>
        <h3 className="m-0 text-[19px] font-bold" aria-live="polite">
          {etiquetaMes}
        </h3>
        <button type="button" className={botonMes} disabled={!puedeSiguiente} onClick={() => alMover(1)} aria-label="Mes siguiente">
          {flecha("M9 6l6 6-6 6")}
        </button>
      </div>
      <div aria-hidden="true" className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-texto-muted uppercase">
        {DIAS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div role="group" aria-label={`Días de ${etiquetaMes}`} aria-busy={cargando} className="grid grid-cols-7 gap-1.5">
        {semanas.flat().map((fecha, i) => {
          if (!fecha) return <span key={`vacio-${i}`} aria-hidden="true" />;
          const estado = cargando ? "fuera" : estadoDe(fecha);
          const elegido = fecha === seleccionado;
          const textoEstado = estado === "disponible" ? "disponible" : estado === "sin_cupos" ? "sin cupos" : "no disponible";
          return (
            <button
              key={fecha}
              type="button"
              disabled={estado !== "disponible"}
              aria-pressed={elegido}
              aria-label={`${formatearDiaLocal(fecha)}, ${textoEstado}${fecha === hoy ? ", hoy" : ""}`}
              onClick={() => alElegir(fecha)}
              className={
                "flex h-[46px] flex-col items-center justify-center gap-[3px] rounded-control border p-0 text-[15px] disabled:cursor-not-allowed " +
                (elegido
                  ? "border-acento bg-acento font-bold text-sobre-acento"
                  : estado === "disponible"
                    ? "cursor-pointer border-borde bg-superficie font-semibold text-tinta"
                    : estado === "sin_cupos"
                      ? "border-borde bg-transparent text-texto-muted"
                      : "border-transparent bg-transparent text-[#80868d]") +
                (fecha === hoy ? " font-extrabold" : "") +
                ` ${ANILLO_FOCO}`
              }
            >
              <span className={`leading-none ${estado === "sin_cupos" ? "line-through" : ""}`}>{Number(fecha.slice(8))}</span>
              <span
                aria-hidden="true"
                className={`size-[5px] rounded-full ${elegido ? "bg-destaque" : estado === "disponible" ? "bg-acento" : "bg-transparent"}`}
              />
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-[13px] text-texto-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-acento" />
          Disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="line-through">
            12
          </span>
          Sin cupos
        </span>
        {cargando && <span>Cargando los días…</span>}
      </div>
    </div>
  );
}
