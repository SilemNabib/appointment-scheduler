import { describe, expect, test } from "vitest";
import { evaluarInicio, iniciosDisponibles, type ContextoAgenda } from "@/dominio/disponibilidad";
import { intervaloDeDias } from "@/dominio/tiempo";
import { BOGOTA, contexto, franja, intervalo, local } from "./ayudantes-disponibilidad";

// iniciosDisponibles (RN-07 a RN-10; ARCH §10.1 y §20, suite `dominio/disponibilidad`).
// La semana del 12 (lunes) al 18 (domingo) de octubre de 2026.

/** Inicios como horas locales `fecha HH:mm`, para leer las expectativas. */
const comoLocal = (inicios: Date[]) =>
  inicios.map((d) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: BOGOTA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d),
  );

describe("iniciosDisponibles: recorrido (ARCH §10.1)", () => {
  test("recorre la franja con la granularidad mientras el servicio cabe", () => {
    const ctx = contexto({ franjas: [franja(1, "08:00", "10:00")] });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 08:30",
      "2026-10-12 09:00",
      "2026-10-12 09:30",
    ]);
  });

  test("solo los días de la semana con franjas, en orden, y cada franja por separado", () => {
    const ctx = contexto({
      franjas: [franja(3, "14:00", "15:00"), franja(1, "08:00", "09:00"), franja(3, "08:00", "08:30")],
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-18"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 08:30",
      "2026-10-14 08:00",
      "2026-10-14 14:00",
      "2026-10-14 14:30",
    ]);
  });

  test("empieza en el primer múltiplo de la granularidad desde las 00:00 locales (S-02)", () => {
    const ctx = contexto({ franjas: [franja(1, "08:15", "10:00")] });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 08:30",
      "2026-10-12 09:00",
      "2026-10-12 09:30",
    ]);
  });

  test("el buffer al final de la franja corta el último inicio (ARCH §20)", () => {
    const ctx = contexto({
      franjas: [franja(1, "08:00", "10:00")],
      servicio: { duracionMin: 30, bufferMin: 10 },
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 08:30",
      "2026-10-12 09:00",
    ]);
  });

  test("sin franjas no hay inicios, y un rango que termina antes de empezar lanza un error", () => {
    expect(iniciosDisponibles(contexto(), "2026-10-12", "2026-10-18")).toEqual([]);
    expect(() => iniciosDisponibles(contexto(), "2026-10-18", "2026-10-12")).toThrow(RangeError);
  });
});

describe("iniciosDisponibles: bloqueos y capacidad", () => {
  test("un bloqueo de día completo deja ese día sin inicios y no afecta a los demás días del rango (ARCH §20)", () => {
    const todosLosDias = ([1, 2, 3, 4, 5] as const).map((dia) => franja(dia, "08:00", "09:00"));
    const ctx = contexto({
      franjas: todosLosDias,
      bloqueos: [intervaloDeDias("2026-10-14", "2026-10-14", BOGOTA)],
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-16"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 08:30",
      "2026-10-13 08:00",
      "2026-10-13 08:30",
      "2026-10-15 08:00",
      "2026-10-15 08:30",
      "2026-10-16 08:00",
      "2026-10-16 08:30",
    ]);
  });

  test("un bloqueo de unas horas solo quita los inicios cuyo intervalo se solapa con él", () => {
    const ctx = contexto({
      franjas: [franja(1, "08:00", "11:00")],
      bloqueos: [intervalo("2026-10-12", "09:15", "09:45")],
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 08:30",
      "2026-10-12 10:00",
      "2026-10-12 10:30",
    ]);
  });

  test("capacidad 2 con citas escalonadas de 9:00 a 9:30 y de 9:30 a 10:00: 60 min se ofrecen a las 9:00 (ARCH §10.2)", () => {
    const ctx = contexto({
      franjas: [franja(1, "08:00", "12:00")],
      servicio: { duracionMin: 60, bufferMin: 0 },
      capacidad: 2,
      ocupacion: [intervalo("2026-10-12", "09:00", "09:30"), intervalo("2026-10-12", "09:30", "10:00")],
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toContain("2026-10-12 09:00");
  });

  test("con capacidad 1, una cita ocupa su intervalo y deja libres los demás", () => {
    const ctx = contexto({
      franjas: [franja(1, "08:00", "10:00")],
      ocupacion: [intervalo("2026-10-12", "08:30", "09:00")],
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 09:00",
      "2026-10-12 09:30",
    ]);
  });

  test("la anticipación máxima del cliente recorta los últimos días del rango", () => {
    const ctx = contexto({
      franjas: [franja(1, "08:00", "09:00"), franja(2, "08:00", "09:00")],
      ahora: local("2026-10-05", "08:00"),
      config: { granularidadMin: 30, anticipacionMinimaMin: 0, anticipacionMaximaDias: 8 },
    });
    // El martes 13 a las 8:00 es exactamente ahora + 8 días: entra; las 8:30, no.
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-13"))).toEqual([
      "2026-10-12 08:00",
      "2026-10-12 08:30",
      "2026-10-13 08:00",
    ]);
  });

  test("la anticipación del cliente recorta los inicios del día de hoy", () => {
    const ctx = contexto({
      franjas: [franja(1, "08:00", "12:00")],
      ahora: local("2026-10-12", "08:10"),
      config: { granularidadMin: 30, anticipacionMinimaMin: 120, anticipacionMaximaDias: 60 },
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 10:30",
      "2026-10-12 11:00",
      "2026-10-12 11:30",
    ]);
  });
});

describe("iniciosDisponibles: el dueño (D-11; ARCH §20)", () => {
  // Lunes 12: franjas de 8:00 a 10:00 y de 14:00 a 15:00; bloqueo de 9:00 a 9:30;
  // una cita de 14:00 a 14:30 con capacidad 1. Son las 8:10 y la anticipación mínima es de 2 h.
  const base = {
    franjas: [franja(1, "08:00", "10:00"), franja(1, "14:00", "15:00")],
    bloqueos: [intervalo("2026-10-12", "09:00", "09:30")],
    ocupacion: [intervalo("2026-10-12", "14:00", "14:30")],
    ahora: local("2026-10-12", "08:10"),
    config: { granularidadMin: 30 as const, anticipacionMinimaMin: 120, anticipacionMaximaDias: 60 },
  };

  test("ve inicios dentro de la anticipación mínima, pero nunca antes de ahora, fuera del horario, sobre un bloqueo ni sin cupo", () => {
    expect(comoLocal(iniciosDisponibles(contexto({ ...base, actor: "dueno" }), "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 08:30", // dentro de la anticipación mínima: solo para el dueño
      "2026-10-12 09:30",
      "2026-10-12 14:30",
    ]);
  });

  test("el cliente, con el mismo contexto, solo ve lo que respeta la anticipación mínima", () => {
    expect(comoLocal(iniciosDisponibles(contexto({ ...base, actor: "cliente" }), "2026-10-12", "2026-10-12"))).toEqual([
      "2026-10-12 14:30",
    ]);
  });

  test("el dueño ve días más allá de la anticipación máxima", () => {
    const ctx = contexto({
      ...base,
      actor: "dueno",
      config: { granularidadMin: 30, anticipacionMinimaMin: 120, anticipacionMaximaDias: 1 },
    });
    expect(comoLocal(iniciosDisponibles(ctx, "2026-10-19", "2026-10-19"))).toEqual([
      "2026-10-19 08:00",
      "2026-10-19 08:30",
      "2026-10-19 09:00",
      "2026-10-19 09:30",
      "2026-10-19 14:00",
      "2026-10-19 14:30",
    ]);
  });
});

describe("iniciosDisponibles: zona horaria (RN-03; ARCH §9)", () => {
  test("con una franja el 14-oct-2026 hasta las 8:00 p. m., las 7:00 p. m. salen en la fecha local 2026-10-14 como 2026-10-15T00:00:00Z", () => {
    const ctx = contexto({ franjas: [franja(3, "18:00", "20:00")], servicio: { duracionMin: 60, bufferMin: 0 } });
    const inicios = iniciosDisponibles(ctx, "2026-10-14", "2026-10-14");
    expect(inicios.map((d) => d.toISOString())).toEqual([
      "2026-10-14T23:00:00.000Z",
      "2026-10-14T23:30:00.000Z",
      "2026-10-15T00:00:00.000Z",
    ]);
    // El jueves 15 (local) no tiene franjas: la cita de las 7:00 p. m. no aparece en él.
    expect(iniciosDisponibles(ctx, "2026-10-15", "2026-10-15")).toEqual([]);
  });

  test("no depende de la zona del proceso", () => {
    const original = process.env.TZ;
    try {
      const ctx = contexto({ franjas: [franja(3, "18:00", "20:00")], servicio: { duracionMin: 60, bufferMin: 0 } });
      const enBogota = iniciosDisponibles(ctx, "2026-10-14", "2026-10-14").map((d) => d.toISOString());
      process.env.TZ = "Asia/Tokyo";
      expect(iniciosDisponibles(ctx, "2026-10-14", "2026-10-14").map((d) => d.toISOString())).toEqual(enBogota);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe("iniciosDisponibles y evaluarInicio coinciden (RN-09)", () => {
  /** Generador determinista (mulberry32), para que un fallo se pueda repetir. */
  function aleatorio(semilla: number) {
    let a = semilla;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DIAS = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
  const hora = (minutos: number) =>
    `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;

  /** Contexto al azar: franjas sin solapes (a veces contiguas), bloqueos, citas, buffer y anticipación. */
  function contextoAlAzar(semilla: number): ContextoAgenda {
    const r = aleatorio(semilla);
    const entre = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
    const franjas: ContextoAgenda["franjas"] = [];
    for (const dia of [1, 2, 3, 4, 5, 6, 7] as const) {
      let desde = entre(6, 10) * 60 + entre(0, 3) * 15;
      for (let i = entre(0, 3); i > 0 && desde < 22 * 60; i--) {
        const hasta = Math.min(desde + entre(2, 16) * 15, 23 * 60 + 45);
        franjas.push(franja(dia, hora(desde), hora(hasta)));
        desde = hasta + (r() < 0.3 ? 0 : entre(1, 8) * 15); // a veces, franjas contiguas (D-12)
      }
    }
    const intervaloAlAzar = (maxMinutos: number) => {
      const fecha = DIAS[entre(0, DIAS.length - 1)];
      const desde = entre(6 * 4, 21 * 4) * 15 + entre(0, 14);
      return intervalo(fecha, hora(desde), hora(Math.min(desde + entre(5, maxMinutos), 23 * 60 + 59)));
    };
    return contexto({
      ahora: local(DIAS[entre(0, 2)], hora(entre(6, 20) * 60 + entre(0, 59))),
      servicio: { duracionMin: entre(1, 8) * 15, bufferMin: [0, 0, 5, 10, 15][entre(0, 4)] },
      capacidad: entre(1, 3),
      config: {
        granularidadMin: ([15, 30, 60] as const)[entre(0, 2)],
        anticipacionMinimaMin: [0, 60, 120, 240][entre(0, 3)],
        anticipacionMaximaDias: entre(1, 10),
      },
      franjas,
      bloqueos: Array.from({ length: entre(0, 3) }, () => intervaloAlAzar(300)),
      ocupacion: Array.from({ length: entre(0, 12) }, () => intervaloAlAzar(120)),
      actor: r() < 0.5 ? "cliente" : "dueno",
    });
  }

  test.each(Array.from({ length: 40 }, (_, i) => i + 1))(
    "contexto al azar %i: cada inicio de la lista pasa evaluarInicio, y cada inicio alineado del rango que no está, falla",
    (semilla) => {
      const ctx = contextoAlAzar(semilla);
      const lista = iniciosDisponibles(ctx, DIAS[0], DIAS[DIAS.length - 1]);
      const enLaLista = new Set(lista.map((d) => d.getTime()));

      for (const inicio of lista) expect(evaluarInicio(ctx, inicio)).toEqual({ ok: true });

      const { inicio, fin } = intervaloDeDias(DIAS[0], DIAS[DIAS.length - 1], BOGOTA);
      const paso = ctx.config.granularidadMin * 60_000; // Bogotá no tiene horario de verano
      let alineados = 0;
      for (let t = inicio.getTime(); t < fin.getTime(); t += paso, alineados++) {
        if (!enLaLista.has(t)) expect(evaluarInicio(ctx, new Date(t)).ok).toBe(false);
      }
      expect(alineados).toBe((7 * 24 * 60) / ctx.config.granularidadMin);
    },
  );
});
