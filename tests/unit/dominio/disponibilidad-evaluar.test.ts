import { describe, expect, test } from "vitest";
import { evaluarInicio } from "@/dominio/disponibilidad";
import { contexto, franja, intervalo, local } from "./ayudantes-disponibilidad";

// evaluarInicio (RN-09; ARCH §10 y §20, suite `dominio/disponibilidad`). El
// 14-oct-2026 es miércoles (día ISO 3).

const MIERCOLES = "2026-10-14";
const en = (hora: string) => local(MIERCOLES, hora);

describe("evaluarInicio: horario (RN-09.1, D-12)", () => {
  test("buffer al final de la franja: 30 + 10 min se acepta a las 11:00 y se rechaza a las 11:30 (ARCH §20)", () => {
    const ctx = contexto({
      franjas: [franja(3, "08:00", "12:00")],
      servicio: { duracionMin: 30, bufferMin: 10 },
    });
    expect(evaluarInicio(ctx, en("11:00"))).toEqual({ ok: true });
    expect(evaluarInicio(ctx, en("11:30"))).toEqual({ ok: false, motivos: ["FUERA_DE_HORARIO"] });
  });

  test("el intervalo que termina justo en el fin de la franja cabe (S-04)", () => {
    const ctx = contexto({
      franjas: [franja(3, "08:00", "12:00")],
      servicio: { duracionMin: 50, bufferMin: 10 },
    });
    expect(evaluarInicio(ctx, en("11:00"))).toEqual({ ok: true });
  });

  test("una cita no cruza de una franja contigua a otra: 60 min a las 11:30 con 8–12 y 12–14 (D-12)", () => {
    const ctx = contexto({
      franjas: [franja(3, "08:00", "12:00"), franja(3, "12:00", "14:00")],
      servicio: { duracionMin: 60, bufferMin: 0 },
    });
    expect(evaluarInicio(ctx, en("11:30"))).toEqual({ ok: false, motivos: ["FUERA_DE_HORARIO"] });
    expect(evaluarInicio(ctx, en("11:00"))).toEqual({ ok: true });
    expect(evaluarInicio(ctx, en("12:00"))).toEqual({ ok: true });
  });

  test("antes del inicio de la franja, en la pausa entre franjas o en un día sin franjas, está fuera de horario", () => {
    const ctx = contexto({ franjas: [franja(3, "08:00", "12:00"), franja(3, "14:00", "18:00")] });
    expect(evaluarInicio(ctx, en("07:30"))).toEqual({ ok: false, motivos: ["FUERA_DE_HORARIO"] });
    expect(evaluarInicio(ctx, en("12:30"))).toEqual({ ok: false, motivos: ["FUERA_DE_HORARIO"] });
    expect(evaluarInicio(ctx, local("2026-10-15", "09:00"))).toEqual({ ok: false, motivos: ["FUERA_DE_HORARIO"] });
  });

  test("usa el día local, no el de UTC: las 7:00 p. m. del miércoles son el jueves en UTC (ARCH §9)", () => {
    const ctx = contexto({ franjas: [franja(3, "14:00", "20:00")] });
    const sieteDeLaNoche = en("19:00");
    expect(sieteDeLaNoche.toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(evaluarInicio(ctx, sieteDeLaNoche)).toEqual({ ok: true });
    // Con la franja del jueves y no la del miércoles, la misma hora no se acepta.
    const delJueves = contexto({ franjas: [franja(4, "14:00", "20:00")] });
    expect(evaluarInicio(delJueves, sieteDeLaNoche)).toEqual({ ok: false, motivos: ["FUERA_DE_HORARIO"] });
  });
});

describe("evaluarInicio: alineación (RN-09.3, S-02)", () => {
  test("con una franja que empieza a las 8:15 y granularidad de 30, las 8:15 no están alineadas y las 8:30 sí", () => {
    const ctx = contexto({ franjas: [franja(3, "08:15", "12:00")] });
    expect(evaluarInicio(ctx, en("08:15"))).toEqual({ ok: false, motivos: ["NO_ALINEADO"] });
    expect(evaluarInicio(ctx, en("08:30"))).toEqual({ ok: true });
  });

  test.each([
    [15, "08:45", true],
    [15, "08:50", false],
    [60, "09:00", true],
    [60, "09:30", false],
  ] as const)("con granularidad de %i, las %s %s", (granularidadMin, hora, alineado) => {
    const ctx = contexto({
      franjas: [franja(3, "08:00", "12:00")],
      config: { granularidadMin, anticipacionMinimaMin: 0, anticipacionMaximaDias: 60 },
    });
    expect(evaluarInicio(ctx, en(hora)).ok).toBe(alineado);
  });

  test("un inicio con segundos o milisegundos no está alineado", () => {
    const ctx = contexto({ franjas: [franja(3, "08:00", "12:00")] });
    expect(evaluarInicio(ctx, new Date(en("09:00").getTime() + 1))).toEqual({ ok: false, motivos: ["NO_ALINEADO"] });
    expect(evaluarInicio(ctx, en("09:00:30"))).toEqual({ ok: false, motivos: ["NO_ALINEADO"] });
  });

  test("fuera de horario y desalineado devuelve los dos motivos", () => {
    const ctx = contexto({ franjas: [franja(3, "08:00", "12:00")] });
    expect(evaluarInicio(ctx, en("07:15"))).toEqual({ ok: false, motivos: ["FUERA_DE_HORARIO", "NO_ALINEADO"] });
  });
});

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const reglas = (anticipacionMinimaMin: number, anticipacionMaximaDias: number) => ({
  granularidadMin: 30 as const,
  anticipacionMinimaMin,
  anticipacionMaximaDias,
});

describe("evaluarInicio: anticipación (RN-09.4, D-11)", () => {
  const NUEVE = en("09:00");
  const base = { franjas: [franja(3, "08:00", "12:00")], config: reglas(120, 10) };

  test("bordes exactos de la anticipación mínima: ahora + 120 min se acepta y ahora + 120 min − 1 ms no (ARCH §20)", () => {
    const enElBorde = contexto({ ...base, ahora: new Date(NUEVE.getTime() - 120 * MINUTO) });
    expect(evaluarInicio(enElBorde, NUEVE)).toEqual({ ok: true });
    // El mismo inicio queda 1 ms antes de ahora + 120 min.
    const unMsTarde = contexto({ ...base, ahora: new Date(NUEVE.getTime() - 120 * MINUTO + 1) });
    expect(evaluarInicio(unMsTarde, NUEVE)).toEqual({ ok: false, motivos: ["ANTICIPACION"] });
  });

  test("bordes exactos de la anticipación máxima: ahora + 10 días se acepta y ahora + 10 días + 1 ms no (ARCH §20)", () => {
    const enElBorde = contexto({ ...base, ahora: new Date(NUEVE.getTime() - 10 * DIA) });
    expect(evaluarInicio(enElBorde, NUEVE)).toEqual({ ok: true });
    const unMsAntes = contexto({ ...base, ahora: new Date(NUEVE.getTime() - 10 * DIA - 1) });
    expect(evaluarInicio(unMsAntes, NUEVE)).toEqual({ ok: false, motivos: ["ANTICIPACION"] });
  });

  test("para el dueño, un inicio dentro de la anticipación mínima se acepta (D-11)", () => {
    const ahora = en("08:00");
    expect(evaluarInicio(contexto({ ...base, ahora, actor: "dueno" }), en("08:30"))).toEqual({ ok: true });
    expect(evaluarInicio(contexto({ ...base, ahora, actor: "cliente" }), en("08:30"))).toEqual({
      ok: false,
      motivos: ["ANTICIPACION"],
    });
  });

  test("para el dueño, la anticipación máxima tampoco aplica (D-11)", () => {
    const ctx = contexto({ ...base, ahora: new Date(NUEVE.getTime() - 30 * DIA), actor: "dueno" });
    expect(evaluarInicio(ctx, NUEVE)).toEqual({ ok: true });
  });

  test("para el dueño, `ahora` exacto se acepta y un inicio que ya pasó devuelve ANTICIPACION (ARCH §10; Q-31)", () => {
    const ctx = contexto({ ...base, ahora: en("09:00"), actor: "dueno" });
    expect(evaluarInicio(ctx, en("09:00"))).toEqual({ ok: true });
    expect(evaluarInicio(ctx, en("08:30"))).toEqual({ ok: false, motivos: ["ANTICIPACION"] });
  });
});

describe("evaluarInicio: bloqueos (RN-09.2, S-04)", () => {
  // 30 min de servicio más 10 de buffer a las 9:00: ocupa de 9:00 a 9:40.
  const base = { franjas: [franja(3, "08:00", "12:00")], servicio: { duracionMin: 30, bufferMin: 10 } };

  test("un bloqueo que empieza justo donde termina el intervalo no lo afecta, ni uno que termina donde empieza", () => {
    const ctx = contexto({ ...base, bloqueos: [intervalo(MIERCOLES, "09:40", "10:00"), intervalo(MIERCOLES, "08:00", "09:00")] });
    expect(evaluarInicio(ctx, en("09:00"))).toEqual({ ok: true });
  });

  test("un bloqueo que se solapa con el buffer devuelve BLOQUEADO", () => {
    const ctx = contexto({ ...base, bloqueos: [intervalo(MIERCOLES, "09:35", "10:00")] });
    expect(evaluarInicio(ctx, en("09:00"))).toEqual({ ok: false, motivos: ["BLOQUEADO"] });
  });

  test("un bloqueo de varios días que cubre el inicio devuelve BLOQUEADO", () => {
    const ctx = contexto({ ...base, bloqueos: [{ inicio: local("2026-10-13", "00:00"), fin: local("2026-10-16", "00:00") }] });
    expect(evaluarInicio(ctx, en("09:00"))).toEqual({ ok: false, motivos: ["BLOQUEADO"] });
  });
});

describe("evaluarInicio: capacidad (RN-09.5, RN-10)", () => {
  const base = { franjas: [franja(3, "08:00", "12:00")] };

  test("con la capacidad llena, devuelve SIN_CAPACIDAD; con un cupo libre, se acepta", () => {
    const ocupacion = [intervalo(MIERCOLES, "09:00", "09:30")];
    expect(evaluarInicio(contexto({ ...base, ocupacion, capacidad: 1 }), en("09:00"))).toEqual({
      ok: false,
      motivos: ["SIN_CAPACIDAD"],
    });
    expect(evaluarInicio(contexto({ ...base, ocupacion, capacidad: 2 }), en("09:00"))).toEqual({ ok: true });
  });

  test("una cita que termina justo cuando empieza el intervalo no ocupa su cupo (S-04)", () => {
    const ctx = contexto({ ...base, ocupacion: [intervalo(MIERCOLES, "08:30", "09:00")] });
    expect(evaluarInicio(ctx, en("09:00"))).toEqual({ ok: true });
  });

  test("la capacidad se mide en todo el intervalo, con el buffer: una cita que empieza dentro de él lo llena", () => {
    const ctx = contexto({
      ...base,
      servicio: { duracionMin: 30, bufferMin: 10 },
      ocupacion: [intervalo(MIERCOLES, "09:35", "10:00")],
    });
    expect(evaluarInicio(ctx, en("09:00"))).toEqual({ ok: false, motivos: ["SIN_CAPACIDAD"] });
  });
});

describe("evaluarInicio: varios motivos (ARCH §10)", () => {
  test("un inicio desalineado, bloqueado y sin capacidad devuelve los tres motivos", () => {
    const ctx = contexto({
      franjas: [franja(3, "08:00", "12:00")],
      bloqueos: [intervalo(MIERCOLES, "09:00", "10:00")],
      ocupacion: [intervalo(MIERCOLES, "09:00", "10:00")],
    });
    expect(evaluarInicio(ctx, en("09:15"))).toEqual({
      ok: false,
      motivos: ["BLOQUEADO", "NO_ALINEADO", "SIN_CAPACIDAD"],
    });
  });

  test("los cinco motivos a la vez, en el orden de RN-09", () => {
    const ctx = contexto({
      franjas: [franja(3, "08:00", "12:00")],
      ahora: en("10:00"),
      bloqueos: [intervalo(MIERCOLES, "06:00", "08:00")],
      ocupacion: [intervalo(MIERCOLES, "07:00", "08:00")],
    });
    expect(evaluarInicio(ctx, en("07:15"))).toEqual({
      ok: false,
      motivos: ["FUERA_DE_HORARIO", "BLOQUEADO", "NO_ALINEADO", "ANTICIPACION", "SIN_CAPACIDAD"],
    });
  });
});
