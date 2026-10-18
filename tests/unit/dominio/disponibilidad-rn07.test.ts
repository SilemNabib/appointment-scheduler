import { describe, expect, test } from "vitest";
import { iniciosDisponibles } from "@/dominio/disponibilidad";
import { intervaloDeDias, minutosLocales } from "@/dominio/tiempo";
import { BOGOTA, contexto, franja, local } from "./ayudantes-disponibilidad";

// Criterios de aceptación de RN-07 (PRD §8.3), probados con el motor. El 12-oct-2026
// es lunes.

const LUNES = "2026-10-12";

describe("RN-07: horario semanal y bloqueos", () => {
  test('con el horario "lunes de 8:00 a 12:00 y de 14:00 a 18:00", no se ofrecen horas entre las 12:00 y las 14:00 (RN-07)', () => {
    const ctx = contexto({ franjas: [franja(1, "08:00", "12:00"), franja(1, "14:00", "18:00")] });
    const inicios = iniciosDisponibles(ctx, LUNES, LUNES);

    expect(inicios.length).toBeGreaterThan(0);
    // Ninguna cita de 30 minutos empieza en la pausa ni la invade: termina a más tardar
    // a las 12:00 o empieza desde las 14:00.
    for (const d of inicios) {
      const empieza = minutosLocales(d, BOGOTA);
      expect(empieza + 30 <= 12 * 60 || empieza >= 14 * 60).toBe(true);
    }
    expect(inicios).toContainEqual(local(LUNES, "11:30"));
    expect(inicios).toContainEqual(local(LUNES, "14:00"));
    expect(inicios).not.toContainEqual(local(LUNES, "12:00"));
    expect(inicios).not.toContainEqual(local(LUNES, "13:30"));
  });

  test("con franjas de 8:00 a 12:00 y de 12:00 a 14:00, un servicio de 60 minutos no se ofrece a las 11:30 (RN-07)", () => {
    const ctx = contexto({
      franjas: [franja(1, "08:00", "12:00"), franja(1, "12:00", "14:00")],
      servicio: { duracionMin: 60, bufferMin: 0 },
    });
    const inicios = iniciosDisponibles(ctx, LUNES, LUNES);

    expect(inicios).not.toContainEqual(local(LUNES, "11:30"));
    expect(inicios).toContainEqual(local(LUNES, "11:00"));
    expect(inicios).toContainEqual(local(LUNES, "12:00"));
  });

  test("un bloqueo de día completo elimina todas las horas de ese día (RN-07)", () => {
    const horario = { franjas: [franja(1, "08:00", "12:00"), franja(1, "14:00", "18:00")] };
    expect(iniciosDisponibles(contexto(horario), LUNES, LUNES).length).toBeGreaterThan(0);

    const conBloqueo = contexto({ ...horario, bloqueos: [intervaloDeDias(LUNES, LUNES, BOGOTA)] });
    expect(iniciosDisponibles(conBloqueo, LUNES, LUNES)).toEqual([]);
  });
});
