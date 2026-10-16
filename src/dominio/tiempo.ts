import { TZDate, tz } from "@date-fns/tz";
import { format } from "date-fns";

// Conversión entre hora local y UTC (RN-03, ARCH §9). Es el ÚNICO lugar donde se
// convierte: siempre para una fecha concreta y con la zona del negocio, nunca con
// la zona del proceso. Colombia no tiene horario de verano, pero el código no lo
// da por hecho: la zona resuelve el desfase de cada fecha.

/** Valor por defecto de `negocio.zona_horaria` (ARCH §9). */
export const ZONA_HORARIA_POR_DEFECTO = "America/Bogota";

/** Fecha local del calendario, `YYYY-MM-DD` (ARCH §9, regla 4). */
export type FechaLocal = string;

/** Hora local, `HH:mm` o `HH:mm:ss` (como la devuelve una columna `time`). */
export type HoraLocal = string;

const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATO_HORA = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function partesDeFecha(fecha: FechaLocal) {
  const m = FORMATO_FECHA.exec(fecha);
  if (m) {
    const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    // Date.UTC desborda los días inexistentes (31 de abril → 1 de mayo): si las
    // partes no vuelven iguales, la fecha no existe.
    const d = new Date(Date.UTC(anio, mes - 1, dia));
    if (d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia) {
      return { anio, mes, dia };
    }
  }
  throw new RangeError(`Fecha local inválida: "${fecha}" (se espera YYYY-MM-DD).`);
}

function partesDeHora(hora: HoraLocal) {
  const m = FORMATO_HORA.exec(hora);
  if (m) {
    const [horas, minutos, segundos] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
    if (horas <= 23 && minutos <= 59 && segundos <= 59) return { horas, minutos, segundos };
  }
  throw new RangeError(`Hora local inválida: "${hora}" (se espera HH:mm o HH:mm:ss).`);
}

/** Construye el instante y falla si la zona no existe, en vez de devolver una fecha inválida. */
function instante(fecha: TZDate, zona: string): Date {
  const ms = fecha.getTime();
  if (Number.isNaN(ms)) throw new RangeError(`Zona horaria inválida: "${zona}".`);
  return new Date(ms);
}

/**
 * Instante (UTC) que corresponde a una fecha y hora locales en la zona del negocio.
 * Por ejemplo, el 14-oct-2026 a las 19:00 en `America/Bogota` es `2026-10-15T00:00:00Z`.
 */
export function localAUtc(fecha: FechaLocal, hora: HoraLocal, zona: string): Date {
  const { anio, mes, dia } = partesDeFecha(fecha);
  const { horas, minutos, segundos } = partesDeHora(hora);
  return instante(new TZDate(anio, mes - 1, dia, horas, minutos, segundos, zona), zona);
}

/** Fecha local (`YYYY-MM-DD`) de un instante en la zona del negocio. */
export function fechaLocal(instanteUtc: Date, zona: string): FechaLocal {
  return format(instanteUtc, "yyyy-MM-dd", { in: tz(zona) });
}

/**
 * Vencimiento elegido como fecha local **inclusiva** ("pagado hasta el 9 de octubre")
 * → instante que se guarda: las 00:00 locales del día siguiente (ARCH §7.6).
 * En `America/Bogota`, `2026-10-09` da `2026-10-10T05:00:00Z`.
 */
export function vencimientoAInstante(fecha: FechaLocal, zona: string): Date {
  const { anio, mes, dia } = partesDeFecha(fecha);
  // El día 32 se desborda al mes siguiente, como en `Date`.
  return instante(new TZDate(anio, mes - 1, dia + 1, 0, 0, 0, zona), zona);
}

/**
 * Inversa de `vencimientoAInstante`: el último día local que cubre el vencimiento.
 * Es la fecha local del instante anterior, así también responde bien a un valor
 * guardado con SQL directo que no cae a las 00:00 locales.
 */
export function instanteAVencimiento(vence: Date, zona: string): FechaLocal {
  return fechaLocal(new Date(vence.getTime() - 1), zona);
}

/**
 * Días locales completos, de `desde` a `hasta` (inclusive), como intervalo UTC
 * semiabierto `[inicio, fin)`: de las 00:00 locales de `desde` a las 00:00 locales
 * del día siguiente a `hasta` (ARCH §9, reglas 1 y 2). Un día completo es
 * `desde = hasta`. Lanza si alguna fecha no existe o si `hasta` es anterior a `desde`.
 */
export function intervaloDeDias(desde: FechaLocal, hasta: FechaLocal, zona: string): { inicio: Date; fin: Date } {
  const [a, b] = [partesDeFecha(desde), partesDeFecha(hasta)];
  if (Date.UTC(b.anio, b.mes - 1, b.dia) < Date.UTC(a.anio, a.mes - 1, a.dia)) {
    throw new RangeError(`El intervalo termina (${hasta}) antes de empezar (${desde}).`);
  }
  return {
    inicio: instante(new TZDate(a.anio, a.mes - 1, a.dia, 0, 0, 0, zona), zona),
    fin: instante(new TZDate(b.anio, b.mes - 1, b.dia + 1, 0, 0, 0, zona), zona),
  };
}
