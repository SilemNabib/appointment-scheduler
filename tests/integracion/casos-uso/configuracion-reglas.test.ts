import { describe, expect, test, vi } from "vitest";
import { guardarReglasReserva, leerConfiguracion, type EntradaReglas } from "@/servidor/casos-uso/configuracion";
import { sesionDeDueno } from "../fixtures";

// Regla de la granularidad (RN-08) en el caso de uso de las reglas de reserva. Clerk se
// simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const reglas = (granularidadMinutos: string): EntradaReglas => ({
  granularidadMinutos,
  anticipacionMinimaMinutos: "120",
  anticipacionMaximaDias: "60",
  plazoCancelacionHoras: "24",
  maxReprogramacionesCliente: "3",
  asistenciaPorDefecto: "completada",
});

describe("reglas de la configuración", () => {
  test("la granularidad acepta 15, 30 y 60 (RN-08)", async () => {
    const { negocioId } = await sesionDeDueno();

    for (const minutos of [15, 30, 60]) {
      expect(await guardarReglasReserva({ negocioId }, reglas(String(minutos)))).toEqual({ ok: true, valor: undefined });
      expect((await leerConfiguracion({ negocioId })).granularidadMinutos).toBe(minutos);
    }
  });

  test("cualquier otro valor, como 20, devuelve DATOS_INVALIDOS y no cambia nada (RN-08: \"la configuración solo acepta esos tres valores\")", async () => {
    const { negocioId } = await sesionDeDueno();
    const antes = await leerConfiguracion({ negocioId });

    for (const minutos of ["20", "45", "0", "120", ""]) {
      expect(await guardarReglasReserva({ negocioId }, { ...reglas(minutos), plazoCancelacionHoras: "1" })).toEqual({
        ok: false,
        error: "DATOS_INVALIDOS",
      });
    }
    expect(await leerConfiguracion({ negocioId })).toEqual(antes);
  });
});
