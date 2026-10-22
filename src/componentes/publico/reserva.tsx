"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Contacto } from "@/dominio/contactos";
import { formatearDiaLocal, formatearHora } from "@/dominio/formato";
import type { FechaLocal } from "@/dominio/tiempo";
import type { ServicioOfrecido } from "@/servidor/casos-uso/pagina-publica";
import { reservar, type CitaCreada, type CodigoApi } from "./api";
import { BarraPasos } from "./barra-pasos";
import { Confirmacion } from "./confirmacion";
import { EstadoPagina } from "./estado-pagina";
import { camposFaltantes, DATOS_VACIOS, PasoDatos, type CampoDatos, type DatosCliente } from "./paso-datos";
import { PasoHorario, useDisponibilidad } from "./paso-horario";
import { duracionTexto, PasoServicio } from "./paso-servicio";
import { Resumen } from "./resumen";

// El flujo de reserva de la página pública (F-01; DESIGN §3, §4.1): un solo componente
// de cliente con cuatro pasos (servicio, día y hora, datos y confirmación), sin el paso
// "Profesional" (D-24). Consulta y reserva con la API pública (ARCH §18.5), no con
// Server Actions. Cada cambio de paso mueve el foco a su título, y cada aviso, al aviso
// (RNF-03). Al confirmar (PUB-06; F-01; RN-04, RN-11):
//
// - 201: la confirmación con el código de reserva (D-28).
// - 409: vuelve a las horas con la disponibilidad recargada; los datos se conservan (G1).
// - 403 NEGOCIO_SUSPENDIDO: el estado de PUB-07, con los contactos.
// - 429 y falla de conexión: un aviso para reintentar, sin perder los datos (PUB-08).

const PASOS = [{ etiqueta: "Servicio" }, { etiqueta: "Día y hora" }, { etiqueta: "Tus datos" }, { etiqueta: "Confirmación" }] as const;

const TITULOS = ["¿Qué servicio quieres?", "Elige día y hora", "Tus datos", "Confirmación"] as const;

/** Textos de F-01, PUB-08 y DESIGN §5 (Q-43). */
const HORA_OCUPADA = "Esa hora se acaba de ocupar. Elige otra; tus datos se conservan.";
const AVISOS: Partial<Record<CodigoApi, { tipo: "error" | "advertencia"; texto: string }>> = {
  DEMASIADAS_SOLICITUDES: { tipo: "advertencia", texto: "Hiciste muchas solicitudes seguidas. Intenta en un minuto." },
  CONEXION: { tipo: "error", texto: "No pudimos conectarnos para confirmar tu reserva. Revisa tu conexión e intenta de nuevo; tus datos se conservan." },
  LIMITE_PLAN: { tipo: "error", texto: "Por ahora no es posible reservar en línea. Comunícate con el negocio para agendar tu cita." },
  NO_ENCONTRADO: { tipo: "error", texto: "Este servicio ya no está disponible. Recarga la página para ver los servicios." },
};
const AVISO_DATOS = { tipo: "error" as const, texto: "Revisa los datos e intenta de nuevo." };

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
  const [paso, setPasoEstado] = useState(0);
  // Sin animación de entrada en la primera carga: el título del primer paso es el LCP de
  // la página, y un fundido desde opacidad 0 lo retrasa (RNF-01). Anima al cambiar de paso.
  const [animar, setAnimar] = useState(false);
  const setPaso = (p: number) => {
    setAnimar(true);
    setPasoEstado(p);
  };
  const [servicioId, setServicioId] = useState<string | null>(null);
  const [fecha, setFecha] = useState<FechaLocal | null>(null);
  const [inicio, setInicio] = useState<string | null>(null);
  const [avisoHorario, setAvisoHorario] = useState<string | null>(null);
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
  // Suspendido después de cargar la página: el foco va al título del estado (PUB-07).
  useEffect(() => {
    if (suspendido) document.getElementById("estado-pagina")?.focus();
  }, [suspendido]);
  /** Impide un segundo envío mientras corre el primero, antes de que se vea "Procesando…". */
  const enCurso = useRef(false);

  const elegirServicio = (id: string) => {
    if (id !== servicioId) {
      setFecha(null);
      setInicio(null);
    }
    setAvisoHorario(null);
    setServicioId(id);
    setPaso(1);
  };
  const elegirInicio = (i: string | null) => {
    setInicio(i);
    if (i) setAvisoHorario(null);
  };
  const alSuspender = useCallback(() => setSuspendido(true), []);

  const cambiarDato = <C extends keyof DatosCliente>(campo: C, valor: DatosCliente[C]) => {
    setDatos((d) => ({ ...d, [campo]: valor }));
    // Al corregir un campo, su error se va.
    if (campo !== "sitioWeb") setErrores((e) => e.filter((c) => c !== campo));
  };

  const enviar = async () => {
    if (enCurso.current) return;
    const faltan = camposFaltantes(datos);
    setAvisoEnvio(null);
    if (faltan.length > 0) return setErrores(faltan);
    if (!servicio || !inicio) return setPaso(servicio ? 1 : 0);
    enCurso.current = true;
    setEnviando(true);
    const resultado = await reservar(props.slug, {
      sedeId: sede.id,
      servicioId: servicio.id,
      inicio,
      ...datos,
      politicaDatosId: props.politica.id,
    });
    enCurso.current = false;
    setEnviando(false);
    if (resultado.ok) {
      setCita(resultado.valor);
      return setPaso(3);
    }
    const { codigo, campos } = resultado.error;
    if (codigo === "DATOS_INVALIDOS" && campos?.length) return setErrores(campos as CampoDatos[]);
    if (codigo === "NEGOCIO_SUSPENDIDO") return setSuspendido(true);
    if (codigo === "HORARIO_NO_DISPONIBLE") {
      // F-01, G1: otra persona tomó la hora. Se vuelve a consultar el mes y se elige otra.
      disponibilidad.invalidar();
      setInicio(null);
      setAvisoHorario(HORA_OCUPADA);
      return setPaso(1);
    }
    setAvisoEnvio(AVISOS[codigo] ?? AVISO_DATOS);
  };

  const reservarOtra = () => {
    disponibilidad.invalidar();
    setCita(null);
    setServicioId(null);
    setFecha(null);
    setInicio(null);
    setErrores([]);
    setAvisoEnvio(null);
    setAvisoHorario(null);
    // Los datos del cliente se conservan: es la misma persona.
    setDatos((d) => ({ ...d, aceptaPolitica: false }));
    setPaso(0);
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
        {/* Confirmada la cita, ya no se vuelve a los pasos anteriores. */}
        <BarraPasos pasos={PASOS} actual={paso} alIr={paso === 3 ? undefined : setPaso} />
        <div key={paso} className={`flex flex-col gap-[18px] ${animar ? "animate-entrada" : ""}`}>
          <h2 id="titulo-paso" ref={titulo} tabIndex={-1} className="m-0 text-[26px] leading-tight font-bold outline-none">
            {paso === 3 && cita ? `¡Listo, ${datos.nombre.trim()}! Tu cita está confirmada` : TITULOS[paso]}
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
              alElegirInicio={elegirInicio}
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
          {paso === 3 && cita && servicio && (
            <Confirmacion
              cita={cita}
              servicio={servicio.nombre}
              correo={datos.correo.trim()}
              direccion={sede.direccion}
              zonaHoraria={zonaHoraria}
              alReservarOtra={reservarOtra}
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
