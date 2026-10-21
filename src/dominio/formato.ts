import { fechaLocal, localAUtc, type FechaLocal, type HoraLocal } from "./tiempo";

// Cómo se muestran las fechas y las horas (RN-03, RNF-02; ARCH §9, regla 3): con
// `Intl.DateTimeFormat('es-CO')`, la hora en formato de 12 horas ("7:00 p. m.") y
// siempre en la zona del negocio, nunca en la del servidor ni la del dispositivo.
//
// `Intl` separa algunas partes con espacios especiales (sin salto de línea), según la
// versión de ICU: el texto es para mostrarlo, no para compararlo ni analizarlo.

const LOCALE = "es-CO";

type Estilo = Pick<Intl.DateTimeFormatOptions, "dateStyle" | "timeStyle">;

function formatear(instante: Date, zona: string, estilo: Estilo): string {
  return new Intl.DateTimeFormat(LOCALE, {
    ...estilo,
    // `hourCycle` asegura las 12 horas aunque cambien los datos del locale (RNF-02).
    ...(estilo.timeStyle ? { hourCycle: "h12" } : {}),
    timeZone: zona,
  }).format(instante);
}

/** Fecha de un instante en la zona del negocio: "14 de octubre de 2026". */
export function formatearFecha(instante: Date, zona: string): string {
  return formatear(instante, zona, { dateStyle: "long" });
}

/** Hora de un instante en la zona del negocio: "7:00 p. m.". */
export function formatearHora(instante: Date, zona: string): string {
  return formatear(instante, zona, { timeStyle: "short" });
}

/** Fecha y hora de un instante en la zona del negocio: "14 de octubre de 2026 a las 7:00 p. m.". */
export function formatearFechaHora(instante: Date, zona: string): string {
  return formatear(instante, zona, { dateStyle: "long", timeStyle: "short" });
}

/**
 * Fecha local `YYYY-MM-DD`, que ya está en la zona del negocio (un vencimiento o el
 * día de un bloqueo): "14 de octubre de 2026". Se formatea en UTC para que ninguna
 * zona la mueva de día. Lanza si la fecha no existe.
 */
export function formatearFechaLocal(fecha: FechaLocal): string {
  return formatearFecha(localAUtc(fecha, "00:00", "UTC"), "UTC");
}

/** Fecha local con el día de la semana y sin el año: "jueves, 22 de octubre" (PUB-03, PUB-06). */
export function formatearDiaLocal(fecha: FechaLocal, conAnio = false): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(conAnio ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(localAUtc(fecha, "00:00", "UTC"));
}

/** El mes de una fecha local, con mayúscula inicial: "Octubre de 2026" (el calendario de PUB-03). */
export function formatearMesLocal(fecha: FechaLocal): string {
  const texto = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    localAUtc(fecha, "00:00", "UTC"),
  );
  return texto.charAt(0).toLocaleUpperCase(LOCALE) + texto.slice(1);
}

/**
 * Hora local `HH:mm` o `HH:mm:ss`, como la guarda el horario semanal: "08:00" →
 * "8:00 a. m.". Lanza si la hora no es válida.
 */
export function formatearHoraLocal(hora: HoraLocal): string {
  return formatearHora(localAUtc("2000-01-01", hora, "UTC"), "UTC");
}

/**
 * Un intervalo `[inicio, fin)` en palabras, en la zona del negocio, como se muestran
 * los bloqueos (PAN-08). Si empieza y termina a medianoche local son días completos:
 * "14 de octubre de 2026, todo el día" o "Del 14 de octubre de 2026 al 16 de octubre
 * de 2026". Si cabe en un día: "14 de octubre de 2026, de 2:00 p. m. a 4:30 p. m.".
 * Si no: "Del … a las … al … a las …".
 */
export function formatearIntervalo(inicio: Date, fin: Date, zona: string): string {
  const aMedianoche = (instante: Date) =>
    localAUtc(fechaLocal(instante, zona), "00:00", zona).getTime() === instante.getTime();
  // El último instante incluido: `fin` no forma parte del intervalo.
  const [desde, hasta] = [fechaLocal(inicio, zona), fechaLocal(new Date(fin.getTime() - 1), zona)];

  if (aMedianoche(inicio) && aMedianoche(fin)) {
    return desde === hasta
      ? `${formatearFechaLocal(desde)}, todo el día`
      : `Del ${formatearFechaLocal(desde)} al ${formatearFechaLocal(hasta)}`;
  }
  if (desde === hasta) {
    return `${formatearFecha(inicio, zona)}, de ${formatearHora(inicio, zona)} a ${formatearHora(fin, zona)}`;
  }
  return `Del ${formatearFechaHora(inicio, zona)} al ${formatearFechaHora(fin, zona)}`;
}
