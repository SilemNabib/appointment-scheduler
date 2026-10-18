import { describe, expect, test } from "vitest";
import { iniciosDisponibles } from "@/dominio/disponibilidad";
import { intervaloDeDias } from "@/dominio/tiempo";
import { BOGOTA, contexto, franja, intervalo, local } from "./ayudantes-disponibilidad";

// iniciosDisponibles (RN-07 a RN-10; ARCH §10.1 y §20, suite `dominio/disponibilidad`).
// La semana del 12 (lunes) al 18 (domingo) de octubre de 2026.

/** Inicios como horas locales `fecha HH:mm`, para leer las expectativas. */
const comoLocal = (inicios: Date[]) =>
  inicios.map((d) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: BOGOTA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d),
  );

describe("iniciosDisponibles: recorrido (ARCH §10.1)", () => {
  test("recorre la franja con la granularidad mientras el servicio cabe", () => {
    const ctx = contexto({ franjas: [franja(1, "08:00", "10:00")] });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 08:30",
      "2026-10-12 09:00",
      "2026-10-12 09:30",
    ]);
  });

  test("solo los días de la semana con franjas, en orden, y cada franja por separado", () => {
    const ctx = contexto({
      franjas: [franja(3, "14:00", "15:00"), franja(1, "08:00", "09:00"), franja(3, "08:00", "08:30")],
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-18"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 08:30",
      "2026-10-14 08:00",
      "2026-10-14 14:00",
      "2026-10-14 14:30",
    ]);
  });

  test("empieza en el primer múltiplo de la granularidad desde las 00:00 locales (S-02)", () => {
    const ctx = contexto({ franjas: [franja(1, "08:15", "10:00")] });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 08:30",
      "2026-10-12 09:00",
      "2026-10-12 09:30",
    ]);
  });

  test("el buffer al final de la franja corta el último inicio (ARCH §20)", () => {
    const ctx = contexto({
      franjas: [franja(1, "08:00", "10:00")],
      servicio: { duracionMin: 30, bufferMin: 10 },
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 08:30",
      "2026-10-12 09:00",
    ]);
  });

  test("sin franjas no hay inicios, y un rango que termina antes de empezar lanza un error", () => {
    expect(iniciosDisponibles(contexto(), "2026-10-12", "2026-10-18")).toEqual([]);
    expect(() => iniciosDisponibles(contexto(), "2026-10-18", "2026-10-12")).toThrow(RangeError);
  });
});

describe("iniciosDisponibles: bloqueos y capacidad", () => {
  test("un bloqueo de día completo deja ese día sin inicios y no afecta a los demás días del rango (ARCH §20)", () => {
    const todosLosDias = ([1, 2, 3, 4, 5] as const).map((dia) => franja(dia, "08:00", "09:00"));
    const ctx = contexto({
      franjas: todosLosDias,
      bloqueos: [intervaloDeDias("2026-10-14", "2026-10-14", BOGOTA)],
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-16"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 08:30",
      "2026-10-13 08:00",
      "2026-10-13 08:30",
      "2026-10-15 08:00",
      "2026-10-15 08:30",
      "2026-10-16 08:00",
      "2026-10-16 08:30",
    ]);
  });

  test("un bloqueo de unas horas solo quita los inicios cuyo intervalo se solapa con él", () => {
    const ctx = contexto({
      franjas: [franja(1, "08:00", "11:00")],
      bloqueos: [intervalo("2026-10-12", "09:15", "09:45")],
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 08:30",
      "2026-10-12 10:00",
      "2026-10-12 10:30",
    ]);
  });

  test("capacidad 2 con citas escalonadas de 9:00 a 9:30 y de 9:30 a 10:00: 60 min se ofrecen a las 9:00 (ARCH §10.2)", () => {
    const ctx = contexto({
      franjas: [franja(1, "08:00", "12:00")],
      servicio: { duracionMin: 60, bufferMin: 0 },
      capacidad: 2,
      ocupacion: [intervalo("2026-10-12", "09:00", "09:30"), intervalo("2026-10-12", "09:30", "10:00")],
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toContain("2026-10-12 09:00");
  });

  test("con capacidad 1, una cita ocupa su intervalo y deja libres los demás", () => {
    const ctx = contexto({
      franjas: [franja(1, "08:00", "10:00")],
      ocupacion: [intervalo("2026-10-12", "08:30", "09:00")],
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 09:00",
      "2026-10-12 09:30",
    ]);
  });

  test("la anticipación del cliente recorta los inicios del día de hoy", () => {
    const ctx = contexto({
      franjas: [franja(1, "08:00", "12:00")],
      ahora: local("2026-10-12", "08:10"),
      config: { granularidadMin: 30, anticipacionMinimaMin: 120, anticipacionMaximaDias: 60 },
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 10:30",
      "2026-10-12 11:00",
      "2026-10-12 11:30",
    ]);
  });
});
