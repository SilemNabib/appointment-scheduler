import { afterEach, describe, expect, test, vi } from "vitest";
import { fallo, exito } from "@/dominio/resultado";
import { despacharSiSalioBien } from "@/servidor/notificaciones/despacho";

// Envío inmediato después de un cambio (ARCH §14.4).

const CITA_ID = "6f1c1d0e-2b3a-4c5d-8e9f-0a1b2c3d4e5f";

/** `after()` simulado: guarda las tareas para correrlas "después de responder". */
function simulado(procesar: (citaId: string) => Promise<unknown> = async () => {}) {
  const tareas: (() => Promise<void>)[] = [];
  const dependencias = { programar: vi.fn((t: () => Promise<void>) => void tareas.push(t)), procesar: vi.fn(procesar) };
  return { dependencias, tareas, despues: () => Promise.all(tareas.map((t) => t())) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("despacharSiSalioBien (ARCH §14.4)", () => {
  test("después de una operación exitosa, programa el proceso de las notificaciones de su cita", async () => {
    const { dependencias, despues } = simulado();
    const resultado = exito({ citaId: CITA_ID, codigo: "OV-4821" });

    expect(despacharSiSalioBien(resultado, dependencias)).toBe(resultado);
    // Nada corre antes de responder…
    expect(dependencias.procesar).not.toHaveBeenCalled();
    // …y después, se procesan las de esa cita.
    await despues();
    expect(dependencias.procesar).toHaveBeenCalledExactlyOnceWith(CITA_ID);
  });

  test("una operación que falla, como HORARIO_NO_DISPONIBLE, no despacha nada", () => {
    const { dependencias } = simulado();
    const resultado = fallo("HORARIO_NO_DISPONIBLE" as const);

    expect(despacharSiSalioBien(resultado, dependencias)).toBe(resultado);
    expect(dependencias.programar).not.toHaveBeenCalled();
    expect(dependencias.procesar).not.toHaveBeenCalled();
  });

  test("si el proceso falla después de responder, solo se registra, sin el mensaje del error", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { dependencias, despues } = simulado(async () => {
      throw new TypeError("fetch failed: ana@mail.com");
    });

    const resultado = despacharSiSalioBien(exito({ citaId: CITA_ID }), dependencias);

    expect(resultado).toEqual({ ok: true, valor: { citaId: CITA_ID } });
    await expect(despues()).resolves.toBeDefined();
    expect(registro).toHaveBeenCalledOnce();
    const linea = JSON.parse(String(registro.mock.calls[0][0]));
    expect(linea).toEqual({ evento: "despacho_fallido", citaId: CITA_ID, error: "TypeError" });
    expect(JSON.stringify(registro.mock.calls)).not.toContain("ana@mail.com");
  });

  test("si programar falla (por ejemplo, fuera de una solicitud), la respuesta no cambia", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const resultado = exito({ citaId: CITA_ID });
    const dependencias = {
      programar: () => {
        throw new Error("after() fuera del contexto de una solicitud");
      },
      procesar: vi.fn(async () => {}),
    };

    expect(despacharSiSalioBien(resultado, dependencias)).toBe(resultado);
    expect(dependencias.procesar).not.toHaveBeenCalled();
  });
});
