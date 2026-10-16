import { exito, fallo, type Resultado } from "./resultado";
import type { HoraLocal } from "./tiempo";

// Horario semanal (RN-07; ARCH §9 y §17.3). Cada día puede tener varias franjas, para
// permitir pausas. Las horas son locales de la sede, y los intervalos, semiabiertos
// `[inicio, fin)`: dos franjas contiguas (8:00–12:00 y 12:00–14:00) no se solapan
// (S-04), pero siguen siendo independientes para el motor (D-12).

/** Día ISO: 1 = lunes … 7 = domingo (`horario_semanal.dia_semana`). */
export type DiaSemana = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DIAS_SEMANA: readonly DiaSemana[] = [1, 2, 3, 4, 5, 6, 7];

export type Franja = { dia: number; inicio: HoraLocal; fin: HoraLocal };

/** Franja ya validada: día ISO y horas `HH:mm`. */
export type FranjaValida = { dia: DiaSemana; inicio: HoraLocal; fin: HoraLocal };

export type ErrorSemana =
  /** Franjas que se solapan dentro de un día; trae los días afectados. */
  | { codigo: "FRANJAS_SOLAPADAS"; dias: DiaSemana[] }
  /** Una franja mal formada: día fuera de 1 a 7, hora inválida o fin que no va después del inicio. */
  | { codigo: "DATOS_INVALIDOS"; indice: number };

/** `HH:mm` o `HH:mm:ss` (como la devuelve una columna `time`), de 00:00 a 23:59. */
const FORMATO_HORA = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/;

const minutos = (hora: HoraLocal) => {
  const m = FORMATO_HORA.exec(hora);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const esDia = (dia: number): dia is DiaSemana => Number.isInteger(dia) && dia >= 1 && dia <= 7;

/**
 * Valida la semana completa: cada franja con un día de 1 a 7 y `inicio < fin`, y sin
 * solapes dentro de un mismo día. Devuelve las franjas con las horas en `HH:mm`,
 * ordenadas por día e inicio. La misma franja en días distintos no se solapa.
 */
export function validarSemana(franjas: readonly Franja[]): Resultado<FranjaValida[], ErrorSemana> {
  const validas: (FranjaValida & { desde: number; hasta: number })[] = [];
  for (const [indice, { dia, inicio, fin }] of franjas.entries()) {
    const [desde, hasta] = [minutos(inicio), minutos(fin)];
    if (!esDia(dia) || desde === null || hasta === null || hasta <= desde) {
      return fallo({ codigo: "DATOS_INVALIDOS", indice });
    }
    validas.push({ dia, inicio: inicio.slice(0, 5), fin: fin.slice(0, 5), desde, hasta });
  }

  validas.sort((a, b) => a.dia - b.dia || a.desde - b.desde || a.hasta - b.hasta);

  const solapados = new Set<DiaSemana>();
  for (let i = 1; i < validas.length; i++) {
    const [anterior, actual] = [validas[i - 1], validas[i]];
    // Semiabiertos: que una empiece justo donde termina la otra no es un solape (S-04).
    if (actual.dia === anterior.dia && actual.desde < anterior.hasta) solapados.add(actual.dia);
  }
  if (solapados.size > 0) return fallo({ codigo: "FRANJAS_SOLAPADAS", dias: [...solapados] });

  return exito(validas.map(({ dia, inicio, fin }) => ({ dia, inicio, fin })));
}
