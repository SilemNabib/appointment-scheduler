import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { CLAVES_FUNCIONALIDADES, CLAVES_LIMITES } from "@/servidor/planes/catalogo";
import { PLAN_ILIMITADO } from "@/servidor/planes/semilla";

// La base de datos y la semilla coinciden con el catálogo (ARCH §16.2, §20 Planes).

/** Claves que acepta el CHECK de un dominio, leídas de `pg_constraint`. */
async function clavesDelDominio(dominio: string) {
  const { rows } = await db().execute<{ definicion: string }>(sql`
    select pg_get_constraintdef(c.oid) as definicion
      from pg_constraint c
      join pg_type t on t.oid = c.contypid
     where t.typname = ${dominio}`);
  expect(rows).toHaveLength(1);
  return [...rows[0].definicion.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

describe("planes: catálogo y semilla", () => {
  test("las claves de clave_funcionalidad coinciden con FUNCIONALIDADES (ARCH §20, Planes)", async () => {
    expect(await clavesDelDominio("clave_funcionalidad")).toEqual([...CLAVES_FUNCIONALIDADES].sort());
  });

  test("las claves de clave_limite coinciden con LIMITES (ARCH §20, Planes)", async () => {
    expect(await clavesDelDominio("clave_limite")).toEqual([...CLAVES_LIMITES].sort());
  });

  test("después de la semilla existe el plan ilimitado, con las 6 funcionalidades habilitadas y los 6 límites en NULL (RN-26; Q-03)", async () => {
    const [plan] = await db()
      .select()
      .from(esquema.plan)
      .where(eq(esquema.plan.codigo, PLAN_ILIMITADO.codigo));
    expect(plan).toMatchObject({ codigo: "ilimitado", nombre: "Ilimitado (interno)", activo: true });

    const funcionalidades = await db()
      .select({ clave: esquema.planFuncionalidad.funcionalidad, habilitada: esquema.planFuncionalidad.habilitada })
      .from(esquema.planFuncionalidad)
      .where(eq(esquema.planFuncionalidad.planId, plan.id));
    expect(funcionalidades).toHaveLength(6);
    expect(Object.fromEntries(funcionalidades.map((f) => [f.clave, f.habilitada]))).toEqual(
      Object.fromEntries(CLAVES_FUNCIONALIDADES.map((clave) => [clave, true])),
    );

    const limites = await db()
      .select({ clave: esquema.planLimite.limite, valor: esquema.planLimite.valor })
      .from(esquema.planLimite)
      .where(eq(esquema.planLimite.planId, plan.id));
    expect(limites).toHaveLength(6);
    expect(Object.fromEntries(limites.map((l) => [l.clave, l.valor]))).toEqual(
      Object.fromEntries(CLAVES_LIMITES.map((clave) => [clave, null])),
    );
  });

  test("insertar un negocio sin plan_id falla (RN-26)", async () => {
    const error = await db()
      .execute(sql`
        insert into negocio (slug, nombre, fin_prueba)
        values (${`sin-plan-${randomUUID().slice(0, 8)}`}, 'Sin plan', now() + interval '30 days')`)
      .then(
        () => null,
        (e: Error) => e.cause ?? e,
      );

    expect(error).toMatchObject({ code: "23502", column: "plan_id" });
  });
});
