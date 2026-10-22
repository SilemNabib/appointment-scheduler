"use client";

import { BotonEnviar, Campo, useEnvio } from "@/componentes/formulario";
import { CLASE_CONTROL } from "@/componentes/estilos";
import type { Fallo } from "@/dominio/resultado";

// "Buscar por código" de la agenda (D-28; Q-59). El servidor normaliza el código (recorta,
// pasa a mayúsculas y agrega el guion) y, si encuentra la cita, lleva a su detalle. Si
// no, el error queda junto al campo y lo escrito se conserva.

type Estado = { error?: string };

export function BuscarCodigo({ buscar }: { buscar: (codigo: string) => Promise<Fallo<string> | undefined> }) {
  const [estado, alEnviar, enviando] = useEnvio<Estado>(async (_previo, datos) => {
    const resultado = await buscar(String(datos.get("codigo") ?? ""));
    return resultado && !resultado.ok ? { error: "No encontramos una cita con ese código." } : {};
  }, {});

  return (
    <form role="search" aria-label="Buscar una cita por su código" onSubmit={alEnviar}>
      <Campo etiqueta="Buscar por código" error={estado.error}>
        {(control) => (
          <div className="flex gap-2">
            <input
              {...control}
              name="codigo"
              placeholder="AB-1234"
              autoComplete="off"
              spellCheck={false}
              maxLength={20}
              className={`${CLASE_CONTROL} min-w-0 flex-1 font-codigo uppercase placeholder:normal-case`}
            />
            <BotonEnviar variante="secundario" enviando={enviando} textoEnviando="Buscando…">
              Buscar
            </BotonEnviar>
          </div>
        )}
      </Campo>
    </form>
  );
}
