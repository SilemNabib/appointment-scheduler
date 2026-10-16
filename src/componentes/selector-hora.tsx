"use client";

import type { ComponentProps, ReactNode } from "react";
import { formatearHoraLocal } from "@/dominio/formato";
import { Selector } from "./formulario";

// Selector de una hora local, cada 15 minutos, con las horas en formato de 12 horas
// ("8:00 a. m."; RNF-02). Un `<input type="time">` mostraría el formato del
// dispositivo, que puede ser de 24 horas. El valor es `HH:mm`.

const PASO_MINUTOS = 15;

const aHora = (minutos: number) =>
  `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;

/** 00:00, 00:15… 23:45. */
export const HORAS: readonly string[] = Array.from({ length: (24 * 60) / PASO_MINUTOS }, (_, i) =>
  aHora(i * PASO_MINUTOS),
);

/** Minutos desde la medianoche de una hora `HH:mm`. */
export const aMinutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

/** Hora `HH:mm` de unos minutos desde la medianoche, sin pasar de la última de la lista. */
export const horaDe = (minutos: number) => aHora(Math.min(minutos, aMinutos(HORAS[HORAS.length - 1])));

export function SelectorHora({
  etiqueta,
  ayuda,
  value,
  defaultValue,
  ...props
}: { etiqueta: ReactNode; ayuda?: ReactNode; value?: string; defaultValue?: string } & Omit<
  ComponentProps<"select">,
  "value" | "defaultValue" | "children"
>) {
  // Si la hora elegida no cae en la lista (por ejemplo, una guardada a mano), se agrega.
  const elegida = value ?? defaultValue;
  const horas = elegida && !HORAS.includes(elegida) ? [...HORAS, elegida].sort() : HORAS;
  return (
    <Selector etiqueta={etiqueta} ayuda={ayuda} value={value} defaultValue={defaultValue} {...props}>
      {horas.map((hora) => (
        <option key={hora} value={hora}>
          {formatearHoraLocal(hora)}
        </option>
      ))}
    </Selector>
  );
}
