import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  fechaLocal,
  instanteAVencimiento,
  intervaloDeDias,
  localAUtc,
  vencimientoAInstante,
} from "@/dominio/tiempo";

const BOGOTA = "America/Bogota";

// RN-03: "aunque el dispositivo esté en otra zona horaria". Cada caso corre con la
// zona del proceso en Bogotá y en zonas a ambos lados de UTC, con y sin horario de
// verano. `horaEnProceso` es la hora que da `getHours()` a las 12:00Z del 14-oct-2026,
// para comprobar que el cambio de `TZ` sí tuvo efecto.
const ZONAS_DEL_PROCESO = [
  { tz: BOGOTA, horaEnProceso: 7 },
  { tz: "UTC", horaEnProceso: 12 },
  { tz: "Asia/Tokyo", horaEnProceso: 21 },
  { tz: "Pacific/Kiritimati", horaEnProceso: 2 },
  { tz: "America/Los_Angeles", horaEnProceso: 5 },
  { tz: "Europe/Madrid", horaEnProceso: 14 },
];

describe.each(ZONAS_DEL_PROCESO)("dominio/tiempo con TZ=$tz", ({ tz, horaEnProceso }) => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = tz;
  });
  afterAll(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  test("el proceso usa esa zona", () => {
    expect(new Date("2026-10-14T12:00:00Z").getHours()).toBe(horaEnProceso);
  });

  describe("localAUtc (ARCH §9)", () => {
    test("14-oct-2026, 7:00 a. m. en Bogotá → 2026-10-14T12:00:00Z", () => {
      expect(localAUtc("2026-10-14", "07:00", BOGOTA).toISOString()).toBe(
        "2026-10-14T12:00:00.000Z",
      );
    });

    test("14-oct-2026, 7:00 p. m. en Bogotá → 2026-10-15T00:00:00Z, otro día en UTC (caso obligatorio)", () => {
      expect(localAUtc("2026-10-14", "19:00", BOGOTA).toISOString()).toBe(
        "2026-10-15T00:00:00.000Z",
      );
    });

    test("acepta la hora con segundos, como la devuelve una columna time", () => {
      expect(localAUtc("2026-10-14", "08:30:15", BOGOTA).toISOString()).toBe(
        "2026-10-14T13:30:15.000Z",
      );
    });

    test("no da por hecho que no hay horario de verano: usa el desfase de cada fecha", () => {
      // Nueva York pasa de UTC−5 a UTC−4 el 8-mar-2026.
      expect(localAUtc("2026-03-07", "07:00", "America/New_York").toISOString()).toBe(
        "2026-03-07T12:00:00.000Z",
      );
      expect(localAUtc("2026-03-09", "07:00", "America/New_York").toISOString()).toBe(
        "2026-03-09T11:00:00.000Z",
      );
    });
  });

  describe("fechaLocal", () => {
    test("devuelve la fecha del calendario de Bogotá, no la de UTC ni la del proceso", () => {
      expect(fechaLocal(new Date("2026-10-15T00:00:00Z"), BOGOTA)).toBe("2026-10-14");
      expect(fechaLocal(new Date("2026-10-15T05:00:00Z"), BOGOTA)).toBe("2026-10-15");
    });
  });

  describe("vencimiento como fecha local inclusiva (ARCH §7.6)", () => {
    test('"pagado hasta el 9 de octubre" → 2026-10-10T05:00:00Z, y de vuelta 2026-10-09', () => {
      const vence = vencimientoAInstante("2026-10-09", BOGOTA);
      expect(vence.toISOString()).toBe("2026-10-10T05:00:00.000Z");
      expect(instanteAVencimiento(vence, BOGOTA)).toBe("2026-10-09");
    });

    test.each([
      ["2026-10-31", "2026-11-01T05:00:00.000Z"],
      ["2026-12-31", "2027-01-01T05:00:00.000Z"],
      ["2026-02-28", "2026-03-01T05:00:00.000Z"],
      ["2028-02-28", "2028-02-29T05:00:00.000Z"],
    ])("%s → %s (cambio de mes y de año) y de vuelta", (fecha, guardado) => {
      const vence = vencimientoAInstante(fecha, BOGOTA);
      expect(vence.toISOString()).toBe(guardado);
      expect(instanteAVencimiento(vence, BOGOTA)).toBe(fecha);
    });

    test("un vencimiento guardado con SQL directo fuera de las 00:00 locales da el último día que cubre", () => {
      expect(instanteAVencimiento(new Date("2026-10-10T17:00:00Z"), BOGOTA)).toBe("2026-10-10");
    });
  });

  describe("intervaloDeDias (ARCH §9, reglas 1 y 2)", () => {
    const iso = ({ inicio, fin }: { inicio: Date; fin: Date }) => [inicio.toISOString(), fin.toISOString()];

    test("el 14-oct-2026 en Bogotá es [2026-10-14T05:00:00Z, 2026-10-15T05:00:00Z)", () => {
      expect(iso(intervaloDeDias("2026-10-14", "2026-10-14", BOGOTA))).toEqual([
        "2026-10-14T05:00:00.000Z",
        "2026-10-15T05:00:00.000Z",
      ]);
    });

    test("del 14 al 16 de octubre es [2026-10-14T05:00:00Z, 2026-10-17T05:00:00Z)", () => {
      expect(iso(intervaloDeDias("2026-10-14", "2026-10-16", BOGOTA))).toEqual([
        "2026-10-14T05:00:00.000Z",
        "2026-10-17T05:00:00.000Z",
      ]);
    });

    test("cruza el fin de mes y de año", () => {
      expect(iso(intervaloDeDias("2026-12-31", "2027-01-01", BOGOTA))).toEqual([
        "2026-12-31T05:00:00.000Z",
        "2027-01-02T05:00:00.000Z",
      ]);
    });

    test("en una zona con horario de verano, el día del cambio dura 23 horas", () => {
      const { inicio, fin } = intervaloDeDias("2026-03-29", "2026-03-29", "Europe/Madrid");
      expect(fin.getTime() - inicio.getTime()).toBe(23 * 60 * 60 * 1000);
    });

    test("si hasta es anterior a desde, lanza un error", () => {
      expect(() => intervaloDeDias("2026-10-16", "2026-10-14", BOGOTA)).toThrow(RangeError);
    });

    test("una fecha que no existe lanza un error", () => {
      expect(() => intervaloDeDias("2026-02-30", "2026-03-01", BOGOTA)).toThrow(RangeError);
    });
  });

  describe("entradas inválidas", () => {
    test.each(["2026-02-30", "2026-13-01", "2026-10-14T00:00", "14/10/2026", ""])(
      'rechaza la fecha "%s"',
      (fecha) => {
        expect(() => localAUtc(fecha, "07:00", BOGOTA)).toThrow(RangeError);
        expect(() => vencimientoAInstante(fecha, BOGOTA)).toThrow(RangeError);
      },
    );

    test.each(["24:00", "07:60", "7:00", "07:00:60", ""])('rechaza la hora "%s"', (hora) => {
      expect(() => localAUtc("2026-10-14", hora, BOGOTA)).toThrow(RangeError);
    });

    test("rechaza una zona inexistente", () => {
      expect(() => localAUtc("2026-10-14", "07:00", "America/No_Existe")).toThrow(RangeError);
      expect(() => vencimientoAInstante("2026-10-09", "America/No_Existe")).toThrow(RangeError);
    });
  });
});
