"use client";

import Link from "next/link";
import { useActionState } from "react";
import { crearNegocio, type EstadoAlta } from "./acciones";

// Formulario de alta (ADM-02, F-11). Valida solo en el servidor (Q-02); los atributos
// de HTML solo ayudan a escribir bien.

type Plan = { codigo: string; nombre: string };

const campo = "flex flex-col gap-1";
const etiqueta = "text-sm font-medium";
const entrada =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const ayuda = "text-xs text-zinc-600 dark:text-zinc-400";

export function FormularioAlta({ planes }: { planes: Plan[] }) {
  const [estado, accion, enviando] = useActionState<EstadoAlta, FormData>(crearNegocio, {});
  const v = estado.valores ?? {};

  if (estado.aviso) {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {estado.aviso}
        </p>
        <Link href="/admin" className="text-sm font-medium text-teal-700 underline dark:text-teal-400">
          Volver a la lista de negocios
        </Link>
      </div>
    );
  }

  return (
    <form action={accion} className="flex max-w-xl flex-col gap-4">
      {estado.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
          {estado.error}
        </p>
      )}

      <div className={campo}>
        <label htmlFor="slug" className={etiqueta}>
          Slug
        </label>
        <input
          id="slug"
          name="slug"
          required
          minLength={3}
          maxLength={40}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          defaultValue={v.slug}
          className={`${entrada} font-mono`}
          aria-describedby="slug-ayuda"
        />
        <p id="slug-ayuda" className={ayuda}>
          La dirección de la página de reservas: solo letras minúsculas, números y guiones; de 3 a 40 caracteres.
        </p>
      </div>

      <div className={campo}>
        <label htmlFor="nombre" className={etiqueta}>
          Nombre del negocio
        </label>
        <input id="nombre" name="nombre" required maxLength={120} defaultValue={v.nombre} className={entrada} />
      </div>

      <div className={campo}>
        <label htmlFor="plan" className={etiqueta}>
          Plan
        </label>
        <select id="plan" name="plan" required defaultValue={v.plan ?? planes[0]?.codigo} className={entrada}>
          {planes.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={etiqueta}>Estado de la suscripción</legend>
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="estadoSuscripcion"
              value="prueba"
              required
              defaultChecked={(v.estadoSuscripcion ?? "prueba") === "prueba"}
            />
            Prueba
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="estadoSuscripcion"
              value="activa"
              defaultChecked={v.estadoSuscripcion === "activa"}
            />
            Activa
          </label>
        </div>
      </fieldset>

      <div className={campo}>
        <label htmlFor="vencimiento" className={etiqueta}>
          Vence
        </label>
        <input
          id="vencimiento"
          name="vencimiento"
          type="date"
          required
          defaultValue={v.vencimiento}
          className={entrada}
          aria-describedby="vencimiento-ayuda"
        />
        <p id="vencimiento-ayuda" className={ayuda}>
          Fin de la prueba o &quot;pagado hasta&quot;, según el estado. El día elegido está incluido (hora de Colombia).
        </p>
      </div>

      <div className={campo}>
        <label htmlFor="correoDueno" className={etiqueta}>
          Correo del dueño
        </label>
        <input
          id="correoDueno"
          name="correoDueno"
          type="email"
          required
          defaultValue={v.correoDueno}
          className={entrada}
          aria-describedby="correo-ayuda"
        />
        <p id="correo-ayuda" className={ayuda}>
          Recibe la invitación para crear su contraseña.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className={etiqueta}>Sede principal (opcional)</legend>
        <div className={campo}>
          <label htmlFor="direccionSede" className="text-sm">
            Dirección
          </label>
          <input id="direccionSede" name="direccionSede" maxLength={200} defaultValue={v.direccionSede} className={entrada} />
        </div>
        <div className={campo}>
          <label htmlFor="telefonoSede" className="text-sm">
            Teléfono
          </label>
          <input
            id="telefonoSede"
            name="telefonoSede"
            type="tel"
            maxLength={30}
            defaultValue={v.telefonoSede}
            className={entrada}
          />
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {enviando ? "Creando…" : "Crear negocio"}
        </button>
        <Link href="/admin" className="text-sm text-zinc-600 underline dark:text-zinc-400">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
