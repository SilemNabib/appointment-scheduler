import { beforeEach, describe, expect, test, vi } from "vitest";
import { agruparPorDia, espaciosLibres, moverSemana, semanaDe, type PeticionEspacios } from "@/dominio/agenda";
import type { FranjaValida } from "@/dominio/horario";
import { localAUtc } from "@/dominio/tiempo";

// La agenda del panel (PAN-02, F-06; RN-03, RN-10, S-02, S-04; ARCH §9; Q-52, Q-56,
// Q-58).

const BOGOTA = "America/Bogota";
const JUEVES = "2026-10-22";
const hora = (local: string, fecha = JUEVES) => localAUtc(fecha, local, BOGOTA);

// La suite corre con una zona lejana a la del negocio: el resultado no debe depender de ella (RN-03).
beforeEach(() => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  return () => vi.unstubAllEnvs();
});

describe("semanas (Q-52)", () => {
  test("la semana del 2026-10-22 (jueves) va del 2026-10-19 al 2026-10-25, y la siguiente empieza el 2026-10-26", () => {
    expect(semanaDe(JUEVES)).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" });
    expect(moverSemana(JUEVES, 1)).toEqual({ desde: "2026-10-26", hasta: "2026-11-01" });
    expect(moverSemana(JUEVES, -1)).toEqual({ desde: "2026-10-12", hasta: "2026-10-18" });
  });

  test("el lunes y el domingo son de su propia semana", () => {
    expect(semanaDe("2026-10-19")).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" });
    expect(semanaDe("2026-10-25")).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" });
  });

  test("cruza meses y años", () => {
    expect(semanaDe("2027-01-01")).toEqual({ desde: "2026-12-28", hasta: "2027-01-03" });
    expect(moverSemana("2026-12-30", 1)).toEqual({ desde: "2027-01-04", hasta: "2027-01-10" });
  });
});

describe("agruparPorDia (RN-03; ARCH §9)", () => {
  test("una cita a las 7:00 p. m. del 14 de octubre en Bogotá (2026-10-15T00:00:00Z) se agrupa en el 2026-10-14", () => {
    const tarde = { id: "a", inicio: new Date("2026-10-15T00:00:00Z") };
    const manana = { id: "b", inicio: new Date("2026-10-15T13:00:00Z") };

    expect(agruparPorDia([tarde, manana], BOGOTA)).toEqual(
      new Map([
        ["2026-10-14", [tarde]],
        ["2026-10-15", [manana]],
      ]),
    );
  });

  test("dentro de cada día conserva el orden en que llegan", () => {
    const citas = [hora("08:00"), hora("09:00"), hora("10:00")].map((inicio, i) => ({ id: String(i), inicio }));
    expect(agruparPorDia(citas, BOGOTA).get(JUEVES)?.map((c) => c.id)).toEqual(["0", "1", "2"]);
  });
});

describe("espaciosLibres (Q-56)", () => {
  const franja = (inicio: string, fin: string): FranjaValida => ({ dia: 4, inicio, fin }); // jueves
  const peticion = (cambios: Partial<PeticionEspacios> = {}): PeticionEspacios => ({
    fecha: JUEVES,
    zonaHoraria: BOGOTA,
    franjas: [franja("08:00", "10:00")],
    granularidadMin: 30,
    citas: [],
    bloqueos: [],
    ahora: hora("00:00"),
    ...cambios,
  });
  const locales = (espacios: Date[]) =>
    espacios.map((d) => new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: BOGOTA }).format(d));

  test("con una franja de 8:00 a 10:00, granularidad de 30 minutos y una cita de 8:30 a 9:00, los espacios son 8:00, 9:00 y 9:30 (S-04)", () => {
    const cita = { inicio: hora("08:30"), ocupadoHasta: hora("09:00"), estado: "confirmada" as const };
    expect(locales(espaciosLibres(peticion({ citas: [cita] })))).toEqual(["08:00", "09:00", "09:30"]);
  });

  test("una cita cancelada no quita espacios (RN-10); una completada o no_asistio, sí (D-06)", () => {
    const en = (estado: "cancelada" | "completada" | "no_asistio") => ({ inicio: hora("08:30"), ocupadoHasta: hora("09:00"), estado });
    expect(locales(espaciosLibres(peticion({ citas: [en("cancelada")] })))).toEqual(["08:00", "08:30", "09:00", "09:30"]);
    expect(locales(espaciosLibres(peticion({ citas: [en("completada")] })))).toEqual(["08:00", "09:00", "09:30"]);
    expect(locales(espaciosLibres(peticion({ citas: [en("no_asistio")] })))).toEqual(["08:00", "09:00", "09:30"]);
  });

  test("el buffer ocupa: una cita de 8:00 con ocupado_hasta a las 8:40 quita 8:00 y 8:30", () => {
    const cita = { inicio: hora("08:00"), ocupadoHasta: hora("08:40"), estado: "confirmada" as const };
    expect(locales(espaciosLibres(peticion({ citas: [cita] })))).toEqual(["09:00", "09:30"]);
  });

  test("un bloqueo quita los espacios que se solapan con él; uno de día completo, todos", () => {
    const bloqueo = { inicio: hora("09:00"), fin: hora("09:15") };
    expect(locales(espaciosLibres(peticion({ bloqueos: [bloqueo] })))).toEqual(["08:00", "08:30", "09:30"]);
    const diaCompleto = { inicio: hora("00:00"), fin: hora("00:00", "2026-10-23") };
    expect(espaciosLibres(peticion({ bloqueos: [diaCompleto] }))).toEqual([]);
  });

  test("se alinean con el reloj local (S-02) y caben en la franja; cada franja por separado (D-12)", () => {
    const franjas = [franja("08:10", "09:00"), franja("14:00", "15:00")];
    expect(locales(espaciosLibres(peticion({ franjas })))).toEqual(["08:30", "14:00", "14:30"]);
  });

  test("solo las franjas del día de la semana de la fecha", () => {
    const viernes: FranjaValida = { dia: 5, inicio: "08:00", fin: "10:00" };
    expect(espaciosLibres(peticion({ franjas: [viernes] }))).toEqual([]);
  });

  test("los espacios que empiezan antes de ahora no se ofrecen; el de ahora, sí (D-11)", () => {
    expect(locales(espaciosLibres(peticion({ ahora: hora("08:30") })))).toEqual(["08:30", "09:00", "09:30"]);
    expect(locales(espaciosLibres(peticion({ ahora: hora("08:31") })))).toEqual(["09:00", "09:30"]);
  });

  test("devuelve instantes UTC: las 7:00 p. m. del 14 de octubre son 2026-10-15T00:00:00Z", () => {
    const espacios = espaciosLibres(
      peticion({
        fecha: "2026-10-14",
        franjas: [{ dia: 3, inicio: "19:00", fin: "20:00" }],
        granularidadMin: 60,
        ahora: hora("00:00", "2026-10-14"),
      }),
    );
    expect(espacios.map((d) => d.toISOString())).toEqual(["2026-10-15T00:00:00.000Z"]);
  });
});
