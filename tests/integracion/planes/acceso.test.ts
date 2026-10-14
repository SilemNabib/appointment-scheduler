import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { ErrorNegocio } from "@/dominio/resultado";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { exigirCupo, limite, listarPlanes, tieneFuncionalidad } from "@/servidor/planes/acceso";
import { crearNegocio, crearPlan, idPlanIlimitado } from "../fixtures";

// Función de acceso a planes (RN-25, ARCH §16.3). El orden completo de la
// resolución se prueba en T1.34.

async function conExcepcion(negocioId: string, valor: number | null) {
  await db().insert(esquema.negocioLimite).values({ negocioId, limite: "max_services", valor });
}

describe("servidor/planes/acceso: exigirCupo", () => {
  test("lanza ErrorNegocio('LIMITE_PLAN') cuando el uso alcanza o supera el límite", async () => {
    const negocioId = await crearNegocio();
    await conExcepcion(negocioId, 2);

    for (const usoActual of [2, 3]) {
      const error = await exigirCupo(negocioId, "max_services", usoActual).catch((e: unknown) => e);
      expect(error, `usoActual = ${usoActual}`).toBeInstanceOf(ErrorNegocio);
      expect((error as ErrorNegocio).codigo).toBe("LIMITE_PLAN");
    }
  });

  test("no lanza mientras el uso está por debajo del límite", async () => {
    const negocioId = await crearNegocio();
    await conExcepcion(negocioId, 2);

    await expect(exigirCupo(negocioId, "max_services", 1)).resolves.toBeUndefined();
  });

  test("no lanza cuando el límite es null (ilimitado), con el plan ilimitado o con una excepción en NULL", async () => {
    const conPlan = await crearNegocio(await idPlanIlimitado());
    const conExcepcionNula = await crearNegocio();
    await conExcepcion(conExcepcionNula, null);

    for (const negocioId of [conPlan, conExcepcionNula]) {
      expect(await limite(negocioId, "max_services")).toBeNull();
      await expect(exigirCupo(negocioId, "max_services", 1_000_000)).resolves.toBeUndefined();
    }
  });

  test("con un límite en 0 (valor del catálogo) rechaza el primero", async () => {
    const negocioId = await crearNegocio(await crearPlan());

    await expect(exigirCupo(negocioId, "max_services", 0)).rejects.toMatchObject({ codigo: "LIMITE_PLAN" });
  });
});

describe("servidor/planes/acceso: lecturas", () => {
  test("listarPlanes() devuelve id, codigo y nombre, incluido el plan ilimitado", async () => {
    const planes = await listarPlanes();

    expect(planes).toContainEqual({
      id: expect.any(String),
      codigo: "ilimitado",
      nombre: "Ilimitado (interno)",
    });
    for (const p of planes) expect(Object.keys(p).sort()).toEqual(["codigo", "id", "nombre"]);
  });

  test("tieneFuncionalidad() con el plan ilimitado responde habilitada", async () => {
    const negocioId = await crearNegocio(await idPlanIlimitado());

    expect(await tieneFuncionalidad(negocioId, "reports")).toBe(true);
  });

  test("un negocio inexistente responde NO_ENCONTRADO (ARCH §6)", async () => {
    await expect(limite(randomUUID(), "max_services")).rejects.toMatchObject({ codigo: "NO_ENCONTRADO" });
    await expect(tieneFuncionalidad(randomUUID(), "reports")).rejects.toMatchObject({
      codigo: "NO_ENCONTRADO",
    });
  });
});
