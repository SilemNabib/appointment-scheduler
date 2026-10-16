"use client";

import { useState } from "react";
import { Aviso } from "@/componentes/aviso";
import { BotonEnviar, Entrada, GrupoCampos, Opcion, useEnvio } from "@/componentes/formulario";
import { mensajeDeError } from "@/componentes/mensajes";
import { guardarRecordatorioPanel } from "./acciones";

// Formulario de PAN-16: unas horas antes de la cita o "Ninguno". Envía `recordatorio`
// con el número de horas o con "ninguno". Valida en el servidor (Q-02).

type Estado = { error?: string; exito?: string };

export function FormularioRecordatorio({ horasAntes, soloLectura }: { horasAntes: number | null; soloLectura: boolean }) {
  const [conRecordatorio, setConRecordatorio] = useState(horasAntes !== null);

  // `useEnvio` y no `<form action>`: la elección es un radio controlado (ver useEnvio).
  const [estado, alEnviar, enviando] = useEnvio<Estado>(async (_previo, formulario) => {
    const resultado = await guardarRecordatorioPanel(formulario);
    if (resultado.ok) return { exito: "Guardaste el recordatorio." };
    return {
      error: mensajeDeError(resultado.error, {
        DATOS_INVALIDOS: "Escribe un número entero de horas, de 1 en adelante, o elige \"Ninguno\".",
      }),
    };
  }, {});

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-4">
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado.exito && <Aviso tipo="exito">{estado.exito}</Aviso>}
      <fieldset disabled={soloLectura} className="flex flex-col gap-4">
        <GrupoCampos
          leyenda="¿Cuándo se envía?"
          ayuda="Si una cita se reserva cuando ya pasó ese momento (por ejemplo, 1 hora antes con un recordatorio de 2 horas), esa cita no recibe recordatorio."
        >
          <Opcion
            type="radio"
            name="modo"
            value="horas"
            etiqueta="Unas horas antes de la cita"
            checked={conRecordatorio}
            onChange={() => setConRecordatorio(true)}
          />
          {conRecordatorio ? (
            <Entrada
              id="recordatorio"
              name="recordatorio"
              type="number"
              inputMode="numeric"
              etiqueta="Horas antes de la cita"
              required
              min={1}
              defaultValue={horasAntes ?? 24}
              className="max-w-32"
            />
          ) : (
            <input type="hidden" name="recordatorio" value="ninguno" />
          )}
          <Opcion
            type="radio"
            name="modo"
            value="ninguno"
            etiqueta="Ninguno: no enviar recordatorios"
            checked={!conRecordatorio}
            onChange={() => setConRecordatorio(false)}
          />
        </GrupoCampos>
        <div>
          <BotonEnviar textoEnviando="Guardando…" enviando={enviando}>
            Guardar recordatorio
          </BotonEnviar>
        </div>
      </fieldset>
    </form>
  );
}
