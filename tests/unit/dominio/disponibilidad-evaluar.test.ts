import { describe, expect, test } from "vitest";
import { evaluarInicio } from "@/dominio/disponibilidad";
import { contexto, franja, local } from "./ayudantes-disponibilidad";

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
