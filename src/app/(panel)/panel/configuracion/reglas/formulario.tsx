"use client";

import { Aviso } from "@/componentes/aviso";
import { BotonEnviar, Entrada, GrupoCampos, Opcion, Selector, useEnvio } from "@/componentes/formulario";
import { mensajeDeError } from "@/componentes/mensajes";
import type { Configuracion } from "@/servidor/casos-uso/configuracion";
import { guardarReglasPanel } from "./acciones";

// Formulario de PAN-15. Cada campo dice su unidad y su efecto. Valida en el servidor
// (Q-02).

type Reglas = Omit<Configuracion, "recordatorioHorasAntes">;
type Estado = { error?: string; exito?: string };

const ASISTENCIA: { valor: Reglas["asistenciaPorDefecto"]; texto: string }[] = [
  { valor: "completada", texto: "Asistió" },
  { valor: "no_asistio", texto: "No asistió" },
  { valor: "manual", texto: "Siempre decido yo" },
];

export function FormularioReglas({ reglas, soloLectura }: { reglas: Reglas; soloLectura: boolean }) {
  const [estado, alEnviar, enviando] = useEnvio<Estado>(async (_previo, formulario) => {
    const resultado = await guardarReglasPanel(formulario);
    if (resultado.ok) return { exito: "Guardaste las reglas de reserva." };
    return {
      error: mensajeDeError(resultado.error, {
        DATOS_INVALIDOS: "Revisa los valores: todos son números enteros, y la anticipación máxima va de 1 a 365 días.",
      }),
    };
  }, {});

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-4">
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado.exito && <Aviso tipo="exito">{estado.exito}</Aviso>}
      <fieldset disabled={soloLectura} className="flex flex-col gap-5">
        <Selector
          id="granularidadMinutos"
          name="granularidadMinutos"
          etiqueta="Intervalo entre horas de inicio"
          ayuda="Cada cuánto empiezan las horas que se ofrecen. Con 30 minutos, las citas empiezan a las :00 y a las :30."
          defaultValue={reglas.granularidadMinutos}
          className="max-w-48"
        >
          <option value="15">Cada 15 minutos</option>
          <option value="30">Cada 30 minutos</option>
          <option value="60">Cada 60 minutos</option>
        </Selector>
        <Entrada
          id="anticipacionMinimaMinutos"
          name="anticipacionMinimaMinutos"
          type="number"
          inputMode="numeric"
          etiqueta="Anticipación mínima (minutos)"
          ayuda="Cuánto antes, como mínimo, debe reservar un cliente. Con 120, a las 10:00 a. m. solo se ofrecen horas desde las 12:00 p. m. Tú puedes agendar sin esta regla."
          required
          min={0}
          defaultValue={reglas.anticipacionMinimaMinutos}
          className="max-w-48"
        />
        <Entrada
          id="anticipacionMaximaDias"
          name="anticipacionMaximaDias"
          type="number"
          inputMode="numeric"
          etiqueta="Anticipación máxima (días)"
          ayuda="Con cuántos días de anticipación, como máximo, se puede reservar: de 1 a 365."
          required
          min={1}
          max={365}
          defaultValue={reglas.anticipacionMaximaDias}
          className="max-w-48"
        />
        <Entrada
          id="plazoCancelacionHoras"
          name="plazoCancelacionHoras"
          type="number"
          inputMode="numeric"
          etiqueta="Plazo para cancelar o reprogramar (horas)"
          ayuda="Hasta cuántas horas antes de la cita el cliente puede cancelarla o cambiarla desde su enlace. Después, debe contactarte."
          required
          min={0}
          defaultValue={reglas.plazoCancelacionHoras}
          className="max-w-48"
        />
        <Entrada
          id="maxReprogramacionesCliente"
          name="maxReprogramacionesCliente"
          type="number"
          inputMode="numeric"
          etiqueta="Límite de reprogramaciones (veces por cita)"
          ayuda="Cuántas veces puede el cliente cambiar la hora de una misma cita desde su enlace. Déjalo vacío para no poner límite; con 0 no puede reprogramar. Los cambios que haces tú no cuentan."
          min={0}
          max={99}
          defaultValue={reglas.maxReprogramacionesCliente ?? ""}
          className="max-w-48"
        />
        <GrupoCampos
          leyenda="Asistencia por defecto"
          ayuda="Si no marcas una cita cuando termina, se marca sola con este valor. Puedes corregirla después."
        >
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {ASISTENCIA.map((a) => (
              <Opcion
                key={a.valor}
                type="radio"
                name="asistenciaPorDefecto"
                value={a.valor}
                etiqueta={a.texto}
                defaultChecked={reglas.asistenciaPorDefecto === a.valor}
              />
            ))}
          </div>
        </GrupoCampos>
        <div>
          <BotonEnviar textoEnviando="Guardando…" enviando={enviando}>
            Guardar reglas
          </BotonEnviar>
        </div>
      </fieldset>
    </form>
  );
}
