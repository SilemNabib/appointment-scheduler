"use client";

import { useState } from "react";
import { Aviso } from "@/componentes/aviso";
import { AreaTexto, BotonEnviar, claseBoton, Seccion, useEnvio } from "@/componentes/formulario";
import { mensajeDeError } from "@/componentes/mensajes";
import { publicarPoliticaPanel } from "./acciones";

// Editor e historial de la política (PAN-17; D-05). El texto es Markdown y se muestra
// sin HTML crudo (ARCH §19.2): aquí, como texto plano. Valida en el servidor (Q-02).

type Estado = { error?: string; exito?: string };

export function EditorPolitica({
  vigente,
  plantilla,
  soloLectura,
}: {
  vigente: string;
  /** La plantilla del SaaS con el nombre del negocio. */
  plantilla: string;
  soloLectura: boolean;
}) {
  const [contenido, setContenido] = useState(vigente);

  // `useEnvio` y no `<form action>`: el texto es controlado (lo cambia "Usar la plantilla").
  const [estado, alEnviar, enviando] = useEnvio<Estado>(async (_previo, formulario) => {
    const resultado = await publicarPoliticaPanel(formulario);
    if (resultado.ok) return { exito: `Publicaste la versión ${resultado.valor.version}.` };
    return { error: mensajeDeError(resultado.error, { DATOS_INVALIDOS: "La política no puede quedar vacía." }) };
  }, {});

  return (
    <Seccion titulo="Editar la política">
      <Aviso tipo="info">
        Publicar crea una versión nueva, que aplica a las reservas siguientes. Las citas ya reservadas conservan la
        versión que aceptó cada cliente.
      </Aviso>
      <form onSubmit={alEnviar} className="flex flex-col gap-4">
        {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
        {estado.exito && <Aviso tipo="exito">{estado.exito}</Aviso>}
        <fieldset disabled={soloLectura} className="flex flex-col gap-4">
          <AreaTexto
            id="contenido"
            name="contenido"
            etiqueta="Texto de la política"
            ayuda="Usa Markdown: # para títulos, - para listas y **texto** para negrita."
            required
            rows={18}
            maxLength={50_000}
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            className="font-mono text-xs leading-relaxed"
          />
          <div className="flex flex-wrap gap-3">
            <BotonEnviar textoEnviando="Publicando…" enviando={enviando}>
              Publicar versión nueva
            </BotonEnviar>
            <button type="button" onClick={() => setContenido(plantilla)} className={claseBoton("secundario")}>
              Usar la plantilla
            </button>
          </div>
        </fieldset>
      </form>
    </Seccion>
  );
}

export function HistorialPolitica({
  versiones,
}: {
  /** De la vigente a la más vieja, con la fecha ya formateada en la zona del negocio. */
  versiones: { id: string; version: number; contenido: string; publicada: string }[];
}) {
  return (
    <Seccion titulo="Historial de versiones">
      <ul className="flex flex-col gap-2">
        {versiones.map((v, i) => (
          <li key={v.id} className="rounded-md border border-zinc-200 dark:border-zinc-800">
            <details>
              <summary className="cursor-pointer px-3 py-2 text-sm">
                <span className="font-medium">Versión {v.version}</span>
                {i === 0 && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Vigente</span>}
                <span className="text-zinc-600 dark:text-zinc-400"> · publicada el {v.publicada}</span>
              </summary>
              <pre className="max-h-96 overflow-auto border-t border-zinc-200 px-3 py-2 text-xs whitespace-pre-wrap dark:border-zinc-800">
                {v.contenido}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}
