import type { EstadoAsistencia } from "./estados-cita";
import { formatearFechaHora } from "./formato";

// Historial de la cita (PAN-03, F-08; RN-03, RNF-02; ARCH §18.2, `evento_cita`; Q-55).
// Convierte los eventos de una cita en las líneas que el detalle muestra: qué pasó, quién
// lo hizo y cuándo, en la zona del negocio y con la hora de 12 horas. Los `datos` llegan
// de la base como JSON: se leen con cuidado, y un evento que no se conoce no rompe el
// historial.

/** Un evento de `evento_cita`, como sale de la base (ARCH §18.2). */
export type EventoCita = {
  tipo: string;
  actor: "cliente" | "dueno" | "sistema";
  datos: unknown;
  creadoEn: Date;
};

/** Quién lo hizo, como lo lee el dueño: el cliente, "tú" o el sistema. */
export type Autor = "cliente" | "tu" | "sistema";

export type LineaHistorial = {
  /** Qué pasó y quién: "Reservada por el cliente". */
  texto: string;
  /** Lo que cambió, si aplica: las dos horas de un movimiento o los dos estados de una corrección. */
  detalle: string | null;
  autor: Autor;
  /** Cuándo, en la zona del negocio: "14 de octubre de 2026 a las 7:00 p. m.". */
  cuando: string;
};

const AUTOR: Record<EventoCita["actor"], Autor> = { cliente: "cliente", dueno: "tu", sistema: "sistema" };

const POR: Record<Autor, string> = { cliente: "por el cliente", tu: "por ti", sistema: "por el sistema" };

/** Los estados de la asistencia en las palabras de los botones (PAN-07). */
const ASISTENCIA: Record<EstadoAsistencia, string> = { completada: "asistió", no_asistio: "no asistió" };

const campo = (datos: unknown, nombre: string): unknown =>
  typeof datos === "object" && datos !== null ? (datos as Record<string, unknown>)[nombre] : undefined;

/** Un instante ISO de `datos`, o `null` si falta o no es válido. */
function instante(datos: unknown, nombre: string): Date | null {
  const valor = campo(datos, nombre);
  if (typeof valor !== "string") return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

const asistencia = (valor: unknown): string | null =>
  valor === "completada" || valor === "no_asistio" ? ASISTENCIA[valor] : null;

/** La línea del historial de un evento, en la zona del negocio (RN-03). */
export function lineaDeHistorial(evento: EventoCita, zona: string): LineaHistorial {
  const autor = AUTOR[evento.actor] ?? "sistema";
  const por = POR[autor];
  const cuando = formatearFechaHora(evento.creadoEn, zona);
  const linea = (texto: string, detalle: string | null = null): LineaHistorial => ({ texto, detalle, autor, cuando });

  switch (evento.tipo) {
    case "creada":
      return linea(autor === "cliente" ? "Reservada por el cliente" : `Creada ${por}`);
    case "reprogramada": {
      const anterior = instante(evento.datos, "inicio_anterior");
      const nuevo = instante(evento.datos, "inicio_nuevo");
      const detalle =
        anterior && nuevo ? `Del ${formatearFechaHora(anterior, zona)} al ${formatearFechaHora(nuevo, zona)}` : null;
      return linea(autor === "tu" ? "Movida por ti" : `Reprogramada ${por}`, detalle);
    }
    case "cancelada":
      return linea(`Cancelada ${por}`);
    case "completada":
    case "no_asistio": {
      const estado = ASISTENCIA[evento.tipo];
      // F-08, paso 4: lo que marca el cron (D-21) lleva `{ "automatica": true }`.
      if (autor === "sistema" && campo(evento.datos, "automatica") === true) {
        return linea(`Marcada automáticamente como ${estado}`);
      }
      return linea(`Marcada como ${estado} ${por}`);
    }
    case "estado_corregido": {
      const de = asistencia(campo(evento.datos, "de"));
      const a = asistencia(campo(evento.datos, "a"));
      return linea(`Asistencia corregida ${por}`, de && a ? `De ${de} a ${a}` : null);
    }
    default:
      return linea(`Cambio registrado ${por}`);
  }
}

/** Las líneas del historial, en el orden de los eventos. */
export function historialDeCita(eventos: readonly EventoCita[], zona: string): LineaHistorial[] {
  return eventos.map((evento) => lineaDeHistorial(evento, zona));
}
