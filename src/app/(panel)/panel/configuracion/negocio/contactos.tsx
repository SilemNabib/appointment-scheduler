"use client";

import { useState } from "react";
import { Aviso } from "@/componentes/aviso";
import { BotonEnviar, Entrada, GrupoCampos, Selector, useEnvio } from "@/componentes/formulario";
import { claseBoton } from "@/componentes/estilos";
import { mensajeDeError } from "@/componentes/mensajes";
import {
  LONGITUD_MAXIMA_ETIQUETA,
  MAXIMO_CONTACTOS,
  TIPOS_CONTACTO,
  type Contacto,
  type ErrorContactos,
  type TipoContacto,
} from "@/dominio/contactos";
import { guardarContactosNegocio } from "./acciones";

// Contactos de PAN-11 (D-29; Q-40): una lista de WhatsApp, teléfonos y correos que se
// agregan, se quitan y se ordenan. Se guarda completa con su propia Server Action.
// Valida en el servidor (Q-02), que dice qué contacto falló. El panel no habla de
// sedes (RN-32): son los contactos "del negocio".

const NOMBRES: Record<TipoContacto, string> = { whatsapp: "WhatsApp", telefono: "Teléfono", correo: "Correo" };

const ERRORES: Record<ErrorContactos["motivo"], string> = {
  valor: "Revisa este dato: no es un número de celular o fijo válido.",
  tipo: "Elige el tipo de contacto.",
  etiqueta: `La etiqueta puede tener hasta ${LONGITUD_MAXIMA_ETIQUETA} caracteres.`,
  demasiados: `Puedes tener hasta ${MAXIMO_CONTACTOS} contactos.`,
};

/** Un contacto mientras se edita. `clave` identifica la fila para React al reordenar. */
type Fila = { clave: number; tipo: TipoContacto; valor: string; etiqueta: string };

type Estado = { error?: string; exito?: string; contacto?: ErrorContactos };

let siguienteClave = 0;
const fila = (c: Partial<Contacto> = {}): Fila => ({
  clave: siguienteClave++,
  tipo: c.tipo ?? "whatsapp",
  valor: c.valor ?? "",
  etiqueta: c.etiqueta ?? "",
});

/** El mensaje de error de un valor, según su tipo. */
const errorDeValor = (tipo: TipoContacto) =>
  tipo === "correo" ? "Revisa este correo: debe tener la forma nombre@dominio.com." : ERRORES.valor;

export function FormularioContactos({ contactos, soloLectura }: { contactos: Contacto[]; soloLectura: boolean }) {
  const [filas, setFilas] = useState<Fila[]>(() => contactos.map(fila));

  // `useEnvio` y no `<form action>`: la lista es estado de React, y el reinicio
  // automático del formulario la dejaría distinta de lo que se guarda.
  const [estado, alEnviar, enviando] = useEnvio<Estado>(async () => {
    const resultado = await guardarContactosNegocio({
      contactos: filas.map(({ tipo, valor, etiqueta }) => ({ tipo, valor, etiqueta })),
    });
    if (resultado.ok) return { exito: "Guardaste los contactos." };
    if (resultado.error === "DATOS_INVALIDOS" && "contacto" in resultado && resultado.contacto) {
      const { contacto } = resultado;
      return {
        error: contacto.motivo === "demasiados" ? ERRORES.demasiados : `Revisa el contacto ${contacto.indice + 1}.`,
        contacto,
      };
    }
    return { error: mensajeDeError(resultado.error) };
  }, {});

  const cambiar = (indice: number, campo: "tipo" | "valor" | "etiqueta", valor: string) =>
    setFilas((f) => f.map((c, i) => (i === indice ? { ...c, [campo]: valor } : c)));
  const quitar = (indice: number) => setFilas((f) => f.filter((_, i) => i !== indice));
  const mover = (indice: number, hacia: -1 | 1) =>
    setFilas((f) => {
      const copia = [...f];
      [copia[indice], copia[indice + hacia]] = [copia[indice + hacia], copia[indice]];
      return copia;
    });

  /** El error de un campo de la fila, si el servidor marcó esa fila. */
  const errorEn = (indice: number, campo: "tipo" | "valor" | "etiqueta") => {
    const c = estado.contacto;
    if (!c || c.motivo === "demasiados" || c.indice !== indice || c.motivo !== campo) return undefined;
    return campo === "valor" ? errorDeValor(filas[indice]?.tipo ?? "telefono") : ERRORES[c.motivo];
  };

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-4">
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado.exito && <Aviso tipo="exito">{estado.exito}</Aviso>}
      <fieldset disabled={soloLectura} className="flex flex-col gap-4">
        {filas.length === 0 && (
          <p className="text-sm text-texto-muted">
            Todavía no tienes contactos. Agrega al menos uno para que tus clientes puedan escribirte o llamarte.
          </p>
        )}
        {filas.map((c, indice) => {
          const nombre = `${NOMBRES[c.tipo]} ${indice + 1}`;
          return (
            <GrupoCampos
              key={c.clave}
              leyenda={`Contacto ${indice + 1}`}
              className="rounded-boton border border-borde p-4"
            >
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <Selector
                  id={`contacto-${c.clave}-tipo`}
                  etiqueta="Tipo"
                  value={c.tipo}
                  error={errorEn(indice, "tipo")}
                  onChange={(e) => cambiar(indice, "tipo", e.target.value)}
                >
                  {TIPOS_CONTACTO.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {NOMBRES[tipo]}
                    </option>
                  ))}
                </Selector>
                <Entrada
                  id={`contacto-${c.clave}-valor`}
                  etiqueta={c.tipo === "correo" ? "Correo" : "Número"}
                  type={c.tipo === "correo" ? "email" : "tel"}
                  autoComplete="off"
                  required
                  maxLength={254}
                  ayuda={c.tipo === "correo" ? undefined : "Sin indicativo se asume Colombia (+57)."}
                  value={c.valor}
                  error={errorEn(indice, "valor")}
                  onChange={(e) => cambiar(indice, "valor", e.target.value)}
                />
              </div>
              <Entrada
                id={`contacto-${c.clave}-etiqueta`}
                etiqueta="Etiqueta"
                ayuda="Opcional, por ejemplo “Recepción” o “Citas”."
                maxLength={LONGITUD_MAXIMA_ETIQUETA}
                value={c.etiqueta}
                error={errorEn(indice, "etiqueta")}
                onChange={(e) => cambiar(indice, "etiqueta", e.target.value)}
              />
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={indice === 0}
                  onClick={() => mover(indice, -1)}
                  className={claseBoton("secundario")}
                >
                  Subir<span className="sr-only"> {nombre}</span>
                </button>
                <button
                  type="button"
                  disabled={indice === filas.length - 1}
                  onClick={() => mover(indice, 1)}
                  className={claseBoton("secundario")}
                >
                  Bajar<span className="sr-only"> {nombre}</span>
                </button>
                <button type="button" onClick={() => quitar(indice)} className={claseBoton("secundario")}>
                  Quitar<span className="sr-only"> {nombre}</span>
                </button>
              </div>
            </GrupoCampos>
          );
        })}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={filas.length >= MAXIMO_CONTACTOS}
            onClick={() => {
              // La fila se crea fuera del actualizador, que React puede llamar dos veces.
              const nueva = fila();
              setFilas((f) => [...f, nueva]);
            }}
            className={claseBoton("secundario")}
          >
            Agregar contacto
          </button>
          <BotonEnviar textoEnviando="Guardando…" enviando={enviando}>
            Guardar contactos
          </BotonEnviar>
        </div>
        {filas.length >= MAXIMO_CONTACTOS && (
          <p className="text-xs text-texto-muted">{ERRORES.demasiados}</p>
        )}
      </fieldset>
    </form>
  );
}
