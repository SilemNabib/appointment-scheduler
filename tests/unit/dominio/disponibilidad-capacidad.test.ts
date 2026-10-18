import { describe, expect, test } from "vitest";
import { maxSimultaneas, type Intervalo } from "@/dominio/disponibilidad";

// Capacidad en todo el intervalo (RN-09.5, RN-10; ARCH §10.2). Las horas son UTC del
// 14-oct-2026; lo que se prueba es el barrido, no la zona.

const h = (hora: string) => new Date(`2026-10-14T${hora}:00.000Z`);
const de = (inicio: string, fin: string): Intervalo => ({ inicio: h(inicio), fin: h(fin) });

const VENTANA = de("09:00", "10:00");

describe("maxSimultaneas (ARCH §10.2)", () => {
  test("sin ocupación, da 0", () => {
    expect(maxSimultaneas([], VENTANA)).toBe(0);
  });

  test("capacidad 2 con citas escalonadas: 9:00–9:30 y 9:30–10:00 dan 1 (ARCH §20)", () => {
    expect(maxSimultaneas([de("09:00", "09:30"), de("09:30", "10:00")], VENTANA)).toBe(1);
  });

  test("el orden de las citas no cambia el resultado", () => {
    expect(maxSimultaneas([de("09:30", "10:00"), de("09:00", "09:30")], VENTANA)).toBe(1);
  });

  test("dos citas que se solapan dentro de la ventana dan 2", () => {
    expect(maxSimultaneas([de("09:00", "09:40"), de("09:20", "10:00")], VENTANA)).toBe(2);
  });

  test("una cita que termina justo cuando empieza la ventana no cuenta (S-04)", () => {
    expect(maxSimultaneas([de("08:30", "09:00")], VENTANA)).toBe(0);
  });

  test("una cita que empieza justo cuando termina la ventana no cuenta (S-04)", () => {
    expect(maxSimultaneas([de("10:00", "10:30")], VENTANA)).toBe(0);
  });

  test("solo cuenta lo que cae dentro de la ventana: dos citas que coinciden fuera de ella dan 1", () => {
    // Coinciden de 8:30 a 9:00, antes de la ventana; dentro de ella solo queda la segunda.
    expect(maxSimultaneas([de("08:00", "09:00"), de("08:30", "09:30")], VENTANA)).toBe(1);
  });

  test("tres citas: dos que coinciden y una tercera escalonada dan 2", () => {
    expect(maxSimultaneas([de("09:00", "09:30"), de("09:10", "09:20"), de("09:30", "10:00")], VENTANA)).toBe(2);
  });

  test("una cita que cubre toda la ventana y otra dentro dan 2", () => {
    expect(maxSimultaneas([de("08:00", "11:00"), de("09:15", "09:45")], VENTANA)).toBe(2);
  });
});
