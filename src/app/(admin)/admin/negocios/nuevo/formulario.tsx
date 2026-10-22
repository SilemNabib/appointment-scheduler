"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Aviso } from "@/componentes/aviso";
import { BotonEnviar, Entrada, GrupoCampos, Opcion, Selector } from "@/componentes/formulario";
import { ANILLO_FOCO } from "@/componentes/estilos";
import { crearNegocio, type EstadoAlta } from "./acciones";

// Formulario de alta (ADM-02, F-11). Valida solo en el servidor (Q-02); los atributos
// de HTML solo ayudan a escribir bien.

type Plan = { codigo: string; nombre: string };

const enlace = `rounded-sm text-sm underline ${ANILLO_FOCO}`;

export function FormularioAlta({ planes }: { planes: Plan[] }) {
  const [estado, accion] = useActionState<EstadoAlta, FormData>(crearNegocio, {});
  const v = estado.valores ?? {};

  if (estado.aviso) {
    return (
      <div className="flex flex-col gap-3">
        <Aviso tipo="advertencia">{estado.aviso}</Aviso>
        <Link href="/admin" className={`${enlace} font-medium text-teal-700 dark:text-teal-400`}>
          Volver a la lista de negocios
        </Link>
      </div>
    );
  }

  return (
    <form action={accion} className="flex max-w-xl flex-col gap-4">
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}

      <Entrada
        id="slug"
        name="slug"
        etiqueta="Slug"
        ayuda="La dirección de la página de reservas: solo letras minúsculas, números y guiones; de 3 a 40 caracteres."
        required
        minLength={3}
        maxLength={40}
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        defaultValue={v.slug}
        className="font-mono"
      />

      <Entrada id="nombre" name="nombre" etiqueta="Nombre del negocio" required maxLength={120} defaultValue={v.nombre} />

      <Selector id="plan" name="plan" etiqueta="Plan" required defaultValue={v.plan ?? planes[0]?.codigo}>
        {planes.map((p) => (
          <option key={p.codigo} value={p.codigo}>
            {p.nombre}
          </option>
        ))}
      </Selector>

      <GrupoCampos leyenda="Estado de la suscripción">
        <div className="flex gap-6">
          <Opcion
            type="radio"
            name="estadoSuscripcion"
            value="prueba"
            etiqueta="Prueba"
            required
            defaultChecked={(v.estadoSuscripcion ?? "prueba") === "prueba"}
          />
          <Opcion
            type="radio"
            name="estadoSuscripcion"
            value="activa"
            etiqueta="Activa"
            defaultChecked={v.estadoSuscripcion === "activa"}
          />
        </div>
      </GrupoCampos>

      <Entrada
        id="vencimiento"
        name="vencimiento"
        type="date"
        etiqueta="Vence"
        ayuda={'Fin de la prueba o "pagado hasta", según el estado. El día elegido está incluido (hora de Colombia).'}
        required
        defaultValue={v.vencimiento}
      />

      <Entrada
        id="correoDueno"
        name="correoDueno"
        type="email"
        etiqueta="Correo del dueño"
        ayuda="Recibe la invitación para crear su contraseña."
        required
        defaultValue={v.correoDueno}
      />

      <GrupoCampos leyenda="Sede principal (opcional)">
        <Entrada id="direccionSede" name="direccionSede" etiqueta="Dirección" maxLength={200} defaultValue={v.direccionSede} />
        <Entrada
          id="telefonoSede"
          name="telefonoSede"
          type="tel"
          etiqueta="Teléfono"
          maxLength={30}
          defaultValue={v.telefonoSede}
        />
      </GrupoCampos>

      <div className="flex items-center gap-4">
        <BotonEnviar textoEnviando="Creando…">Crear negocio</BotonEnviar>
        <Link href="/admin" className={`${enlace} text-zinc-600 dark:text-zinc-400`}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
