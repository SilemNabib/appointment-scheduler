"use client";

import { useState, useTransition } from "react";
import { Aviso, type TipoAviso } from "@/componentes/aviso";
import { BotonEnviar, claseBoton, Entrada, GrupoCampos, Opcion, Seccion, useEnvio } from "@/componentes/formulario";
import { mensajeDeError } from "@/componentes/mensajes";
import { SelectorHora } from "@/componentes/selector-hora";
import { formatearFechaHora } from "@/dominio/formato";
import { crearBloqueoPanel, eliminarBloqueoPanel } from "./acciones";

// Formulario y lista de bloqueos (PAN-08, F-09). Las fechas y horas son locales del
// negocio; el servidor las convierte y valida (Q-02). Si hay citas confirmadas en el
// rango, el bloqueo no se crea y se listan esas citas (D-15).

type Tipo = "hora" | "dia" | "rango";
type CitaQueImpide = { id: string; inicio: Date | string; servicio: string; cliente: string };
type Estado = { error?: string; exito?: string; citas?: CitaQueImpide[] };

const TIPOS: { valor: Tipo; texto: string }[] = [
  { valor: "hora", texto: "Unas horas" },
  { valor: "dia", texto: "Un día completo" },
  { valor: "rango", texto: "Varios días" },
];

export function FormularioBloqueo({
  zonaHoraria,
  hoy,
  soloLectura,
}: {
  zonaHoraria: string;
  /** Fecha local de hoy (`YYYY-MM-DD`), para el valor inicial y el mínimo de las fechas. */
  hoy: string;
  soloLectura: boolean;
}) {
  const [tipo, setTipo] = useState<Tipo>("hora");

  // `useEnvio` y no `<form action>`: el tipo es un radio controlado, y el reinicio
  // automático del formulario lo dejaría distinto de los campos que se muestran.
  const [estado, alEnviar, enviando] = useEnvio<Estado>(async (_previo, formulario) => {
    const resultado = await crearBloqueoPanel(formulario);
    if (resultado.ok) return { exito: "Creaste el bloqueo." };
    if (resultado.error === "BLOQUEO_CON_CITAS" && "citas" in resultado) {
      return {
        error: "No se creó el bloqueo: estas citas confirmadas caen en ese tiempo. Cancélalas o muévelas primero.",
        citas: resultado.citas,
      };
    }
    return {
      error: mensajeDeError(resultado.error, {
        DATOS_INVALIDOS:
          "Revisa las fechas y las horas: el bloqueo debe terminar después de empezar y no puede estar en el pasado.",
      }),
    };
  }, {});

  return (
    <Seccion titulo="Nuevo bloqueo">
      <form onSubmit={alEnviar} className="flex flex-col gap-4">
        {estado.error && (
          <Aviso tipo="error">
            <p>{estado.error}</p>
            {estado.citas && (
              <ul className="mt-2 list-disc pl-5">
                {estado.citas.map((c) => (
                  <li key={c.id}>
                    {formatearFechaHora(new Date(c.inicio), zonaHoraria)} · {c.servicio} · {c.cliente}
                  </li>
                ))}
              </ul>
            )}
          </Aviso>
        )}
        {estado.exito && <Aviso tipo="exito">{estado.exito}</Aviso>}
        <fieldset disabled={soloLectura} className="flex flex-col gap-4">
          <GrupoCampos leyenda="¿Qué quieres bloquear?">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {TIPOS.map((t) => (
                <Opcion
                  key={t.valor}
                  type="radio"
                  name="tipo"
                  value={t.valor}
                  etiqueta={t.texto}
                  checked={tipo === t.valor}
                  onChange={() => setTipo(t.valor)}
                />
              ))}
            </div>
          </GrupoCampos>

          {tipo === "rango" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Entrada id="desde" name="desde" type="date" etiqueta="Desde" required min={hoy} defaultValue={hoy} />
              <Entrada id="hasta" name="hasta" type="date" etiqueta="Hasta (incluido)" required min={hoy} defaultValue={hoy} />
            </div>
          ) : (
            <Entrada id="fecha" name="fecha" type="date" etiqueta="Fecha" required min={hoy} defaultValue={hoy} className="max-w-56" />
          )}

          {tipo === "hora" && (
            <div className="flex flex-wrap gap-4">
              <SelectorHora id="horaInicio" name="horaInicio" etiqueta="Desde" defaultValue="08:00" />
              <SelectorHora id="horaFin" name="horaFin" etiqueta="Hasta" defaultValue="12:00" />
            </div>
          )}

          <Entrada
            id="motivo"
            name="motivo"
            etiqueta="Motivo"
            ayuda="Opcional. Solo lo ves tú."
            maxLength={200}
          />
          <div>
            <BotonEnviar textoEnviando="Creando…" enviando={enviando}>
              Crear bloqueo
            </BotonEnviar>
          </div>
        </fieldset>
      </form>
    </Seccion>
  );
}

export function ListaBloqueos({
  bloqueos,
  soloLectura,
}: {
  /** El intervalo ya viene en palabras, en la zona del negocio. */
  bloqueos: { id: string; texto: string; motivo: string | null }[];
  soloLectura: boolean;
}) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [eliminando, iniciar] = useTransition();

  const eliminar = (id: string) =>
    iniciar(async () => {
      const resultado = await eliminarBloqueoPanel(id);
      setMensaje(
        resultado.ok ? { tipo: "exito", texto: "Eliminaste el bloqueo." } : { tipo: "error", texto: mensajeDeError(resultado.error) },
      );
      setConfirmando(null);
    });

  return (
    <Seccion titulo="Próximos bloqueos" descripcion="Los que ya terminaron no aparecen.">
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      {bloqueos.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No tienes bloqueos.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bloqueos.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800"
            >
              <div className="flex flex-col gap-1">
                <p className="font-medium">{b.texto}</p>
                {b.motivo && <p className="text-sm text-zinc-600 dark:text-zinc-400">{b.motivo}</p>}
              </div>
              {confirmando === b.id ? (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirmar la eliminación">
                  <span className="text-sm">¿Eliminar este bloqueo?</span>
                  <button
                    type="button"
                    disabled={eliminando}
                    onClick={() => eliminar(b.id)}
                    className={claseBoton("peligro")}
                  >
                    {eliminando ? "Eliminando…" : "Sí, eliminar"}
                  </button>
                  <button
                    type="button"
                    disabled={eliminando}
                    onClick={() => setConfirmando(null)}
                    className={claseBoton("secundario")}
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={soloLectura || eliminando}
                  onClick={() => {
                    setMensaje(null);
                    setConfirmando(b.id);
                  }}
                  className={claseBoton("secundario")}
                >
                  Eliminar<span className="sr-only"> el bloqueo: {b.texto}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}
