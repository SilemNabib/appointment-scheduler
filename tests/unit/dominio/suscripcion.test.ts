import { describe, expect, test } from "vitest";
import {
  DIAS_GRACIA,
  estadoEfectivo,
  type DatosSuscripcion,
} from "@/dominio/suscripcion";
import { localAUtc, vencimientoAInstante } from "@/dominio/tiempo";

const BOGOTA = "America/Bogota";
const DIA = 24 * 60 * 60 * 1000;
const mas = (fecha: Date, ms: number) => new Date(fecha.getTime() + ms);

/** Datos de un negocio que vence en `vence`, en `prueba` (fin_prueba) o en `activa` (pagado_hasta). */
function conVencimiento(estado: "prueba" | "activa", vence: Date): DatosSuscripcion {
  return estado === "prueba"
    ? { estadoSuscripcion: "prueba", finPrueba: vence, pagadoHasta: null }
    : { estadoSuscripcion: "activa", finPrueba: null, pagadoHasta: vence };
}

test("DIAS_GRACIA es 3 (D-13)", () => {
  expect(DIAS_GRACIA).toBe(3);
});

describe.each(["prueba", "activa"] as const)("dominio/suscripcion: %s", (estado) => {
  const vence = new Date("2026-10-10T05:00:00Z");
  const suspendeEn = mas(vence, 3 * DIA);
  const n = conVencimiento(estado, vence);

  // ARCH §20 (dominio/suscripcion): los instantes exactos de los bordes.
  test("vence − 1 ms: al día", () => {
    expect(estadoEfectivo(n, mas(vence, -1))).toEqual({ estado: "al_dia" });
  });

  test("vence: en gracia, con suspendeEn = vence + 3 días", () => {
    expect(estadoEfectivo(n, vence)).toEqual({ estado: "en_gracia", suspendeEn });
  });

  test("vence + 3 días − 1 ms: en gracia", () => {
    expect(estadoEfectivo(n, mas(suspendeEn, -1))).toEqual({ estado: "en_gracia", suspendeEn });
  });

  test("vence + 3 días: suspendida", () => {
    expect(estadoEfectivo(n, suspendeEn)).toEqual({ estado: "suspendida" });
  });

  test("RN-31: vence el 10-oct a las 00:00 de Bogotá; el 12-oct a las 23:59 en gracia y el 13-oct a las 00:00 suspendida", () => {
    // Vencimiento "hasta el 9 de octubre" = 10-oct a las 00:00 locales (ARCH §7.6).
    const n = conVencimiento(estado, vencimientoAInstante("2026-10-09", BOGOTA));

    expect(estadoEfectivo(n, localAUtc("2026-10-12", "23:59", BOGOTA))).toEqual({
      estado: "en_gracia",
      suspendeEn: localAUtc("2026-10-13", "00:00", BOGOTA),
    });
    expect(estadoEfectivo(n, localAUtc("2026-10-13", "00:00", BOGOTA))).toEqual({
      estado: "suspendida",
    });
  });

  test("usa solo la fecha que corresponde al estado", () => {
    const otra = mas(vence, 365 * DIA);
    const cruzado: DatosSuscripcion =
      estado === "prueba"
        ? { estadoSuscripcion: "prueba", finPrueba: vence, pagadoHasta: otra }
        : { estadoSuscripcion: "activa", finPrueba: otra, pagadoHasta: vence };

    expect(estadoEfectivo(cruzado, suspendeEn)).toEqual({ estado: "suspendida" });
  });

  test("sin la fecha de su estado lanza: los CHECK de negocio lo impiden", () => {
    const sinFecha: DatosSuscripcion = { estadoSuscripcion: estado, finPrueba: null, pagadoHasta: null };
    expect(() => estadoEfectivo(sinFecha, vence)).toThrow();
  });
});

describe("dominio/suscripcion: suspendida", () => {
  const vence = new Date("2026-10-10T05:00:00Z");

  test.each([
    ["antes del vencimiento", mas(vence, -30 * DIA)],
    ["en el vencimiento", vence],
    ["durante la gracia", mas(vence, DIA)],
    ["después de la gracia", mas(vence, 30 * DIA)],
  ])("con estadoSuscripcion = 'suspendida' da suspendida %s (RN-04)", (_, ahora) => {
    for (const n of [
      { estadoSuscripcion: "suspendida", finPrueba: null, pagadoHasta: mas(vence, 365 * DIA) },
      { estadoSuscripcion: "suspendida", finPrueba: mas(vence, 365 * DIA), pagadoHasta: null },
      { estadoSuscripcion: "suspendida", finPrueba: null, pagadoHasta: null },
    ] satisfies DatosSuscripcion[]) {
      expect(estadoEfectivo(n, ahora)).toEqual({ estado: "suspendida" });
    }
  });
});
