import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  formatearFecha,
  formatearFechaHora,
  formatearFechaLocal,
  formatearHora,
  formatearHoraLocal,
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
