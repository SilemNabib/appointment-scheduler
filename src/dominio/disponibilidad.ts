import type { FranjaValida } from "./horario";

// Motor de disponibilidad (RN-07 a RN-10; ARCH §10). Es puro: trabaja sobre UN
// servicio en UNA sede, con los datos que recibe en el contexto y el `ahora` inyectado.
// La misma verificación decide qué horas se listan y si una reserva es válida dentro
// de la transacción, así lo que no se ofrece tampoco se puede reservar (RN-09).

/** Intervalo UTC semiabierto `[inicio, fin)` (S-04). */
export type Intervalo = { inicio: Date; fin: Date };

export type ContextoAgenda = {
  zonaHoraria: string;
  ahora: Date;
  /** Los de `servicio_sede` si la sede los sobrescribe; si no, los del servicio (RN-32). */
  servicio: { duracionMin: number; bufferMin: number };
  capacidad: number;
  config: { granularidadMin: 15 | 30 | 60; anticipacionMinimaMin: number; anticipacionMaximaDias: number };
  /** Franjas de la SEDE, en hora local (D-12: cada una por separado). */
  franjas: FranjaValida[];
  /** Del negocio, de la sede o del recurso, que se solapan con el rango consultado. */
  bloqueos: Intervalo[];
  /** Citas NO canceladas del recurso (RN-10, D-06): `[inicio, ocupado_hasta)`. */
  ocupacion: Intervalo[];
  /** El dueño está exento de la anticipación mínima y máxima (D-11). */
  actor: "cliente" | "dueno";
};

export type MotivoRechazo = "FUERA_DE_HORARIO" | "BLOQUEADO" | "NO_ALINEADO" | "ANTICIPACION" | "SIN_CAPACIDAD";

/**
 * Máximo de citas simultáneas dentro de la ventana (RN-09.5; ARCH §10.2). No basta
 * con contar las que se solapan con ella: dos citas escalonadas (9:00–9:30 y
 * 9:30–10:00) se solapan con 9:00–10:00, pero nunca coinciden entre sí. Por eso se
 * hace un barrido de eventos; en el mismo instante, primero las salidas (S-04).
 */
export function maxSimultaneas(ocupacion: readonly Intervalo[], ventana: Intervalo): number {
  const eventos: [number, 1 | -1][] = [];
  for (const o of ocupacion) {
    const inicio = Math.max(o.inicio.getTime(), ventana.inicio.getTime());
    const fin = Math.min(o.fin.getTime(), ventana.fin.getTime());
    if (inicio < fin) eventos.push([inicio, +1], [fin, -1]);
  }
  eventos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let actual = 0;
  let maximo = 0;
  for (const [, delta] of eventos) maximo = Math.max(maximo, (actual += delta));
  return maximo;
}
