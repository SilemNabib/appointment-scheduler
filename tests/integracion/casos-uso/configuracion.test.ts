import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import {
  guardarRecordatorio,
  guardarReglasReserva,
  leerConfiguracion,
  type EntradaReglas,
} from "@/servidor/casos-uso/configuracion";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { sesionDeDueno } from "../fixtures";

// Reglas de reserva y recordatorio (PAN-15, PAN-16; RN-08, RN-21, RN-34; D-09, D-20,
// D-21). Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const reglas = (cambios: Partial<EntradaReglas> = {}): EntradaReglas => ({
  granularidadMinutos: "15",
  anticipacionMinimaMinutos: "60",
  anticipacionMaximaDias: "90",
  plazoCancelacionHoras: "12",
  maxReprogramacionesCliente: "2",
  asistenciaPorDefecto: "manual",
  ...cambios,
});

async function fila(negocioId: string) {
  const [f] = await db()
    .select()
    .from(esquema.configuracionNegocio)
    .where(eq(esquema.configuracionNegocio.negocioId, negocioId));
  return f;
}

describe("leerConfiguracion", () => {
  test("un negocio nuevo tiene los valores por defecto de D-09, D-20 y D-21", async () => {
    const { negocioId } = await sesionDeDueno();

    expect(await leerConfiguracion({ negocioId })).toEqual({
      granularidadMinutos: 30,
      anticipacionMinimaMinutos: 120,
      anticipacionMaximaDias: 60,
      plazoCancelacionHoras: 24,
      recordatorioHorasAntes: 24,
      maxReprogramacionesCliente: 3,
      asistenciaPorDefecto: "completada",
    });
  });
});

describe("guardarReglasReserva", () => {
  test("cambia solo la fila de configuracion_negocio del negocio del contexto", async () => {
    const { negocioId } = await sesionDeDueno();
    const { negocioId: otro } = await sesionDeDueno();
    const otroAntes = await fila(otro);

    expect(await guardarReglasReserva({ negocioId }, reglas())).toEqual({ ok: true, valor: undefined });

    expect(await leerConfiguracion({ negocioId })).toEqual({
      granularidadMinutos: 15,
      anticipacionMinimaMinutos: 60,
      anticipacionMaximaDias: 90,
      plazoCancelacionHoras: 12,
      recordatorioHorasAntes: 24,
      maxReprogramacionesCliente: 2,
      asistenciaPorDefecto: "manual",
    });
    expect(await fila(otro)).toEqual(otroAntes);
  });

  test("el límite de reprogramaciones vacío se guarda como sin límite (NULL), y 0 como \"no se permite\" (RN-34)", async () => {
    const { negocioId } = await sesionDeDueno();

    await guardarReglasReserva({ negocioId }, reglas({ maxReprogramacionesCliente: "" }));
    expect((await fila(negocioId)).maxReprogramacionesCliente).toBeNull();

    await guardarReglasReserva({ negocioId }, reglas({ maxReprogramacionesCliente: "0" }));
    expect((await fila(negocioId)).maxReprogramacionesCliente).toBe(0);
  });

  test.each<[string, Partial<EntradaReglas>]>([
    ["una anticipación máxima de 0 días", { anticipacionMaximaDias: "0" }],
    ["una anticipación máxima de 366 días", { anticipacionMaximaDias: "366" }],
    ["una anticipación mínima negativa", { anticipacionMinimaMinutos: "-1" }],
    ["una anticipación mínima vacía", { anticipacionMinimaMinutos: "" }],
    ["un plazo de cancelación con decimales", { plazoCancelacionHoras: "1.5" }],
    ["un límite de reprogramaciones negativo", { maxReprogramacionesCliente: "-1" }],
    ["una asistencia por defecto desconocida", { asistenciaPorDefecto: "cancelada" as never }],
  ])("%s devuelve DATOS_INVALIDOS y no cambia nada", async (_, cambios) => {
    const { negocioId } = await sesionDeDueno();
    const antes = await fila(negocioId);

    expect(await guardarReglasReserva({ negocioId }, reglas(cambios))).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect(await fila(negocioId)).toEqual(antes);
  });
});

describe("guardarRecordatorio", () => {
  test("guarda las horas antes de la cita, y \"ninguno\" como NULL (RN-21)", async () => {
    const { negocioId } = await sesionDeDueno();

    expect(await guardarRecordatorio({ negocioId }, { recordatorio: "2" })).toEqual({ ok: true, valor: undefined });
    expect((await fila(negocioId)).recordatorioHorasAntes).toBe(2);

    expect(await guardarRecordatorio({ negocioId }, { recordatorio: "ninguno" })).toEqual({ ok: true, valor: undefined });
    expect((await fila(negocioId)).recordatorioHorasAntes).toBeNull();
  });

  test.each(["0", "", "-3", "dos"])("con %j devuelve DATOS_INVALIDOS y no cambia nada", async (recordatorio) => {
    const { negocioId } = await sesionDeDueno();

    expect(await guardarRecordatorio({ negocioId }, { recordatorio })).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect((await fila(negocioId)).recordatorioHorasAntes).toBe(24);
  });
});
