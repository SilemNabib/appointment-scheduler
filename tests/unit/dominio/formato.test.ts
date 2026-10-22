import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  formatearDiaCorto,
  formatearDiaLocal,
  formatearFecha,
  formatearFechaHora,
  formatearFechaLocal,
  formatearHora,
  formatearHoraLocal,
  formatearIntervalo,
  formatearMesLocal,
} from "@/dominio/formato";

// Formato de fechas y horas (RN-03, RNF-02; ARCH §9, regla 3).

const BOGOTA = "America/Bogota";

/** `Intl` puede separar con espacios especiales (U+00A0, U+202F) según la versión de ICU. */
const normalizar = (texto: string) => texto.replace(/[\u00a0\u202f]/g, " ");

// La suite corre con una zona lejana a la del negocio: el resultado no debe depender de ella.
beforeEach(() => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  return () => vi.unstubAllEnvs();
});

describe("formato de instantes, en la zona del negocio", () => {
  test("la suite corre de verdad con otra zona", () => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Asia/Tokyo");
  });

  test("2026-10-15T00:00:00Z en America/Bogota es el 14 de octubre de 2026 a las 7:00 p. m. (RN-03)", () => {
    const instante = new Date("2026-10-15T00:00:00Z");

    expect(normalizar(formatearFechaHora(instante, BOGOTA))).toBe("14 de octubre de 2026 a las 7:00 p. m.");
    expect(normalizar(formatearFecha(instante, BOGOTA))).toBe("14 de octubre de 2026");
    expect(normalizar(formatearHora(instante, BOGOTA))).toBe("7:00 p. m.");
  });

  test.each([
    ["2026-10-14T12:00:00Z", "7:00 a. m."],
    ["2026-10-14T05:00:00Z", "12:00 a. m."],
    ["2026-10-14T17:00:00Z", "12:00 p. m."],
    ["2026-10-14T18:30:00Z", "1:30 p. m."],
  ])("%s se muestra como %s: 12 horas, con a. m. y p. m. (RNF-02)", (iso, esperado) => {
    expect(normalizar(formatearHora(new Date(iso), BOGOTA))).toBe(esperado);
  });

  test("el mismo instante cambia de día según la zona del negocio", () => {
    const instante = new Date("2026-10-15T03:00:00Z");

    expect(normalizar(formatearFecha(instante, BOGOTA))).toBe("14 de octubre de 2026");
    expect(normalizar(formatearFecha(instante, "Europe/Madrid"))).toBe("15 de octubre de 2026");
  });

  test("una zona inexistente lanza un error", () => {
    expect(() => formatearFecha(new Date(), "America/Nowhere")).toThrow(RangeError);
  });
});

describe("formato de fechas y horas locales", () => {
  test("una fecha local se muestra tal cual, sin moverse de día", () => {
    expect(normalizar(formatearFechaLocal("2026-10-14"))).toBe("14 de octubre de 2026");
    expect(normalizar(formatearFechaLocal("2026-01-01"))).toBe("1 de enero de 2026");
  });

  test.each([
    ["08:00", "8:00 a. m."],
    ["00:00", "12:00 a. m."],
    ["12:00", "12:00 p. m."],
    ["18:30:00", "6:30 p. m."],
  ])("la hora local %s se muestra como %s (RNF-02)", (hora, esperado) => {
    expect(normalizar(formatearHoraLocal(hora))).toBe(esperado);
  });

  test("una fecha o una hora inválidas lanzan un error", () => {
    expect(() => formatearFechaLocal("2026-02-30")).toThrow(RangeError);
    expect(() => formatearHoraLocal("25:00")).toThrow(RangeError);
  });
});

describe("formatearIntervalo", () => {
  const intervalo = (inicio: string, fin: string) =>
    normalizar(formatearIntervalo(new Date(inicio), new Date(fin), BOGOTA));

  test("un día completo local", () => {
    expect(intervalo("2026-10-14T05:00:00Z", "2026-10-15T05:00:00Z")).toBe("14 de octubre de 2026, todo el día");
  });

  test("varios días completos", () => {
    expect(intervalo("2026-10-14T05:00:00Z", "2026-10-17T05:00:00Z")).toBe(
      "Del 14 de octubre de 2026 al 16 de octubre de 2026",
    );
  });

  test("unas horas de un día, en la zona del negocio y con 12 horas (RNF-02)", () => {
    expect(intervalo("2026-10-14T19:00:00Z", "2026-10-14T21:30:00Z")).toBe(
      "14 de octubre de 2026, de 2:00 p. m. a 4:30 p. m.",
    );
  });

  test("unas horas que terminan a medianoche siguen siendo del mismo día", () => {
    expect(intervalo("2026-10-15T04:00:00Z", "2026-10-15T05:00:00Z")).toBe(
      "14 de octubre de 2026, de 11:00 p. m. a 12:00 a. m.",
    );
  });

  test("un intervalo que cruza la medianoche sin empezar en ella", () => {
    expect(intervalo("2026-10-15T03:00:00Z", "2026-10-15T07:00:00Z")).toBe(
      "Del 14 de octubre de 2026 a las 10:00 p. m. al 15 de octubre de 2026 a las 2:00 a. m.",
    );
  });
});

describe("formatearDiaLocal y formatearMesLocal", () => {
  const plano = (t: string) => t.replace(/\s/g, " ");

  test("el día con su día de la semana, con y sin año, sin depender de la zona", () => {
    expect(plano(formatearDiaLocal("2026-10-22"))).toBe("jueves, 22 de octubre");
    expect(plano(formatearDiaLocal("2026-10-22", true))).toBe("jueves, 22 de octubre de 2026");
    expect(plano(formatearDiaLocal("2027-01-01"))).toBe("viernes, 1 de enero");
  });

  test("el mes con mayúscula inicial", () => {
    expect(plano(formatearMesLocal("2026-10-20"))).toBe("Octubre de 2026");
    expect(plano(formatearMesLocal("2027-02-01"))).toBe("Febrero de 2027");
  });
});

describe("formatearDiaCorto (PAN-02)", () => {
  test("da el día de la semana abreviado y el número, sin puntos: jue 22", () => {
    expect(normalizar(formatearDiaCorto("2026-10-22"))).toBe("jue 22");
    expect(normalizar(formatearDiaCorto("2026-11-01"))).toBe("dom 1");
  });
});
