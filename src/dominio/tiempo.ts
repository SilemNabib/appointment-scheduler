import { TZDate, tz } from "@date-fns/tz";
import { format } from "date-fns";
import type { DiaSemana } from "./horario";

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

/** Si el valor es una fecha local `YYYY-MM-DD` que existe (por ejemplo, la de una URL). */
export function esFechaLocal(valor: unknown): valor is FechaLocal {
  if (typeof valor !== "string") return false;
  try {
    partesDeFecha(valor);
    return true;
  } catch {
    return false;
  }
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

// ─── Calendario local (ARCH §10.1) ────────────────────────────────────────────
// Operaciones sobre fechas `YYYY-MM-DD` que no dependen de ninguna zona: un día del
// calendario es el mismo en todas. Se calculan con `Date.UTC` solo como aritmética
// de calendario, nunca como instantes.

const comoFecha = (d: Date): FechaLocal => d.toISOString().slice(0, 10);

/** Día de la semana ISO de una fecha local: 1 = lunes … 7 = domingo (`horario_semanal.dia_semana`). */
export function diaSemana(fecha: FechaLocal): DiaSemana {
  const { anio, mes, dia } = partesDeFecha(fecha);
  const domingoEsCero = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return (domingoEsCero === 0 ? 7 : domingoEsCero) as DiaSemana;
}

/** La fecha local `dias` días después (o antes, si es negativo); cruza meses y años. */
export function sumarDias(fecha: FechaLocal, dias: number): FechaLocal {
  const { anio, mes, dia } = partesDeFecha(fecha);
  return comoFecha(new Date(Date.UTC(anio, mes - 1, dia + dias)));
}

/**
 * Fechas locales de `desde` a `hasta`, ambas inclusive y en orden. Lanza si alguna
 * fecha no existe o si `hasta` es anterior a `desde`.
 */
export function fechasDelRango(desde: FechaLocal, hasta: FechaLocal): FechaLocal[] {
  partesDeFecha(desde);
  partesDeFecha(hasta);
  if (hasta < desde) {
    throw new RangeError(`El rango termina (${hasta}) antes de empezar (${desde}).`);
  }
  const fechas: FechaLocal[] = [];
  // `YYYY-MM-DD` se ordena igual como texto que como fecha.
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) fechas.push(fecha);
  return fechas;
}

/**
 * Minutos desde las 00:00 locales de un instante, según el reloj de la zona; con
 * fracción si el instante no cae en un minuto exacto. Con él se alinean los inicios
 * con la granularidad contada desde la medianoche local (S-02).
 */
export function minutosLocales(instanteUtc: Date, zona: string): number {
  const d = new TZDate(instanteUtc.getTime(), zona);
  if (Number.isNaN(d.getTime()) || Number.isNaN(d.getHours())) throw new RangeError(`Zona horaria inválida: "${zona}".`);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60_000;
}

/**
 * Mes calendario local que contiene el instante, como intervalo UTC semiabierto
 * `[inicio, fin)`: de las 00:00 locales del día 1 a las 00:00 locales del día 1 del mes
 * siguiente. Es el período de los límites mensuales (ARCH §9, regla 5; §16.3).
 */
export function mesLocal(instanteUtc: Date, zona: string): { inicio: Date; fin: Date } {
  const { anio, mes } = partesDeFecha(fechaLocal(instanteUtc, zona));
  return {
    inicio: instante(new TZDate(anio, mes - 1, 1, 0, 0, 0, zona), zona),
    fin: instante(new TZDate(anio, mes, 1, 0, 0, 0, zona), zona),
  };
}
