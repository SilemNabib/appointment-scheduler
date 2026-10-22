import { beforeEach, describe, expect, test, vi } from "vitest";
import { puedeMarcarAsistencia } from "@/dominio/plazos";
import { localAUtc } from "@/dominio/tiempo";

// Plazos de la cita (ARCH §20, dominio/plazos): RN-16 en el instante exacto del borde.

const BOGOTA = "America/Bogota";
const mas = (fecha: Date, ms: number) => new Date(fecha.getTime() + ms);

// La suite corre con una zona lejana a la del negocio: el resultado no debe depender de ella (RN-03).
beforeEach(() => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  return () => vi.unstubAllEnvs();
});

describe("puedeMarcarAsistencia (RN-16)", () => {
  // Una cita a las 7:00 p. m. del 14 de octubre en Bogotá, que en UTC es otro día (ARCH §9).
  const inicio = localAUtc("2026-10-14", "19:00", BOGOTA);

  test("la suite corre de verdad con otra zona", () => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Asia/Tokyo");
    expect(inicio.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });

  test("inicio − 1 ms: todavía no", () => {
    expect(puedeMarcarAsistencia(inicio, mas(inicio, -1))).toBe(false);
  });

  test("en el instante del inicio: sí", () => {
    expect(puedeMarcarAsistencia(inicio, inicio)).toBe(true);
  });

  test("después del inicio, también después de que termina: sí", () => {
    expect(puedeMarcarAsistencia(inicio, mas(inicio, 1))).toBe(true);
    expect(puedeMarcarAsistencia(inicio, mas(inicio, 3 * 24 * 60 * 60 * 1000))).toBe(true);
  });

  test("da lo mismo con la zona del proceso en Bogotá", () => {
    vi.stubEnv("TZ", BOGOTA);
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(BOGOTA);
    expect(puedeMarcarAsistencia(inicio, mas(inicio, -1))).toBe(false);
    expect(puedeMarcarAsistencia(inicio, inicio)).toBe(true);
  });
});
