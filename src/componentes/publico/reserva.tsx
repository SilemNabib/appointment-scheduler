"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Contacto } from "@/dominio/contactos";
import { formatearDiaLocal, formatearHora } from "@/dominio/formato";
import type { FechaLocal } from "@/dominio/tiempo";
import type { ServicioOfrecido } from "@/servidor/casos-uso/pagina-publica";
import { reservar, type CitaCreada } from "./api";
import { BarraPasos } from "./barra-pasos";
import { EstadoPagina } from "./estado-pagina";
import { camposFaltantes, DATOS_VACIOS, PasoDatos, type CampoDatos, type DatosCliente } from "./paso-datos";
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
  const [datos, setDatos] = useState<DatosCliente>(DATOS_VACIOS);
  const [errores, setErrores] = useState<CampoDatos[]>([]);
  const [avisoEnvio, setAvisoEnvio] = useState<{ tipo: "error" | "advertencia"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cita, setCita] = useState<CitaCreada | null>(null);
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

  const cambiarDato = <C extends keyof DatosCliente>(campo: C, valor: DatosCliente[C]) => {
    setDatos((d) => ({ ...d, [campo]: valor }));
    // Al corregir un campo, su error se va.
    if (campo !== "sitioWeb") setErrores((e) => e.filter((c) => c !== campo));
  };

  const enviar = async () => {
    const faltan = camposFaltantes(datos);
    setAvisoEnvio(null);
    if (faltan.length > 0) return setErrores(faltan);
    if (!servicio || !inicio) return setPaso(servicio ? 1 : 0);
    setEnviando(true);
    const resultado = await reservar(props.slug, {
      sedeId: sede.id,
      servicioId: servicio.id,
      inicio,
      ...datos,
      politicaDatosId: props.politica.id,
    });
    setEnviando(false);
    if (resultado.ok) {
      setCita(resultado.valor);
      return setPaso(3);
    }
    const { codigo, campos } = resultado.error;
    if (codigo === "DATOS_INVALIDOS" && campos?.length) return setErrores(campos as CampoDatos[]);
    setAvisoEnvio({ tipo: "error", texto: "No pudimos confirmar tu reserva. Revisa los datos e intenta de nuevo." });
  };

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
          {paso === 2 && (
            <PasoDatos
              datos={datos}
              errores={errores}
              aviso={avisoEnvio}
              enviando={enviando}
              nombreNegocio={props.nombreNegocio}
              urlPolitica={`/${props.slug}/politica/${props.politica.version}`}
              versionPolitica={props.politica.version}
              alCambiar={cambiarDato}
              alEnviar={() => void enviar()}
              alVolver={() => setPaso(1)}
            />
          )}
          {paso === 3 && cita && <p className="m-0">Código de reserva: {cita.codigo}</p>}
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
