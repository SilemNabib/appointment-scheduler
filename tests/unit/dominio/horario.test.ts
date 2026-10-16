import { describe, expect, test } from "vitest";
import { validarSemana, type Franja } from "@/dominio/horario";

// Validación del horario semanal (RN-07, D-12, S-04).

const LUNES = 1;
const franja = (inicio: string, fin: string, dia = LUNES): Franja => ({ dia, inicio, fin });

describe("validarSemana", () => {
  test("acepta varias franjas en el mismo día: 8:00–12:00 con 14:00–18:00", () => {
    expect(validarSemana([franja("14:00", "18:00"), franja("08:00", "12:00")])).toEqual({
      ok: true,
      valor: [franja("08:00", "12:00"), franja("14:00", "18:00")],
    });
  });

  test("acepta franjas contiguas: 8:00–12:00 con 12:00–14:00 no se solapan (D-12, S-04)", () => {
    expect(validarSemana([franja("08:00", "12:00"), franja("12:00", "14:00")]).ok).toBe(true);
  });

  test("8:00–12:00 con 11:00–13:00 devuelve FRANJAS_SOLAPADAS con el día afectado", () => {
    expect(validarSemana([franja("08:00", "12:00"), franja("11:00", "13:00"), franja("08:00", "12:00", 2)])).toEqual(
      { ok: false, error: { codigo: "FRANJAS_SOLAPADAS", dias: [LUNES] } },
    );
  });

  test("una franja dentro de otra, o la misma dos veces, también se solapa; trae todos los días afectados", () => {
    expect(
      validarSemana([
        franja("08:00", "18:00", 3),
        franja("10:00", "11:00", 3),
        franja("09:00", "10:00", 5),
        franja("09:00", "10:00", 5),
      ]),
    ).toEqual({ ok: false, error: { codigo: "FRANJAS_SOLAPADAS", dias: [3, 5] } });
  });

  test("la misma franja en días distintos se acepta", () => {
    const semana = [1, 2, 3, 4, 5, 6, 7].map((dia) => franja("08:00", "12:00", dia));

    expect(validarSemana(semana)).toEqual({ ok: true, valor: semana });
  });

  test.each([
    ["termina a la misma hora en que empieza", franja("08:00", "08:00")],
    ["termina antes de empezar", franja("12:00", "08:00")],
    ["tiene el día 0", franja("08:00", "12:00", 0)],
    ["tiene el día 8", franja("08:00", "12:00", 8)],
    ["tiene un día con decimales", franja("08:00", "12:00", 1.5)],
    ["tiene una hora inválida", franja("08:00", "24:00")],
    ["tiene una hora sin formato", franja("8", "12")],
  ])("rechaza una franja que %s", (_, invalida) => {
    expect(validarSemana([franja("14:00", "18:00"), invalida])).toEqual({
      ok: false,
      error: { codigo: "DATOS_INVALIDOS", indice: 1 },
    });
  });

  test("una semana vacía es válida: todos los días cerrados", () => {
    expect(validarSemana([])).toEqual({ ok: true, valor: [] });
  });

  test("acepta las horas como las devuelve la base (HH:mm:ss) y las deja en HH:mm", () => {
    expect(validarSemana([franja("08:00:00", "12:30:00")])).toEqual({
      ok: true,
      valor: [franja("08:00", "12:30")],
    });
  });
});
