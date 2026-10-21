"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { Aviso } from "@/componentes/aviso";
import { ANILLO_FOCO, BotonEnviar, claseBoton, Entrada } from "@/componentes/formulario";

// Paso "Tus datos" (PUB-05; RN-17; ARCH §15; Q-43, Q-45, Q-46): nombre, apellido,
// celular con +57 por defecto, correo y la casilla obligatoria de la política con su
// versión y su enlace. Sin el campo de notas (Q-43). Lleva el campo trampa `sitioWeb`,
// fuera del orden de tabulación y oculto para los lectores de pantalla. Los errores de la
// API se muestran junto a cada campo, con `aria-invalid` y `aria-describedby`; el
// teléfono lo valida el servidor, para no cargar libphonenumber en la página (Q-46).

export type CampoDatos = "nombre" | "apellido" | "telefono" | "correo" | "aceptaPolitica";

export type DatosCliente = {
  nombre: string;
  apellido: string;
  telefono: string;
  correo: string;
  aceptaPolitica: boolean;
  sitioWeb: string;
};

export const DATOS_VACIOS: DatosCliente = { nombre: "", apellido: "", telefono: "", correo: "", aceptaPolitica: false, sitioWeb: "" };

/** El texto de error de cada campo, en el orden del formulario. */
export const ERRORES_CAMPO: Record<CampoDatos, string> = {
  nombre: "Escribe tu nombre.",
  apellido: "Escribe tu apellido.",
  telefono: "Escribe un celular válido, por ejemplo 300 123 4567.",
  correo: "Escribe un correo válido, por ejemplo tu@correo.com.",
  aceptaPolitica: "Para reservar, acepta la política de tratamiento de datos.",
};

const ORDEN: readonly CampoDatos[] = ["nombre", "apellido", "telefono", "correo", "aceptaPolitica"];

/** Los campos vacíos o sin marcar: el formulario no se envía sin ellos (RN-17). */
export function camposFaltantes(d: DatosCliente): CampoDatos[] {
  return ORDEN.filter((c) => (c === "aceptaPolitica" ? !d.aceptaPolitica : d[c].trim() === ""));
}

export function PasoDatos({
  datos,
  errores,
  aviso,
  enviando,
  nombreNegocio,
  urlPolitica,
  versionPolitica,
  alCambiar,
  alEnviar,
  alVolver,
}: {
  datos: DatosCliente;
  /** Los campos con error, de la validación local o de la API (Q-46). */
  errores: readonly CampoDatos[];
  /** Un aviso del envío (demasiadas solicitudes, conexión…), que recibe el foco. */
  aviso: { tipo: "error" | "advertencia"; texto: string } | null;
  enviando: boolean;
  nombreNegocio: string;
  urlPolitica: string;
  versionPolitica: number;
  alCambiar: <C extends keyof DatosCliente>(campo: C, valor: DatosCliente[C]) => void;
  alEnviar: () => void;
  alVolver: () => void;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const refAviso = useRef<HTMLDivElement>(null);

  // El foco va al primer campo con error, o al aviso, cuando aparecen.
  const primerError = ORDEN.find((c) => errores.includes(c));
  useEffect(() => {
    if (primerError) formulario.current?.querySelector<HTMLElement>(`#datos-${primerError}`)?.focus();
  }, [primerError, errores]);
  useEffect(() => {
    if (aviso) refAviso.current?.focus();
  }, [aviso]);

  const error = (c: CampoDatos) => (errores.includes(c) ? ERRORES_CAMPO[c] : undefined);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!enviando) alEnviar();
  };

  return (
    <form ref={formulario} noValidate onSubmit={enviar} className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3.5">
        <Entrada
          id="datos-nombre"
          etiqueta="Nombre"
          autoComplete="given-name"
          required
          maxLength={100}
          value={datos.nombre}
          error={error("nombre")}
          onChange={(e) => alCambiar("nombre", e.target.value)}
        />
        <Entrada
          id="datos-apellido"
          etiqueta="Apellido"
          autoComplete="family-name"
          required
          maxLength={100}
          value={datos.apellido}
          error={error("apellido")}
          onChange={(e) => alCambiar("apellido", e.target.value)}
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="datos-telefono" className="text-sm font-semibold">
            Celular
          </label>
          <div className="flex items-stretch">
            <span
              aria-hidden="true"
              className="grid place-items-center rounded-l-control border border-r-0 border-borde-control bg-fondo px-3 text-[15px] font-semibold"
            >
              +57
            </span>
            <input
              id="datos-telefono"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              required
              maxLength={40}
              value={datos.telefono}
              aria-invalid={errores.includes("telefono") || undefined}
              aria-describedby={`datos-telefono-ayuda${errores.includes("telefono") ? " datos-telefono-error" : ""}`}
              onChange={(e) => alCambiar("telefono", e.target.value)}
              className={
                "min-h-12 w-full min-w-0 rounded-r-control border border-borde-control bg-superficie px-3.5 text-[15px] text-tinta " +
                `aria-[invalid=true]:border-2 aria-[invalid=true]:border-error-texto ${ANILLO_FOCO}`
              }
            />
          </div>
          <p id="datos-telefono-ayuda" className="m-0 text-[13px] text-texto-muted">
            Código de Colombia (+57). Si es de otro país, escríbelo con su indicativo.
          </p>
          {errores.includes("telefono") && (
            <p id="datos-telefono-error" className="m-0 text-[13px] font-semibold text-error-texto">
              {ERRORES_CAMPO.telefono}
            </p>
          )}
        </div>
        <Entrada
          id="datos-correo"
          etiqueta="Correo electrónico"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          ayuda="Te enviamos la confirmación y el enlace para cancelar o cambiar tu cita."
          value={datos.correo}
          error={error("correo")}
          onChange={(e) => alCambiar("correo", e.target.value)}
        />
      </div>

      {/* Trampa para bots (ARCH §15): fuera de la vista, del teclado y del lector de pantalla. */}
      <div aria-hidden="true" className="absolute -left-[10000px] size-px overflow-hidden">
        <label htmlFor="datos-sitio-web">Sitio web</label>
        <input
          id="datos-sitio-web"
          name="sitioWeb"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={datos.sitioWeb}
          onChange={(e) => alCambiar("sitioWeb", e.target.value)}
        />
      </div>

      <div
        className={`flex flex-col gap-2.5 rounded-boton border bg-superficie p-3.5 ${errores.includes("aceptaPolitica") ? "border-2 border-error-texto" : "border-borde"}`}
      >
        <div className="flex items-start gap-3">
          <input
            id="datos-aceptaPolitica"
            type="checkbox"
            required
            checked={datos.aceptaPolitica}
            aria-invalid={errores.includes("aceptaPolitica") || undefined}
            aria-describedby={`datos-politica-enlace${errores.includes("aceptaPolitica") ? " datos-aceptaPolitica-error" : ""}`}
            onChange={(e) => alCambiar("aceptaPolitica", e.target.checked)}
            className={`mt-0.5 size-[22px] shrink-0 accent-acento ${ANILLO_FOCO}`}
          />
          <label htmlFor="datos-aceptaPolitica" className="cursor-pointer text-[15px]">
            Acepto la política de tratamiento de datos de {nombreNegocio}, versión {versionPolitica}.{" "}
            <span className="text-texto-muted">(Obligatorio)</span>
          </label>
        </div>
        <a
          id="datos-politica-enlace"
          href={urlPolitica}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-[34px] self-start font-semibold text-acento-texto underline underline-offset-[3px]"
        >
          Leer la política (versión {versionPolitica})<span className="sr-only">, se abre en otra pestaña</span>
        </a>
        {errores.includes("aceptaPolitica") && (
          <p id="datos-aceptaPolitica-error" className="m-0 ml-[34px] text-[13px] font-semibold text-error-texto">
            {ERRORES_CAMPO.aceptaPolitica}
          </p>
        )}
      </div>

      {aviso && (
        <div ref={refAviso} tabIndex={-1} className="outline-none">
          <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-[18px]">
        <button type="button" className={claseBoton("secundario")} onClick={alVolver}>
          Atrás
        </button>
        <BotonEnviar enviando={enviando}>Confirmar reserva</BotonEnviar>
      </div>
    </form>
  );
}
