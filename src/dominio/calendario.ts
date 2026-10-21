import { diaSemana, sumarDias, type FechaLocal } from "./tiempo";

// Calendario del mes de la página pública (PUB-03; F-01; Q-48). Trabaja con fechas
// locales `YYYY-MM-DD`, que son las de la zona del negocio (ARCH §9): no depende de la
// zona del dispositivo. Una consulta de disponibilidad por mes visible, recortada a los
// días reservables, que nunca pasa de los 31 días de ARCH §18.5.

/** Un mes del calendario: `mes` de 1 a 12. */
export type Mes = { anio: number; mes: number };

/** Una semana, de lunes a domingo; `null` en los días de otro mes. */
export type Semana = (FechaLocal | null)[];

const dos = (n: number) => String(n).padStart(2, "0");

/** El día 1 del mes como fecha local. */
export const primerDia = ({ anio, mes }: Mes): FechaLocal => `${anio}-${dos(mes)}-01`;

/** El último día del mes como fecha local (28 a 31). */
export function ultimoDiaDelMes({ anio, mes }: Mes): FechaLocal {
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${dos(mes)}-${dos(dias)}`;
}

/** El mes de una fecha local. */
export const mesDe = (fecha: FechaLocal): Mes => ({ anio: Number(fecha.slice(0, 4)), mes: Number(fecha.slice(5, 7)) });

/** El mes siguiente (`+1`) o anterior (`-1`). */
export function moverMes({ anio, mes }: Mes, pasos: number): Mes {
  const indice = anio * 12 + (mes - 1) + pasos;
  return { anio: Math.floor(indice / 12), mes: (indice % 12) + 1 };
}

const indiceDe = (m: Mes) => m.anio * 12 + m.mes;

/** Las semanas del mes, con el lunes primero; los días de otros meses van en `null`. */
export function semanasDelMes(m: Mes): Semana[] {
  const desde = primerDia(m);
  const hasta = ultimoDiaDelMes(m);
  const celdas: (FechaLocal | null)[] = Array.from({ length: diaSemana(desde) - 1 }, () => null);
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) celdas.push(fecha);
  while (celdas.length % 7 !== 0) celdas.push(null);
  return Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7));
}

/** Los meses a los que se puede ir: del de hoy al del último día reservable, ambos inclusive. */
export function mesesNavegables(hoy: FechaLocal, ultimoDia: FechaLocal): Mes[] {
  const meses: Mes[] = [];
  for (let m = mesDe(hoy); indiceDe(m) <= indiceDe(mesDe(ultimoDia)); m = moverMes(m, 1)) meses.push(m);
  return meses;
}

/**
 * El rango que se consulta para un mes (Q-48): del día 1 (o hoy) al último día del mes
 * (o el último día reservable). `null` si el mes queda fuera de los días reservables.
 */
export function rangoDelMes(m: Mes, hoy: FechaLocal, ultimoDia: FechaLocal): { desde: FechaLocal; hasta: FechaLocal } | null {
  const desde = primerDia(m) < hoy ? hoy : primerDia(m);
  const hasta = ultimoDiaDelMes(m) > ultimoDia ? ultimoDia : ultimoDiaDelMes(m);
  return desde <= hasta ? { desde, hasta } : null;
}

/** Un día de la respuesta de disponibilidad (ARCH §18.5). */
export type DiaConInicios = { fecha: FechaLocal; inicios: readonly string[] };

/**
 * El primer día con al menos un inicio, desde `desde` inclusive (F-01). Para ofrecer el
 * día siguiente a uno sin horas, se pasa el día después. `null` si no hay ninguno en los
 * días consultados: entonces se consulta el mes siguiente (Q-48).
 */
export function siguienteDiaConCupo(dias: readonly DiaConInicios[], desde: FechaLocal): FechaLocal | null {
  const con = dias.filter((d) => d.fecha >= desde && d.inicios.length > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  return con[0]?.fecha ?? null;
}
