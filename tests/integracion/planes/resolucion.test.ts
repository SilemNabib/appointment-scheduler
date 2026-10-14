import { describe, expect, test } from "vitest";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { limite, tieneFuncionalidad } from "@/servidor/planes/acceso";
import {
  CLAVES_FUNCIONALIDADES,
  CLAVES_LIMITES,
  type Funcionalidad,
  type Limite,
} from "@/servidor/planes/catalogo";
import { crearNegocio, crearPlan, idPlanIlimitado } from "../fixtures";

// Orden de resolución de la función de acceso: excepción del negocio, plan y
// catálogo, con NULL = ilimitado (RN-25, RN-27; PRD §8.8; ARCH §16.3 y §20, Planes).

async function funcionalidadDelPlan(planId: string, funcionalidad: Funcionalidad, habilitada: boolean) {
  await db().insert(esquema.planFuncionalidad).values({ planId, funcionalidad, habilitada });
}

async function limiteDelPlan(planId: string, clave: Limite, valor: number | null) {
  await db().insert(esquema.planLimite).values({ planId, limite: clave, valor });
}

async function excepcionDeFuncionalidad(negocioId: string, funcionalidad: Funcionalidad, habilitada: boolean) {
  await db().insert(esquema.negocioFuncionalidad).values({ negocioId, funcionalidad, habilitada });
}

async function excepcionDeLimite(negocioId: string, clave: Limite, valor: number | null) {
  await db().insert(esquema.negocioLimite).values({ negocioId, limite: clave, valor });
}

describe("planes: resolución", () => {
  test("con el plan ilimitado y sin excepciones: cada funcionalidad habilitada y cada límite ilimitado (RN-27)", async () => {
    const negocioId = await crearNegocio(await idPlanIlimitado());

    for (const clave of CLAVES_FUNCIONALIDADES) {
      expect(await tieneFuncionalidad(negocioId, clave), clave).toBe(true);
    }
    for (const clave of CLAVES_LIMITES) {
      expect(await limite(negocioId, clave), clave).toBeNull();
    }
  });

  test("la excepción del negocio gana al plan (ARCH §16.3)", async () => {
    const planId = await crearPlan();
    await funcionalidadDelPlan(planId, "reports", true);
    await funcionalidadDelPlan(planId, "multi_user", false);
    await limiteDelPlan(planId, "max_services", 5);
    const negocioId = await crearNegocio(planId);
    await excepcionDeFuncionalidad(negocioId, "reports", false);
    await excepcionDeFuncionalidad(negocioId, "multi_user", true);
    await excepcionDeLimite(negocioId, "max_services", 2);

    expect(await tieneFuncionalidad(negocioId, "reports")).toBe(false);
    expect(await tieneFuncionalidad(negocioId, "multi_user")).toBe(true);
    expect(await limite(negocioId, "max_services")).toBe(2);
  });

  test("sin excepción, se usa el valor del plan, también NULL (ARCH §16.3)", async () => {
    const planId = await crearPlan();
    await funcionalidadDelPlan(planId, "reports", true);
    await limiteDelPlan(planId, "max_services", 5);
    await limiteDelPlan(planId, "max_users", null);
    // Un plan con 0 sedes gana al 1 del catálogo: la fila existe.
    await limiteDelPlan(planId, "max_locations", 0);
    const negocioId = await crearNegocio(planId);

    expect(await tieneFuncionalidad(negocioId, "reports")).toBe(true);
    expect(await limite(negocioId, "max_services")).toBe(5);
    expect(await limite(negocioId, "max_users")).toBeNull();
    expect(await limite(negocioId, "max_locations")).toBe(0);
  });

  test("una excepción con NULL es ilimitada aunque el plan tenga un valor (ARCH §20, Planes)", async () => {
    const planId = await crearPlan();
    await limiteDelPlan(planId, "max_services", 5);
    const negocioId = await crearNegocio(planId);
    await excepcionDeLimite(negocioId, "max_services", null);

    expect(await limite(negocioId, "max_services")).toBeNull();
  });

  test("una excepción con 0 gana a un plan ilimitado", async () => {
    const negocioId = await crearNegocio(await idPlanIlimitado());
    await excepcionDeLimite(negocioId, "max_resources", 0);

    expect(await limite(negocioId, "max_resources")).toBe(0);
  });

  test("sin excepción ni fila del plan se usa el catálogo: deshabilitada, 0, y 1 para max_locations (PRD §8.8)", async () => {
    const negocioId = await crearNegocio(await crearPlan());

    for (const clave of CLAVES_FUNCIONALIDADES) {
      expect(await tieneFuncionalidad(negocioId, clave), clave).toBe(false);
    }
    const limites = Object.fromEntries(
      await Promise.all(CLAVES_LIMITES.map(async (clave) => [clave, await limite(negocioId, clave)])),
    );
    expect(limites).toEqual({
      max_resources: 0,
      max_users: 0,
      max_services: 0,
      max_appointments_per_month: 0,
      max_emails_per_month: 0,
      max_locations: 1,
    });
  });

  test("las excepciones y los planes de otro negocio no cuentan", async () => {
    const planId = await crearPlan();
    await limiteDelPlan(planId, "max_services", 7);
    const negocioA = await crearNegocio(planId);
    const negocioB = await crearNegocio(await crearPlan());
    await excepcionDeLimite(negocioA, "max_users", 9);

    expect(await limite(negocioB, "max_services")).toBe(0);
    expect(await limite(negocioB, "max_users")).toBe(0);
  });
});
