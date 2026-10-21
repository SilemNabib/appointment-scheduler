"use client";

import { useActionState, useState, useTransition } from "react";
import { Aviso, type TipoAviso } from "@/componentes/aviso";
import { AreaTexto, BotonEnviar, claseBoton, Entrada, Seccion } from "@/componentes/formulario";
import { mensajeDeError } from "@/componentes/mensajes";
import type { Servicio } from "@/servidor/casos-uso/servicios";
import { activarServicioPanel, desactivarServicioPanel, guardarServicioPanel } from "./acciones";

// Lista y formulario de servicios (PAN-12). Validan en el servidor (Q-02). Un servicio
// inactivo se distingue por su etiqueta, no solo por el color (RNF-03). La categoría
// (D-26) sugiere las que ya existen con un `<datalist>`, para evitar variantes (Q-39).

const LIMITE = "Llegaste al límite del plan de servicios activos. Desactiva otro servicio para activar este.";
const LIMITE_AL_CREAR = "Llegaste al límite del plan de servicios activos: desactiva uno para crear otro.";

type Mensaje = { tipo: TipoAviso; texto: string };
type Estado = { error?: string; valores?: Record<string, string> };

const textos = (formulario: FormData) =>
  Object.fromEntries([...formulario].filter(([, valor]) => typeof valor === "string")) as Record<string, string>;

const duracion = (s: Servicio) =>
  `${s.duracionMinutos} min${s.bufferMinutos > 0 ? ` · ${s.bufferMinutos} min de buffer` : ""}`;

export function Servicios({
  servicios,
  categorias,
  soloLectura,
}: {
  servicios: Servicio[];
  /** Las categorías que ya usa el negocio (`listarCategorias`). */
  categorias: string[];
  soloLectura: boolean;
}) {
  const [editando, setEditando] = useState<Servicio | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const cambiarEstado = (servicio: Servicio) =>
    iniciar(async () => {
      setCambiando(servicio.id);
      const resultado = servicio.activo
        ? await desactivarServicioPanel(servicio.id)
        : await activarServicioPanel(servicio.id);
      setMensaje(
        resultado.ok
          ? { tipo: "exito", texto: `${servicio.activo ? "Desactivaste" : "Activaste"} "${servicio.nombre}".` }
          : { tipo: "error", texto: mensajeDeError(resultado.error, { LIMITE_PLAN: LIMITE }) },
      );
      setCambiando(null);
    });

  return (
    <>
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      <FormularioServicio
        key={editando?.id ?? "nuevo"}
        servicio={editando}
        categorias={categorias}
        soloLectura={soloLectura}
        alGuardar={(texto) => {
          setMensaje({ tipo: "exito", texto });
          setEditando(null);
        }}
        alCancelar={() => setEditando(null)}
      />

      <Seccion titulo="Tus servicios">
        {servicios.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Todavía no tienes servicios. Crea el primero para empezar a recibir reservas.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {servicios.map((s) => (
              <li
                key={s.id}
                className={`flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between ${
                  s.activo
                    ? "border-zinc-200 dark:border-zinc-800"
                    : "border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
                }`}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className={s.activo ? "" : "text-zinc-600 dark:text-zinc-400"}>{s.nombre}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.activo
                          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                          : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {s.activo ? "Activo" : "Inactivo"}
                    </span>
                  </p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {s.categoria && (
                      <>
                        <span className="sr-only">Categoría: </span>
                        {s.categoria} ·{" "}
                      </>
                    )}
                    {duracion(s)}
                  </p>
                  {s.descripcion && <p className="text-sm text-zinc-600 dark:text-zinc-400">{s.descripcion}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={soloLectura}
                    onClick={() => {
                      setMensaje(null);
                      setEditando(s);
                    }}
                    className={claseBoton("secundario")}
                  >
                    Editar<span className="sr-only"> {s.nombre}</span>
                  </button>
                  <button
                    type="button"
                    disabled={soloLectura || cambiando !== null}
                    onClick={() => cambiarEstado(s)}
                    className={claseBoton("secundario")}
                  >
                    {cambiando === s.id ? (s.activo ? "Desactivando…" : "Activando…") : s.activo ? "Desactivar" : "Activar"}
                    <span className="sr-only"> {s.nombre}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </>
  );
}

function FormularioServicio({
  servicio,
  categorias,
  soloLectura,
  alGuardar,
  alCancelar,
}: {
  servicio: Servicio | null;
  categorias: string[];
  soloLectura: boolean;
  alGuardar: (texto: string) => void;
  alCancelar: () => void;
}) {
  const [estado, enviar] = useActionState<Estado, FormData>(async (_previo, formulario) => {
    const resultado = await guardarServicioPanel(formulario);
    if (resultado.ok) {
      alGuardar(servicio ? `Guardaste "${formulario.get("nombre")}".` : `Creaste "${formulario.get("nombre")}".`);
      return {};
    }
    return {
      error: mensajeDeError(resultado.error, {
        DATOS_INVALIDOS:
          "Revisa los datos: el nombre no puede quedar vacío, la categoría tiene hasta 40 caracteres, la duración va de 5 a 720 minutos y el buffer, de 0 a 240.",
        LIMITE_PLAN: LIMITE_AL_CREAR,
      }),
      valores: textos(formulario),
    };
  }, {});
  const v = estado.valores;

  return (
    <Seccion titulo={servicio ? `Editar "${servicio.nombre}"` : "Nuevo servicio"}>
      <form action={enviar} className="flex flex-col gap-4">
        {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
        <fieldset disabled={soloLectura} className="flex flex-col gap-4">
          {servicio && <input type="hidden" name="id" value={servicio.id} />}
          <Entrada
            id="nombre"
            name="nombre"
            etiqueta="Nombre"
            required
            maxLength={120}
            autoFocus={servicio !== null}
            defaultValue={v?.nombre ?? servicio?.nombre ?? ""}
          />
          <Entrada
            id="categoria"
            name="categoria"
            etiqueta="Categoría"
            ayuda="Opcional. Agrupa tus servicios en tu página de reservas, por ejemplo “Exámenes” o “Lentes”."
            maxLength={40}
            list="categorias-existentes"
            autoComplete="off"
            defaultValue={v?.categoria ?? servicio?.categoria ?? ""}
          />
          <datalist id="categorias-existentes">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <AreaTexto
            id="descripcion"
            name="descripcion"
            etiqueta="Descripción"
            ayuda="Opcional. Tus clientes la ven al elegir el servicio."
            rows={2}
            maxLength={500}
            defaultValue={v?.descripcion ?? servicio?.descripcion ?? ""}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Entrada
              id="duracionMinutos"
              name="duracionMinutos"
              type="number"
              inputMode="numeric"
              etiqueta="Duración (minutos)"
              ayuda="Lo que dura la cita: de 5 a 720 minutos."
              required
              min={5}
              max={720}
              defaultValue={v?.duracionMinutos ?? servicio?.duracionMinutos ?? ""}
            />
            <Entrada
              id="bufferMinutos"
              name="bufferMinutos"
              type="number"
              inputMode="numeric"
              etiqueta="Buffer (minutos)"
              ayuda="Tiempo libre después de cada cita, por ejemplo para preparar el consultorio: de 0 a 240."
              min={0}
              max={240}
              defaultValue={v?.bufferMinutos ?? servicio?.bufferMinutos ?? 0}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <BotonEnviar textoEnviando="Guardando…">{servicio ? "Guardar cambios" : "Crear servicio"}</BotonEnviar>
            {servicio && (
              <button type="button" onClick={alCancelar} className={claseBoton("secundario")}>
                Cancelar
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </Seccion>
  );
}
