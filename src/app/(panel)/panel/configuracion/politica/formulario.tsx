"use client";

import { useState } from "react";
import { Aviso } from "@/componentes/aviso";
import { Badge } from "@/componentes/badge";
import { AreaTexto, BotonEnviar, Seccion, useEnvio } from "@/componentes/formulario";
import { claseBoton } from "@/componentes/estilos";
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
          <li key={v.id} className="rounded-boton border border-borde">
            <details>
              <summary className="flex min-h-11 cursor-pointer flex-wrap items-center px-3 py-2 text-sm">
                <span className="font-semibold">Versión {v.version}</span>
                {i === 0 && (
                  <Badge tono="exito" className="ml-2">
                    Vigente
                  </Badge>
                )}
                <span className="text-texto-muted"> · publicada el {v.publicada}</span>
              </summary>
              <pre className="max-h-96 overflow-auto border-t border-borde px-3 py-2 text-xs whitespace-pre-wrap">
                {v.contenido}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}
