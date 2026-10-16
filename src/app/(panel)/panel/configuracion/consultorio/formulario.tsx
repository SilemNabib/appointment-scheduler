"use client";

import { useActionState } from "react";
import { Aviso } from "@/componentes/aviso";
import { BotonEnviar, Entrada } from "@/componentes/formulario";
import { mensajeDeError } from "@/componentes/mensajes";
import { guardarConsultorioPanel } from "./acciones";

// Formulario de PAN-13. Valida en el servidor (Q-02).

type Estado = { error?: string; exito?: string; valores?: { nombre: string; capacidad: string } };

export function FormularioConsultorio({
  nombre,
  capacidad,
  soloLectura,
}: {
  nombre: string;
  capacidad: number;
  soloLectura: boolean;
}) {
  const [estado, enviar] = useActionState<Estado, FormData>(async (_previo, formulario) => {
    const resultado = await guardarConsultorioPanel(formulario);
    if (resultado.ok) return { exito: "Guardaste el consultorio." };
    return {
      error: mensajeDeError(resultado.error, {
        DATOS_INVALIDOS: "Revisa los datos: el nombre no puede quedar vacío y la capacidad debe ser un número entero de 1 o más.",
      }),
      valores: { nombre: String(formulario.get("nombre") ?? ""), capacidad: String(formulario.get("capacidad") ?? "") },
    };
  }, {});
  const v = estado.valores;

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado.exito && <Aviso tipo="exito">{estado.exito}</Aviso>}
      <fieldset disabled={soloLectura} className="flex flex-col gap-4">
        <Entrada
          id="nombre"
          name="nombre"
          etiqueta="Nombre"
          ayuda="Por ejemplo, Consultorio 1. Lo ves en tu calendario."
          required
          maxLength={120}
          defaultValue={v?.nombre ?? nombre}
        />
        <Entrada
          id="capacidad"
          name="capacidad"
          type="number"
          inputMode="numeric"
          etiqueta="Capacidad"
          ayuda="Cuántas citas puedes atender al mismo tiempo. Con 1, nunca se reservan dos citas a la misma hora. Si la reduces, las citas que ya existen no cambian."
          required
          min={1}
          step={1}
          defaultValue={v?.capacidad ?? capacidad}
          className="max-w-32"
        />
        <div>
          <BotonEnviar textoEnviando="Guardando…">Guardar cambios</BotonEnviar>
        </div>
      </fieldset>
    </form>
  );
}
