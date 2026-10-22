import { beforeEach, describe, expect, test, vi } from "vitest";
import { historialDeCita, lineaDeHistorial, type EventoCita } from "@/dominio/historial-cita";

// Historial de la cita (PAN-03, F-08; RN-03, RNF-02; ARCH §18.2; Q-55).

const BOGOTA = "America/Bogota";
const CREADO = new Date("2026-10-22T13:35:00Z"); // 8:35 a. m. en Bogotá

/** `Intl` puede separar con espacios especiales (U+00A0, U+202F) según la versión de ICU. */
const normalizar = (texto: string | null) => texto?.replace(/[  ]/g, " ") ?? null;

const evento = (cambios: Partial<EventoCita>): EventoCita => ({
  tipo: "creada",
  actor: "cliente",
  datos: {},
  creadoEn: CREADO,
  ...cambios,
});

const linea = (cambios: Partial<EventoCita>) => {
  const l = lineaDeHistorial(evento(cambios), BOGOTA);
  return { ...l, texto: normalizar(l.texto), detalle: normalizar(l.detalle), cuando: normalizar(l.cuando) };
};

// La suite corre con una zona lejana a la del negocio: el resultado no debe depender de ella (RN-03).
beforeEach(() => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  return () => vi.unstubAllEnvs();
});

describe("lineaDeHistorial", () => {
  test("una reserva pública dice quién la hizo y cuándo, en hora de Colombia", () => {
    expect(linea({ tipo: "creada", actor: "cliente" })).toEqual({
      texto: "Reservada por el cliente",
      detalle: null,
      autor: "cliente",
      cuando: "22 de octubre de 2026 a las 8:35 a. m.",
    });
    expect(linea({ tipo: "creada", actor: "dueno" })).toMatchObject({ texto: "Creada por ti", autor: "tu" });
  });

  test("un evento reprogramada del dueño con inicio_anterior e inicio_nuevo da las dos horas en hora de Colombia y formato de 12 horas (RN-03, RNF-02)", () => {
    const datos = { inicio_anterior: "2026-10-23T14:00:00.000Z", inicio_nuevo: "2026-10-24T00:00:00.000Z" };

    expect(linea({ tipo: "reprogramada", actor: "dueno", datos })).toEqual({
      texto: "Movida por ti",
      detalle: "Del 23 de octubre de 2026 a las 9:00 a. m. al 23 de octubre de 2026 a las 7:00 p. m.",
      autor: "tu",
      cuando: "22 de octubre de 2026 a las 8:35 a. m.",
    });
    expect(linea({ tipo: "reprogramada", actor: "cliente", datos })).toMatchObject({ texto: "Reprogramada por el cliente" });
  });

  test("un evento completada del sistema con { automatica: true } dice que se marcó automáticamente (F-08)", () => {
    expect(linea({ tipo: "completada", actor: "sistema", datos: { automatica: true } })).toMatchObject({
      texto: "Marcada automáticamente como asistió",
      autor: "sistema",
    });
    expect(linea({ tipo: "no_asistio", actor: "sistema", datos: { automatica: true } })).toMatchObject({
      texto: "Marcada automáticamente como no asistió",
    });
  });

  test("la asistencia que marca el dueño y su corrección (S-09)", () => {
    expect(linea({ tipo: "completada", actor: "dueno" })).toMatchObject({ texto: "Marcada como asistió por ti", detalle: null });
    expect(linea({ tipo: "no_asistio", actor: "dueno" })).toMatchObject({ texto: "Marcada como no asistió por ti" });
    expect(linea({ tipo: "estado_corregido", actor: "dueno", datos: { de: "completada", a: "no_asistio" } })).toMatchObject({
      texto: "Asistencia corregida por ti",
      detalle: "De asistió a no asistió",
    });
  });

  test("la cancelación dice quién canceló", () => {
    expect(linea({ tipo: "cancelada", actor: "dueno" })).toMatchObject({ texto: "Cancelada por ti", autor: "tu" });
    expect(linea({ tipo: "cancelada", actor: "cliente" })).toMatchObject({ texto: "Cancelada por el cliente" });
  });

  test("un evento de un tipo que no conoce, o con datos rotos, no rompe el historial", () => {
    expect(linea({ tipo: "pagada", actor: "sistema" })).toMatchObject({ texto: "Cambio registrado por el sistema", detalle: null });
    expect(linea({ tipo: "reprogramada", actor: "dueno", datos: null })).toMatchObject({ texto: "Movida por ti", detalle: null });
    expect(linea({ tipo: "reprogramada", actor: "dueno", datos: { inicio_anterior: "ayer", inicio_nuevo: 3 } })).toMatchObject({
      detalle: null,
    });
    expect(linea({ tipo: "estado_corregido", actor: "dueno", datos: "x" })).toMatchObject({ detalle: null });
  });
});

test("historialDeCita conserva el orden de los eventos", () => {
  const lineas = historialDeCita(
    [evento({ tipo: "creada" }), evento({ tipo: "cancelada", actor: "dueno" })],
    BOGOTA,
  );
  expect(lineas.map((l) => l.texto)).toEqual(["Reservada por el cliente", "Cancelada por ti"]);
});
