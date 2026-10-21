import { describe, expect, test } from "vitest";
import {
  mesesNavegables,
  moverMes,
  rangoDelMes,
  semanasDelMes,
  siguienteDiaConCupo,
  ultimoDiaDelMes,
} from "@/dominio/calendario";

// Calendario de la página pública (PUB-03; F-01; Q-48).

describe("semanasDelMes", () => {
  test("octubre de 2026 empieza en jueves: su primera semana tiene tres días vacíos", () => {
    const semanas = semanasDelMes({ anio: 2026, mes: 10 });
    expect(semanas[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(semanas).toHaveLength(5);
    expect(semanas.at(-1)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", null]);
    expect(semanas.every((s) => s.length === 7)).toBe(true);
  });

  test("febrero de 2027 tiene 28 días; empieza en lunes y termina en domingo, así que son cuatro semanas completas", () => {
    const semanas = semanasDelMes({ anio: 2027, mes: 2 });
    expect(semanas.flat().filter(Boolean)).toHaveLength(28);
    expect(semanas).toHaveLength(4);
    expect(semanas[0][0]).toBe("2027-02-01");
    expect(semanas[3][6]).toBe("2027-02-28");
  });

  test("febrero bisiesto y un mes de seis semanas", () => {
    expect(ultimoDiaDelMes({ anio: 2028, mes: 2 })).toBe("2028-02-29");
    // Agosto de 2026 empieza en sábado y tiene 31 días.
    expect(semanasDelMes({ anio: 2026, mes: 8 })).toHaveLength(6);
  });
});

describe("meses y rangos (Q-48)", () => {
  const hoy = "2026-10-20";
  const ultimoDia = "2026-12-19";

  test("con hoy el 2026-10-20 y el último día el 2026-12-19, se puede ir de octubre a diciembre", () => {
    expect(mesesNavegables(hoy, ultimoDia)).toEqual([
      { anio: 2026, mes: 10 },
      { anio: 2026, mes: 11 },
      { anio: 2026, mes: 12 },
    ]);
  });

  test("el rango de octubre va del 20 al 31, el de noviembre es el mes entero y el de diciembre va del 1 al 19", () => {
    expect(rangoDelMes({ anio: 2026, mes: 10 }, hoy, ultimoDia)).toEqual({ desde: "2026-10-20", hasta: "2026-10-31" });
    expect(rangoDelMes({ anio: 2026, mes: 11 }, hoy, ultimoDia)).toEqual({ desde: "2026-11-01", hasta: "2026-11-30" });
    expect(rangoDelMes({ anio: 2026, mes: 12 }, hoy, ultimoDia)).toEqual({ desde: "2026-12-01", hasta: "2026-12-19" });
  });

  test("un mes fuera de los días reservables no tiene rango, y ninguno pasa de 31 días", () => {
    expect(rangoDelMes({ anio: 2026, mes: 9 }, hoy, ultimoDia)).toBeNull();
    expect(rangoDelMes({ anio: 2027, mes: 1 }, hoy, ultimoDia)).toBeNull();
  });

  test("moverMes cruza años", () => {
    expect(moverMes({ anio: 2026, mes: 12 }, 1)).toEqual({ anio: 2027, mes: 1 });
    expect(moverMes({ anio: 2027, mes: 1 }, -1)).toEqual({ anio: 2026, mes: 12 });
  });
});

describe("siguienteDiaConCupo (F-01)", () => {
  const dias = [
    { fecha: "2026-10-20", inicios: [] },
    { fecha: "2026-10-21", inicios: [] },
    { fecha: "2026-10-22", inicios: ["2026-10-22T13:00:00.000Z"] },
    { fecha: "2026-10-23", inicios: ["2026-10-23T13:00:00.000Z"] },
  ];

  test("salta los días con inicios: [] y devuelve el primero con cupo desde la fecha, inclusive", () => {
    expect(siguienteDiaConCupo(dias, "2026-10-20")).toBe("2026-10-22");
    expect(siguienteDiaConCupo(dias, "2026-10-22")).toBe("2026-10-22");
    expect(siguienteDiaConCupo(dias, "2026-10-23")).toBe("2026-10-23");
  });

  test("devuelve null si no hay ninguno en lo consultado", () => {
    expect(siguienteDiaConCupo(dias, "2026-10-24")).toBeNull();
    expect(siguienteDiaConCupo(dias.slice(0, 2), "2026-10-20")).toBeNull();
    expect(siguienteDiaConCupo([], "2026-10-20")).toBeNull();
  });
});
