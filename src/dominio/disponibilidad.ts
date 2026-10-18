import type { FranjaValida } from "./horario";
import { diaSemana, fechaLocal, fechasDelRango, localAUtc, minutosLocales, type FechaLocal } from "./tiempo";

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

const MS_POR_MINUTO = 60_000;
const MS_POR_DIA = 24 * 60 * MS_POR_MINUTO;

/** Semiabiertos: uno que empieza justo donde termina el otro no se solapa (S-04). */
const seSolapan = (a: Intervalo, b: Intervalo) => a.inicio < b.fin && b.inicio < a.fin;

/** Lo que una cita que empieza en `inicio` ocupa del recurso: duración más buffer (RN-10). */
function intervaloOcupado(ctx: ContextoAgenda, inicio: Date): Intervalo {
  const minutos = ctx.servicio.duracionMin + ctx.servicio.bufferMin;
  return { inicio, fin: new Date(inicio.getTime() + minutos * MS_POR_MINUTO) };
}

/**
 * RN-09.1: el intervalo completo cabe en UNA franja del día local en que empieza. Dos
 * franjas contiguas no se unen (D-12).
 */
function cabeEnUnaFranja(ctx: ContextoAgenda, intervalo: Intervalo): boolean {
  const fecha = fechaLocal(intervalo.inicio, ctx.zonaHoraria);
  const dia = diaSemana(fecha);
  return ctx.franjas.some(
    (f) =>
      f.dia === dia &&
      localAUtc(fecha, f.inicio, ctx.zonaHoraria) <= intervalo.inicio &&
      intervalo.fin <= localAUtc(fecha, f.fin, ctx.zonaHoraria),
  );
}

/** RN-09.3: el inicio cae en un múltiplo de la granularidad contado desde las 00:00 locales (S-02). */
function estaAlineado(ctx: ContextoAgenda, inicio: Date): boolean {
  return minutosLocales(inicio, ctx.zonaHoraria) % ctx.config.granularidadMin === 0;
}

/**
 * RN-09.4. Para el cliente, `ahora + anticipación mínima ≤ inicio ≤ ahora + anticipación
 * máxima`, ambos bordes incluidos. El dueño está exento (D-11), pero sin ella podría
 * elegir una hora que ya pasó: para él, solo `inicio ≥ ahora` (ARCH §10; Q-31).
 */
function respetaAnticipacion(ctx: ContextoAgenda, inicio: Date): boolean {
  const ahora = ctx.ahora.getTime();
  if (ctx.actor === "dueno") return inicio.getTime() >= ahora;
  const desde = ahora + ctx.config.anticipacionMinimaMin * MS_POR_MINUTO;
  const hasta = ahora + ctx.config.anticipacionMaximaDias * MS_POR_DIA;
  return desde <= inicio.getTime() && inicio.getTime() <= hasta;
}

/**
 * Verificación de un inicio concreto (RN-09). La usan la reserva y, en otras fases, la
 * reprogramación, la cita manual y el movimiento. Devuelve TODOS los motivos de
 * rechazo, en el orden de RN-09, para que la interfaz explique por qué una hora no
 * está disponible.
 */
export function evaluarInicio(
  ctx: ContextoAgenda,
  inicio: Date,
): { ok: true } | { ok: false; motivos: MotivoRechazo[] } {
  const intervalo = intervaloOcupado(ctx, inicio);
  const motivos: MotivoRechazo[] = [];
  if (!cabeEnUnaFranja(ctx, intervalo)) motivos.push("FUERA_DE_HORARIO"); // RN-09.1
  if (ctx.bloqueos.some((b) => seSolapan(b, intervalo))) motivos.push("BLOQUEADO"); // RN-09.2
  if (!estaAlineado(ctx, inicio)) motivos.push("NO_ALINEADO"); // RN-09.3
  if (!respetaAnticipacion(ctx, inicio)) motivos.push("ANTICIPACION"); // RN-09.4
  // RN-09.5: en TODO el intervalo, menos citas simultáneas que la capacidad (ARCH §10.2).
  if (maxSimultaneas(ctx.ocupacion, intervalo) >= ctx.capacidad) motivos.push("SIN_CAPACIDAD");
  return motivos.length === 0 ? { ok: true } : { ok: false, motivos };
}

/** Minutos desde las 00:00 de una hora local `HH:mm` (las franjas ya vienen validadas). */
const aMinutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

const aHora = (minutos: number) =>
  `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;

/**
 * Inicios reservables entre dos fechas locales, ambas inclusive, en orden (ARCH §10.1).
 * Recorre cada fecha y cada franja de su día por separado (D-12): empieza en el primer
 * múltiplo de la granularidad, contado desde las 00:00 locales, que no sea anterior al
 * inicio de la franja (S-02), y avanza mientras el intervalo completo quepa en ella. De
 * esos candidatos agrega los que pasan `evaluarInicio`: así la lista y la verificación
 * de una reserva coinciden siempre (RN-09). Lanza si el rango termina antes de empezar.
 */
export function iniciosDisponibles(ctx: ContextoAgenda, desde: FechaLocal, hasta: FechaLocal): Date[] {
  const granularidad = ctx.config.granularidadMin;
  const ocupaMs = (ctx.servicio.duracionMin + ctx.servicio.bufferMin) * MS_POR_MINUTO;
  const inicios = new Map<number, Date>();
  for (const fecha of fechasDelRango(desde, hasta)) {
    const dia = diaSemana(fecha);
    for (const f of ctx.franjas) {
      if (f.dia !== dia) continue;
      const finFranja = localAUtc(fecha, f.fin, ctx.zonaHoraria).getTime();
      for (let t = Math.ceil(aMinutos(f.inicio) / granularidad) * granularidad; t < 24 * 60; t += granularidad) {
        const inicio = localAUtc(fecha, aHora(t), ctx.zonaHoraria);
        if (inicio.getTime() + ocupaMs > finFranja) break; // RN-09.1: ya no cabe en ESTA franja
        if (evaluarInicio(ctx, inicio).ok) inicios.set(inicio.getTime(), inicio);
      }
    }
  }
  return [...inicios.values()].sort((a, b) => a.getTime() - b.getTime());
}
