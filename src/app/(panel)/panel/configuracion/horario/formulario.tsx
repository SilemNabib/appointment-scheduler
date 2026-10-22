"use client";

import { useState } from "react";
import { Aviso } from "@/componentes/aviso";
import { BotonEnviar, GrupoCampos, useEnvio } from "@/componentes/formulario";
import { claseBoton } from "@/componentes/estilos";
import { mensajeDeError } from "@/componentes/mensajes";
import { aMinutos, horaDe, SelectorHora } from "@/componentes/selector-hora";
import { formatearHoraLocal } from "@/dominio/formato";
import { DIAS_SEMANA, type DiaSemana, type FranjaValida } from "@/dominio/horario";
import { guardarHorarioPanel } from "./acciones";

// Formulario de PAN-14: los siete días, con franjas que se agregan y se quitan, y
// "Cerrado" en los días sin franjas. Las horas se eligen con `SelectorHora`, en
// formato de 12 horas (RNF-02). Valida en el servidor (Q-02).

const NOMBRES: Record<DiaSemana, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

type Rango = { inicio: string; fin: string };
type Semana = Record<DiaSemana, Rango[]>;
type Estado = { error?: string; exito?: string; dias?: DiaSemana[] };

function semanaDe(franjas: FranjaValida[]): Semana {
  const semana = Object.fromEntries(DIAS_SEMANA.map((dia) => [dia, [] as Rango[]])) as unknown as Semana;
  for (const { dia, inicio, fin } of franjas) semana[dia].push({ inicio, fin });
  return semana;
}

/** Franja nueva: empieza donde termina la última del día y dura 4 horas, sin pasar de las 23:45. */
function franjaNueva(rangos: Rango[]): Rango {
  const inicio = rangos.at(-1)?.fin ?? "08:00";
  return { inicio, fin: horaDe(aMinutos(inicio) + 4 * 60) };
}

const listaDe = (dias: DiaSemana[]) =>
  new Intl.ListFormat("es-CO", { type: "conjunction" }).format(dias.map((d) => NOMBRES[d].toLowerCase()));

export function FormularioHorario({ franjas, soloLectura }: { franjas: FranjaValida[]; soloLectura: boolean }) {
  const [semana, setSemana] = useState<Semana>(() => semanaDe(franjas));

  // `useEnvio` y no `<form action>`: las horas son listas controladas por el estado, y
  // el reinicio automático del formulario las dejaría distintas de lo que se guarda.
  const [estado, alEnviar, enviando] = useEnvio<Estado>(async () => {
    const lista = DIAS_SEMANA.flatMap((dia) => semana[dia].map((r) => ({ dia, ...r })));
    const resultado = await guardarHorarioPanel({ franjas: lista });
    if (resultado.ok) return { exito: "Guardaste el horario." };
    if (resultado.error === "FRANJAS_SOLAPADAS" && "dias" in resultado) {
      return { error: `Hay franjas que se cruzan el ${listaDe(resultado.dias)}. Corrígelas para guardar.`, dias: resultado.dias };
    }
    return {
      error: mensajeDeError(resultado.error, {
        DATOS_INVALIDOS: "Revisa las franjas: cada una debe terminar después de empezar.",
      }),
    };
  }, {});

  const cambiar = (dia: DiaSemana, indice: number, campo: keyof Rango, valor: string) =>
    setSemana((s) => ({ ...s, [dia]: s[dia].map((r, i) => (i === indice ? { ...r, [campo]: valor } : r)) }));
  const agregar = (dia: DiaSemana) => setSemana((s) => ({ ...s, [dia]: [...s[dia], franjaNueva(s[dia])] }));
  const quitar = (dia: DiaSemana, indice: number) =>
    setSemana((s) => ({ ...s, [dia]: s[dia].filter((_, i) => i !== indice) }));

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-6">
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado.exito && <Aviso tipo="exito">{estado.exito}</Aviso>}
      <fieldset disabled={soloLectura} className="flex flex-col gap-6">
        {DIAS_SEMANA.map((dia) => (
          <GrupoCampos
            key={dia}
            leyenda={NOMBRES[dia]}
            error={estado.dias?.includes(dia) ? "Estas franjas se cruzan." : undefined}
            className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
          >
            {semana[dia].length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Cerrado</p>
            ) : (
              semana[dia].map((rango, indice) => (
                <div key={indice} className="flex flex-wrap items-end gap-3">
                  <SelectorHora
                    id={`dia${dia}-${indice}-inicio`}
                    etiqueta="Desde"
                    value={rango.inicio}
                    onChange={(e) => cambiar(dia, indice, "inicio", e.target.value)}
                  />
                  <SelectorHora
                    id={`dia${dia}-${indice}-fin`}
                    etiqueta="Hasta"
                    value={rango.fin}
                    onChange={(e) => cambiar(dia, indice, "fin", e.target.value)}
                  />
                  <button type="button" onClick={() => quitar(dia, indice)} className={claseBoton("secundario")}>
                    Quitar
                    <span className="sr-only">
                      {" "}
                      la franja de {formatearHoraLocal(rango.inicio)} a {formatearHoraLocal(rango.fin)} del{" "}
                      {NOMBRES[dia].toLowerCase()}
                    </span>
                  </button>
                </div>
              ))
            )}
            <div>
              <button type="button" onClick={() => agregar(dia)} className={claseBoton("secundario")}>
                Agregar franja<span className="sr-only"> al {NOMBRES[dia].toLowerCase()}</span>
              </button>
            </div>
          </GrupoCampos>
        ))}
        <div>
          <BotonEnviar textoEnviando="Guardando…" enviando={enviando}>
            Guardar horario
          </BotonEnviar>
        </div>
      </fieldset>
    </form>
  );
}
