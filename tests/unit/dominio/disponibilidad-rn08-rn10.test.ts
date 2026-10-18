import { describe, expect, test } from "vitest";
import { iniciosDisponibles } from "@/dominio/disponibilidad";
import { minutosLocales } from "@/dominio/tiempo";
import { BOGOTA, contexto, franja, intervalo, local } from "./ayudantes-disponibilidad";

// Criterios de aceptación de RN-08 y el primero de RN-10 (PRD §8.3), probados con el
// motor. El 12-oct-2026 es lunes.

const LUNES = "2026-10-12";

describe("RN-08: granularidad", () => {
  test("con granularidad de 30 minutos, los inicios ofrecidos caen en :00 y :30 (RN-08, S-02)", () => {
    // Franjas que no empiezan en :00 ni en :30, y un servicio de 20 minutos que dejaría huecos de 10.
    const ctx = contexto({
      franjas: [franja(1, "08:10", "12:00"), franja(1, "14:45", "18:00")],
      servicio: { duracionMin: 20, bufferMin: 0 },
    });
    const inicios = iniciosDisponibles(ctx, LUNES, LUNES);

    expect(inicios.length).toBeGreaterThan(0);
    expect(new Set(inicios.map((d) => minutosLocales(d, BOGOTA) % 60))).toEqual(new Set([0, 30]));
    expect(inicios[0]).toEqual(local(LUNES, "08:30"));
    expect(inicios).toContainEqual(local(LUNES, "15:00"));
  });
});

describe("RN-10: duración más buffer", () => {
  test("30 min con 10 de buffer reservado a las 9:00 ocupa hasta las 9:40; con capacidad 1, el siguiente inicio libre es el primero alineado desde las 9:40 (RN-10)", () => {
    const reservada = intervalo(LUNES, "09:00", "09:40"); // [inicio, ocupado_hasta)
    const deMedia = contexto({
      franjas: [franja(1, "08:00", "12:00")],
      servicio: { duracionMin: 30, bufferMin: 10 },
      ocupacion: [reservada],
    });
    const despues = (ctx: typeof deMedia) => iniciosDisponibles(ctx, LUNES, LUNES).filter((d) => d >= local(LUNES, "09:00"));

    // Con granularidad de 30: las 9:30 chocan con el buffer; el siguiente es las 10:00.
    expect(despues(deMedia)[0]).toEqual(local(LUNES, "10:00"));
    // Con granularidad de 15, el primero alineado desde las 9:40 es las 9:45.
    const deCuarto = { ...deMedia, config: { ...deMedia.config, granularidadMin: 15 as const } };
    expect(despues(deCuarto)[0]).toEqual(local(LUNES, "09:45"));
  });
});
