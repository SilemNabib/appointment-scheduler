"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Contacto } from "@/dominio/contactos";
import { formatearDiaLocal, formatearHora } from "@/dominio/formato";
import type { FechaLocal } from "@/dominio/tiempo";
import type { ServicioOfrecido } from "@/servidor/casos-uso/pagina-publica";
import { BarraPasos } from "./barra-pasos";
import { EstadoPagina } from "./estado-pagina";
import { PasoHorario, useDisponibilidad } from "./paso-horario";
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
  hoy: FechaLocal;
  ultimoDia: FechaLocal;
};

export function Reserva(props: PropsReserva) {
  const { servicios, sede, hoy, ultimoDia, zonaHoraria } = props;
  const [paso, setPaso] = useState(0);
  const [servicioId, setServicioId] = useState<string | null>(null);
  const [fecha, setFecha] = useState<FechaLocal | null>(null);
  const [inicio, setInicio] = useState<string | null>(null);
  const [avisoHorario] = useState<string | null>(null);
  const [suspendido, setSuspendido] = useState(false);
  const servicio = servicios.find((s) => s.id === servicioId) ?? null;
  const disponibilidad = useDisponibilidad({ slug: props.slug, sedeId: sede.id, servicioId, hoy, ultimoDia });

  // El foco va al título del paso al cambiar de paso, no al cargar la página.
  const titulo = useRef<HTMLHeadingElement>(null);
  const montado = useRef(false);
  useEffect(() => {
    if (montado.current) titulo.current?.focus();
    montado.current = true;
  }, [paso]);

  const elegirServicio = (id: string) => {
    if (id !== servicioId) {
      setFecha(null);
      setInicio(null);
    }
    setServicioId(id);
    setPaso(1);
  };
  const alSuspender = useCallback(() => setSuspendido(true), []);

  if (suspendido) {
    return <EstadoPagina estado="suspendida" nombre={props.nombreNegocio} contactos={sede.contactos} />;
  }

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
          {paso === 1 && (
            <PasoHorario
              disponibilidad={disponibilidad}
              hoy={hoy}
              ultimoDia={ultimoDia}
              zonaHoraria={zonaHoraria}
              fecha={fecha}
              inicio={inicio}
              aviso={avisoHorario}
              alElegirFecha={setFecha}
              alElegirInicio={setInicio}
              alSuspender={alSuspender}
              alContinuar={() => setPaso(2)}
              alVolver={() => setPaso(0)}
            />
          )}
        </div>
      </section>
      <Resumen
        filas={[
          { etiqueta: "Servicio", valor: servicio ? `${servicio.nombre} · ${duracionTexto(servicio.duracionMinutos)}` : "Elige un servicio" },
          {
            etiqueta: "Día y hora",
            valor: fecha && inicio ? `${formatearDiaLocal(fecha)} · ${formatearHora(new Date(inicio), zonaHoraria)}` : null,
          },
        ]}
      />
    </div>
  );
}
