import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { registrarPago } from "@/servidor/casos-uso/suscripcion-admin";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { ADMIN_PRUEBA, crearNegocio } from "../fixtures";

// Acciones del admin sobre la suscripción (ADM-03; RN-04, RN-30, RN-31; ARCH §7.6 y
// §18.4). Los efectos sobre el acceso del dueño se prueban en T2.39.

async function negocio(negocioId: string) {
  const [fila] = await db().select().from(esquema.negocio).where(eq(esquema.negocio.id, negocioId));
  return fila;
}

describe("registrarPago", () => {
  test("\"Pagado hasta 2026-11-09\" se guarda como 2026-11-10T05:00:00Z y deja el negocio activa (ARCH §7.6)", async () => {
    const negocioId = await crearNegocio(undefined, {
      estadoSuscripcion: "activa",
      pagadoHasta: new Date("2026-10-01T05:00:00Z"),
    });

    expect(await registrarPago({ negocioId, pagadoHasta: "2026-11-09" }, ADMIN_PRUEBA)).toEqual({
      ok: true,
      valor: { pagadoHasta: new Date("2026-11-10T05:00:00Z") },
    });
    expect(await negocio(negocioId)).toMatchObject({
      estadoSuscripcion: "activa",
      pagadoHasta: new Date("2026-11-10T05:00:00Z"),
    });
  });

  test("reactiva un negocio suspendido y uno en prueba, que no tienen pagado_hasta (RN-31)", async () => {
    const suspendido = await crearNegocio(undefined, { estadoSuscripcion: "suspendida" });
    const enPrueba = await crearNegocio(); // en prueba, sin pagado_hasta

    for (const negocioId of [suspendido, enPrueba]) {
      expect((await registrarPago({ negocioId, pagadoHasta: "2026-12-31" }, ADMIN_PRUEBA)).ok).toBe(true);
      expect(await negocio(negocioId)).toMatchObject({
        estadoSuscripcion: "activa",
        pagadoHasta: new Date("2027-01-01T05:00:00Z"),
      });
    }
  });

  test.each([
    ["anterior al actual", "2026-10-30"],
    ["igual al actual", "2026-10-31"],
  ])("una fecha %s devuelve DATOS_INVALIDOS y no cambia nada", async (_, pagadoHasta) => {
    // Pagado hasta el 31 de octubre: guardado como el 1 de noviembre a las 00:00 locales.
    const negocioId = await crearNegocio(undefined, {
      estadoSuscripcion: "activa",
      pagadoHasta: new Date("2026-11-01T05:00:00Z"),
    });
    const antes = await negocio(negocioId);

    expect(await registrarPago({ negocioId, pagadoHasta }, ADMIN_PRUEBA)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect(await negocio(negocioId)).toEqual(antes);
  });

  test("una fecha inválida devuelve DATOS_INVALIDOS", async () => {
    const negocioId = await crearNegocio();

    for (const pagadoHasta of ["2026-02-30", "31/12/2026", ""]) {
      expect(await registrarPago({ negocioId, pagadoHasta }, ADMIN_PRUEBA)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    }
  });

  test("un negocio inexistente devuelve NO_ENCONTRADO", async () => {
    for (const negocioId of [randomUUID(), "no-es-un-id"]) {
      expect(await registrarPago({ negocioId, pagadoHasta: "2026-12-31" }, ADMIN_PRUEBA)).toEqual({
        ok: false,
        error: "NO_ENCONTRADO",
      });
    }
  });

  test("queda auditado con el admin como autor (RN-30)", async () => {
    const negocioId = await crearNegocio(undefined, { estadoSuscripcion: "suspendida" });

    await registrarPago({ negocioId, pagadoHasta: "2026-12-31" }, ADMIN_PRUEBA);

    const auditoria = await db()
      .select()
      .from(esquema.auditoriaAdmin)
      .where(and(eq(esquema.auditoriaAdmin.negocioId, negocioId), eq(esquema.auditoriaAdmin.operacion, "UPDATE")));
    expect(auditoria).toEqual([
      expect.objectContaining({
        actor: ADMIN_PRUEBA.clerkUserId,
        antes: expect.objectContaining({ estado_suscripcion: "suspendida", pagado_hasta: null }),
        despues: expect.objectContaining({ estado_suscripcion: "activa" }),
      }),
    ]);
  });
});
