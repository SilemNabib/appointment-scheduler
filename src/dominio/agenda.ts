import type { Intervalo } from "./disponibilidad";
import type { EstadoCita } from "./estados-cita";
import type { FranjaValida } from "./horario";
import { diaSemana, fechaLocal, localAUtc, sumarDias, type FechaLocal } from "./tiempo";

// La agenda del panel (PAN-02, F-06; RN-03, RN-10, S-02, S-04; ARCH §9; Q-52, Q-56,
// Q-58). Trabaja con fechas locales `YYYY-MM-DD` y la zona del negocio, nunca la del
// dispositivo: agrupa las citas por día local, da la semana de una fecha y calcula los
// espacios libres de un día, que solo abren "Nueva cita" (la hora la confirma
// `consultarHorasDueno` con el servicio elegido).

/** Una semana de lunes a domingo, con sus dos fechas locales incluidas. */
export type Semana = { desde: FechaLocal; hasta: FechaLocal };

/** La semana (de lunes a domingo) que contiene la fecha local. */
export function semanaDe(fecha: FechaLocal): Semana {
  const desde = sumarDias(fecha, 1 - diaSemana(fecha));
  return { desde, hasta: sumarDias(desde, 6) };
}

/** La semana anterior (`-1`) o siguiente (`+1`) a la de la fecha. */
export function moverSemana(fecha: FechaLocal, pasos: number): Semana {
  return semanaDe(sumarDias(semanaDe(fecha).desde, 7 * pasos));
}

/**
 * Las citas agrupadas por su día local en la zona del negocio (RN-03; ARCH §9): una cita
 * a las 7:00 p. m. del 14 de octubre en Bogotá (`2026-10-15T00:00:00Z`) va en el 14.
 * Dentro de cada día conservan el orden en que llegan.
 */
export function agruparPorDia<T extends { inicio: Date }>(citas: readonly T[], zona: string): Map<FechaLocal, T[]> {
  const porDia = new Map<FechaLocal, T[]>();
  for (const cita of citas) {
    const dia = fechaLocal(cita.inicio, zona);
    const lista = porDia.get(dia);
    if (lista) lista.push(cita);
    else porDia.set(dia, [cita]);
  }
  return porDia;
}

/** Lo que una cita ocupa del recurso: `[inicio, ocupado_hasta)` (RN-10). */
export type CitaEnAgenda = { inicio: Date; ocupadoHasta: Date; estado: EstadoCita };

export type PeticionEspacios = {
  fecha: FechaLocal;
  zonaHoraria: string;
  /** Las franjas de la sede; solo cuentan las del día de la semana de `fecha` (D-12). */
  franjas: readonly FranjaValida[];
  granularidadMin: number;
  citas: readonly CitaEnAgenda[];
  bloqueos: readonly Intervalo[];
  /** Los espacios que empiezan antes no se ofrecen: el dueño no agenda en el pasado (D-11). */
  ahora: Date;
};

const MS_POR_MINUTO = 60_000;

/** Minutos desde las 00:00 de una hora local `HH:mm` (las franjas ya vienen validadas). */
const aMinutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

/** Semiabiertos: uno que empieza justo donde termina el otro no se solapa (S-04). */
const seSolapan = (a: Intervalo, b: Intervalo) => a.inicio < b.fin && b.inicio < a.fin;

/**
 * Los espacios libres de un día (Q-56): los inicios alineados a la granularidad, contada
 * desde las 00:00 locales (S-02), cuyo espacio `[t, t + granularidad)` cabe en una
 * franja del día y no se solapa con ninguna cita activa ni con ningún bloqueo. Una cita
 * cancelada no ocupa (RN-10). No dependen de ningún servicio: solo ayudan a abrir "Nueva
 * cita" con esa fecha y esa hora, y la hora se confirma con las horas libres del
 * servicio (T5.06).
 */
export function espaciosLibres(p: PeticionEspacios): Date[] {
  const dia = diaSemana(p.fecha);
  const ocupado: Intervalo[] = [
    ...p.citas.filter((c) => c.estado !== "cancelada").map((c) => ({ inicio: c.inicio, fin: c.ocupadoHasta })),
    ...p.bloqueos,
  ];
  const espacios = new Map<number, Date>();
  for (const franja of p.franjas) {
    if (franja.dia !== dia) continue;
    const finFranja = localAUtc(p.fecha, franja.fin, p.zonaHoraria).getTime();
    const primero = Math.ceil(aMinutos(franja.inicio) / p.granularidadMin) * p.granularidadMin;
    for (let t = primero; t < 24 * 60; t += p.granularidadMin) {
      const hora = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
      const inicio = localAUtc(p.fecha, hora, p.zonaHoraria);
      const espacio = { inicio, fin: new Date(inicio.getTime() + p.granularidadMin * MS_POR_MINUTO) };
      if (espacio.fin.getTime() > finFranja) break;
      if (inicio < p.ahora || ocupado.some((o) => seSolapan(o, espacio))) continue;
      espacios.set(inicio.getTime(), inicio);
    }
  }
  return [...espacios.values()].sort((a, b) => a.getTime() - b.getTime());
}
