import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  accionesDelCliente,
  dentroDelPlazo,
  puedeMarcarAsistencia,
  type Accion,
  type CitaDelCliente,
  type ReglasDelCliente,
} from "@/dominio/plazos";
import type { EstadoEfectivo } from "@/dominio/suscripcion";
import { localAUtc } from "@/dominio/tiempo";

// Plazos de la cita (ARCH §20, dominio/plazos): RN-13 y RN-16 en el instante exacto del
// borde, y RN-34 con límite 3, 0 y `null`.

const BOGOTA = "America/Bogota";
const HORA = 60 * 60 * 1000;
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

describe("dentroDelPlazo (RN-13)", () => {
  const inicio = localAUtc("2026-10-14", "19:00", BOGOTA);

  test("con 24 horas: en inicio − 24 h sí, y 1 ms después no", () => {
    expect(dentroDelPlazo(inicio, 24, mas(inicio, -24 * HORA))).toBe(true);
    expect(dentroDelPlazo(inicio, 24, mas(inicio, -24 * HORA + 1))).toBe(false);
  });

  test("con 0 horas llega hasta el inicio", () => {
    expect(dentroDelPlazo(inicio, 0, inicio)).toBe(true);
    expect(dentroDelPlazo(inicio, 0, mas(inicio, 1))).toBe(false);
  });
});

describe("accionesDelCliente (GES-02 a GES-05; RN-13, RN-34, D-14; Q-69)", () => {
  // La cita de 7:00 p. m. del 14 de octubre en Bogotá, que en UTC es el 15 (ARCH §9).
  const inicio = localAUtc("2026-10-14", "19:00", BOGOTA);
  const borde = mas(inicio, -24 * HORA);
  const AL_DIA: EstadoEfectivo = { estado: "al_dia" };
  const reglas = (r: Partial<ReglasDelCliente> = {}): ReglasDelCliente => ({
    plazoCancelacionHoras: 24,
    maxReprogramacionesCliente: 3,
    ...r,
  });
  const cita = (c: Partial<CitaDelCliente> = {}): CitaDelCliente => ({
    estado: "confirmada",
    inicio,
    reprogramacionesCliente: 0,
    ...c,
  });
  const permitida: Accion = { permitida: true };
  const sin = (motivo: string, error: string) => ({ permitida: false, motivo, error });

  describe("plazo de 24 horas (RN-13; ARCH §20: en el instante exacto del borde)", () => {
    test("en inicio − 24 h se puede cancelar y reprogramar", () => {
      const a = accionesDelCliente(cita(), reglas(), AL_DIA, borde);
      expect(a.cancelar).toEqual(permitida);
      expect(a.reprogramar).toEqual(permitida);
    });

    test("en inicio − 24 h + 1 ms, ninguna, con FUERA_DE_PLAZO", () => {
      const a = accionesDelCliente(cita(), reglas(), AL_DIA, mas(borde, 1));
      expect(a.cancelar).toEqual(sin("fuera_de_plazo", "FUERA_DE_PLAZO"));
      expect(a.reprogramar).toEqual(sin("fuera_de_plazo", "FUERA_DE_PLAZO"));
    });

    test("en gracia, el negocio funciona igual (D-13)", () => {
      const enGracia: EstadoEfectivo = { estado: "en_gracia", suspendeEn: mas(inicio, 72 * HORA) };
      expect(accionesDelCliente(cita(), reglas(), enGracia, borde).cancelar).toEqual(permitida);
    });
  });

  describe("límite de reprogramaciones (RN-34; ARCH §20)", () => {
    test.each([
      [0, 3],
      [1, 2],
      [2, 1],
    ])("con límite 3 y %i hechas, reprograma y le quedan %i", (hechas, quedan) => {
      const a = accionesDelCliente(cita({ reprogramacionesCliente: hechas }), reglas(), AL_DIA, borde);
      expect(a.reprogramar).toEqual(permitida);
      expect(a.reprogramacionesRestantes).toBe(quedan);
    });

    test("con límite 3, después de 3 reprogramaciones solo se puede cancelar", () => {
      const a = accionesDelCliente(cita({ reprogramacionesCliente: 3 }), reglas(), AL_DIA, borde);
      expect(a.cancelar).toEqual(permitida);
      expect(a.reprogramar).toEqual(sin("sin_reprogramaciones", "LIMITE_REPROGRAMACIONES"));
      expect(a.reprogramacionesRestantes).toBe(0);
    });

    test("con límite 0, nunca se reprograma, aunque se pueda cancelar", () => {
      const a = accionesDelCliente(cita(), reglas({ maxReprogramacionesCliente: 0 }), AL_DIA, borde);
      expect(a.cancelar).toEqual(permitida);
      expect(a.reprogramar).toEqual(sin("reprogramar_no_permitido", "LIMITE_REPROGRAMACIONES"));
      expect(a.reprogramacionesRestantes).toBe(0);
    });

    test("con null no hay límite", () => {
      const a = accionesDelCliente(
        cita({ reprogramacionesCliente: 250 }),
        reglas({ maxReprogramacionesCliente: null }),
        AL_DIA,
        borde,
      );
      expect(a.reprogramar).toEqual(permitida);
      expect(a.reprogramacionesRestantes).toBeNull();
    });

    test("si el negocio baja el límite por debajo de lo hecho, no quedan negativas", () => {
      const a = accionesDelCliente(cita({ reprogramacionesCliente: 3 }), reglas({ maxReprogramacionesCliente: 1 }), AL_DIA, borde);
      expect(a.reprogramar).toEqual(sin("sin_reprogramaciones", "LIMITE_REPROGRAMACIONES"));
      expect(a.reprogramacionesRestantes).toBe(0);
    });
  });

  describe("sin acciones, cada una con su motivo (F-02, pasos 6 y 7; D-14; Q-69)", () => {
    const SUSPENDIDA: EstadoEfectivo = { estado: "suspendida" };
    test.each<[string, CitaDelCliente, EstadoEfectivo, Date, string, string]>([
      ["cancelada", cita({ estado: "cancelada" }), AL_DIA, borde, "cancelada", "ESTADO_INVALIDO"],
      ["ya empezada", cita(), AL_DIA, inicio, "pasada", "FUERA_DE_PLAZO"],
      ["completada", cita({ estado: "completada" }), AL_DIA, borde, "pasada", "ESTADO_INVALIDO"],
      ["no_asistio", cita({ estado: "no_asistio" }), AL_DIA, borde, "pasada", "ESTADO_INVALIDO"],
      ["pendiente_pago (ningún flujo del MVP)", cita({ estado: "pendiente_pago" }), AL_DIA, borde, "estado_invalido", "ESTADO_INVALIDO"],
      ["con el negocio suspendido", cita(), SUSPENDIDA, borde, "negocio_suspendido", "NEGOCIO_SUSPENDIDO"],
      // Lo que es de la cita va antes que la suspensión: no cambia al reactivar el negocio.
      ["cancelada, con el negocio suspendido", cita({ estado: "cancelada" }), SUSPENDIDA, borde, "cancelada", "ESTADO_INVALIDO"],
      ["ya empezada, con el negocio suspendido", cita(), SUSPENDIDA, mas(inicio, 1), "pasada", "FUERA_DE_PLAZO"],
    ])("%s", (_, c, suscripcion, ahora, motivo, error) => {
      const a = accionesDelCliente(c, reglas({ plazoCancelacionHoras: 0 }), suscripcion, ahora);
      expect(a.cancelar).toEqual(sin(motivo, error));
      expect(a.reprogramar).toEqual(sin(motivo, error));
    });

    test("con plazo 0, en el instante del inicio la cita ya pasó (Q-69: ahora ≥ inicio)", () => {
      const a = accionesDelCliente(cita(), reglas({ plazoCancelacionHoras: 0 }), AL_DIA, inicio);
      expect(a.cancelar).toEqual(sin("pasada", "FUERA_DE_PLAZO"));
      expect(accionesDelCliente(cita(), reglas({ plazoCancelacionHoras: 0 }), AL_DIA, mas(inicio, -1)).cancelar).toEqual(
        permitida,
      );
    });
  });

  test("el resultado no cambia con la zona del proceso en Bogotá (RN-03)", () => {
    const enTokio = [borde, mas(borde, 1), inicio].map((ahora) => accionesDelCliente(cita(), reglas(), AL_DIA, ahora));
    vi.stubEnv("TZ", BOGOTA);
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(BOGOTA);
    const enBogota = [borde, mas(borde, 1), inicio].map((ahora) => accionesDelCliente(cita(), reglas(), AL_DIA, ahora));
    expect(enBogota).toEqual(enTokio);
  });
});
