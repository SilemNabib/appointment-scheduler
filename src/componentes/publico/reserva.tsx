"use client";

import { useEffect, useRef, useState } from "react";
import type { Contacto } from "@/dominio/contactos";
import type { ServicioOfrecido } from "@/servidor/casos-uso/pagina-publica";
import { BarraPasos } from "./barra-pasos";
import { duracionTexto, PasoServicio } from "./paso-servicio";
import { Resumen } from "./resumen";

// El flujo de reserva de la página pública (F-01; DESIGN §3, §4.1): un solo componente
// de cliente con cuatro pasos (servicio, día y hora, datos y confirmación), sin el paso
// "Profesional" (D-24). Consulta y reserva con la API pública (ARCH §18.5), no con
// Server Actions. Cada cambio de paso mueve el foco a su título (RNF-03).

const PASOS = [{ etiqueta: "Servicio" }, { etiqueta: "Día y hora" }, { etiqueta: "Tus datos" }, { etiqueta: "Confirmación" }] as const;

const TITULOS = ["¿Qué servicio quieres?", "Elige día y hora", "Tus datos", "Confirmación"] as const;

export type PropsReserva = {
  slug: string;
  nombreNegocio: string;
  zonaHoraria: string;
  sede: { id: string; direccion: string | null; contactos: Contacto[] };
  servicios: ServicioOfrecido[];
  politica: { id: string; version: number };
  hoy: string;
  ultimoDia: string;
};

export function Reserva(props: PropsReserva) {
  const { servicios } = props;
  const [paso, setPaso] = useState(0);
  const [servicioId, setServicioId] = useState<string | null>(null);
  const servicio = servicios.find((s) => s.id === servicioId) ?? null;

  // El foco va al título del paso al cambiar de paso, no al cargar la página.
  const titulo = useRef<HTMLHeadingElement>(null);
  const montado = useRef(false);
  useEffect(() => {
    if (montado.current) titulo.current?.focus();
    montado.current = true;
  }, [paso]);

  const elegirServicio = (id: string) => {
    setServicioId(id);
    setPaso(1);
  };

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section
        aria-labelledby="titulo-paso"
        className="flex min-w-0 flex-[999_1_560px] flex-col gap-[22px] rounded-tarjeta border border-borde bg-superficie p-[18px] sm:p-6"
      >
        <BarraPasos pasos={PASOS} actual={paso} alIr={setPaso} />
        <div key={paso} className="flex animate-entrada flex-col gap-[18px]">
          <h2 id="titulo-paso" ref={titulo} tabIndex={-1} className="m-0 text-[26px] leading-tight font-bold outline-none">
            {TITULOS[paso]}
          </h2>
          {paso === 0 && <PasoServicio servicios={servicios} elegido={servicioId} alElegir={elegirServicio} />}
        </div>
      </section>
      <Resumen
        filas={[
          { etiqueta: "Servicio", valor: servicio ? `${servicio.nombre} · ${duracionTexto(servicio.duracionMinutos)}` : "Elige un servicio" },
          { etiqueta: "Día y hora", valor: null },
        ]}
      />
    </div>
  );
}
