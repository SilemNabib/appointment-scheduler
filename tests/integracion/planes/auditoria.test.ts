import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { beforeAll, describe, expect, test } from "vitest";
import { db, enTransaccion } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearNegocio, crearPlan } from "../fixtures";

// Los triggers de auditoría registran los cambios de plan, de suscripción y de
// excepciones, también con SQL directo (RN-30, ADR-11; ARCH §16.4 y §20, Planes).

const DIA = 24 * 60 * 60 * 1000;
const { auditoriaAdmin: auditoria } = esquema;

/** Rol de la base de datos: el autor cuando no hay `app.actor`. */
let rol: string;
beforeAll(async () => {
  const { rows } = await db().execute<{ rol: string }>(sql`select session_user as rol`);
  rol = rows[0].rol;
});

async function registros(donde: SQL | undefined) {
  return db().select().from(auditoria).where(donde).orderBy(asc(auditoria.id));
}

const delNegocio = (negocioId: string, tabla: string) =>
  registros(and(eq(auditoria.negocioId, negocioId), eq(auditoria.tabla, tabla)));

// Las tablas del plan no tienen negocio_id: se buscan por el plan_id de la fila.
const delPlan = (planId: string, tabla: string) =>
  registros(
    and(
      eq(auditoria.tabla, tabla),
      sql`coalesce(${auditoria.despues}, ${auditoria.antes}) ->> 'plan_id' = ${planId}`,
    ),
  );

/** Ejecuta `fn` en una transacción con `app.actor`, como la herramienta interna (ARCH §16.4). */
function comoActor(actor: string, fn: Parameters<typeof enTransaccion>[0]) {
  return enTransaccion(async (tx) => {
    await tx.execute(sql`select set_config('app.actor', ${actor}, true)`);
    return fn(tx);
  });
}

const instante = (valor: unknown) => new Date(valor as string).getTime();

/** Fila de la tabla auditada, como la guarda `to_jsonb` en `antes` y `despues`. */
type FilaJson = Record<string, unknown>;
type CamposNegocio = Partial<typeof esquema.negocio.$inferInsert>;

describe("planes: auditoría de negocio", () => {
  test("cada cambio de plan_id, estado_suscripcion, fin_prueba o pagado_hasta deja una fila con fecha, autor, antes y después (RN-30)", async () => {
    const negocioId = await crearNegocio();
    const otroPlan = await crearPlan();
    const [inicial] = await db().select().from(esquema.negocio).where(eq(esquema.negocio.id, negocioId));
    const nuevoFinPrueba = new Date(inicial.finPrueba!.getTime() + 7 * DIA);
    const pagadoHasta = new Date(Date.now() + 60 * DIA);
    const actualizar = (campos: CamposNegocio) =>
      db().update(esquema.negocio).set(campos).where(eq(esquema.negocio.id, negocioId));

    // El alta también queda registrada (trigger auditar_alta_negocio).
    expect(await delNegocio(negocioId, "negocio")).toMatchObject([{ operacion: "INSERT" }]);

    const cambios: [CamposNegocio, (antes: FilaJson, despues: FilaJson) => void][] = [
      [
        { finPrueba: nuevoFinPrueba },
        (antes, despues) => {
          expect(instante(antes.fin_prueba)).toBe(inicial.finPrueba!.getTime());
          expect(instante(despues.fin_prueba)).toBe(nuevoFinPrueba.getTime());
        },
      ],
      [
        { pagadoHasta },
        (antes, despues) => {
          expect(antes.pagado_hasta).toBeNull();
          expect(instante(despues.pagado_hasta)).toBe(pagadoHasta.getTime());
        },
      ],
      [
        { estadoSuscripcion: "activa" },
        (antes, despues) => {
          expect(antes.estado_suscripcion).toBe("prueba");
          expect(despues.estado_suscripcion).toBe("activa");
        },
      ],
      [
        { planId: otroPlan },
        (antes, despues) => {
          expect(antes.plan_id).toBe(inicial.planId);
          expect(despues.plan_id).toBe(otroPlan);
        },
      ],
    ];

    for (const [campos, comprobar] of cambios) {
      const previos = await delNegocio(negocioId, "negocio");
      const antesDelCambio = Date.now();
      await actualizar(campos);

      const nuevos = (await delNegocio(negocioId, "negocio")).slice(previos.length);
      expect(nuevos, JSON.stringify(campos)).toHaveLength(1);
      const [fila] = nuevos;
      expect(fila).toMatchObject({ negocioId, tabla: "negocio", operacion: "UPDATE", actor: rol });
      expect(fila.creadoEn.getTime()).toBeGreaterThan(antesDelCambio - 60_000);
      comprobar(fila.antes as FilaJson, fila.despues as FilaJson);
    }
  });

  test("un cambio que no toca el plan ni la suscripción no se registra", async () => {
    const negocioId = await crearNegocio();
    const previos = await delNegocio(negocioId, "negocio");

    await db().update(esquema.negocio).set({ nombre: "Otro nombre" }).where(eq(esquema.negocio.id, negocioId));

    expect(await delNegocio(negocioId, "negocio")).toHaveLength(previos.length);
  });
});

describe("planes: auditoría de excepciones y de planes (ARCH §20, Planes)", () => {
  test("insertar, cambiar y borrar en negocio_funcionalidad y negocio_limite queda registrado", async () => {
    const negocioId = await crearNegocio();
    const { negocioFuncionalidad: nf, negocioLimite: nl } = esquema;

    await db().insert(nf).values({ negocioId, funcionalidad: "reports", habilitada: true });
    await db().update(nf).set({ habilitada: false }).where(eq(nf.negocioId, negocioId));
    await db().delete(nf).where(eq(nf.negocioId, negocioId));

    await db().insert(nl).values({ negocioId, limite: "max_services", valor: 3 });
    await db().update(nl).set({ valor: null }).where(eq(nl.negocioId, negocioId));
    await db().delete(nl).where(eq(nl.negocioId, negocioId));

    expect(await delNegocio(negocioId, "negocio_funcionalidad")).toMatchObject([
      { operacion: "INSERT", actor: rol, antes: null, despues: { funcionalidad: "reports", habilitada: true } },
      { operacion: "UPDATE", actor: rol, antes: { habilitada: true }, despues: { habilitada: false } },
      { operacion: "DELETE", actor: rol, antes: { funcionalidad: "reports", habilitada: false }, despues: null },
    ]);
    expect(await delNegocio(negocioId, "negocio_limite")).toMatchObject([
      { operacion: "INSERT", actor: rol, antes: null, despues: { limite: "max_services", valor: 3 } },
      { operacion: "UPDATE", actor: rol, antes: { valor: 3 }, despues: { valor: null } },
      { operacion: "DELETE", actor: rol, antes: { limite: "max_services", valor: null }, despues: null },
    ]);
  });

  test("insertar, cambiar y borrar en plan_funcionalidad y plan_limite queda registrado", async () => {
    const planId = await crearPlan();
    const { planFuncionalidad: pf, planLimite: pl } = esquema;

    await db().insert(pf).values({ planId, funcionalidad: "multi_user", habilitada: false });
    await db().update(pf).set({ habilitada: true }).where(eq(pf.planId, planId));
    await db().delete(pf).where(eq(pf.planId, planId));

    await db().insert(pl).values({ planId, limite: "max_users", valor: null });
    await db().update(pl).set({ valor: 2 }).where(eq(pl.planId, planId));
    await db().delete(pl).where(eq(pl.planId, planId));

    expect(await delPlan(planId, "plan_funcionalidad")).toMatchObject([
      { operacion: "INSERT", actor: rol, negocioId: null, antes: null, despues: { habilitada: false } },
      { operacion: "UPDATE", actor: rol, antes: { habilitada: false }, despues: { habilitada: true } },
      { operacion: "DELETE", actor: rol, antes: { funcionalidad: "multi_user" }, despues: null },
    ]);
    expect(await delPlan(planId, "plan_limite")).toMatchObject([
      { operacion: "INSERT", actor: rol, negocioId: null, antes: null, despues: { valor: null } },
      { operacion: "UPDATE", actor: rol, antes: { valor: null }, despues: { valor: 2 } },
      { operacion: "DELETE", actor: rol, antes: { limite: "max_users", valor: 2 }, despues: null },
    ]);
  });
});

describe("planes: autor de la auditoría (RN-30)", () => {
  test("con set_config('app.actor', 'user_prueba', true) en la transacción, el autor es user_prueba", async () => {
    const negocioId = await crearNegocio();
    const otroPlan = await crearPlan();

    await comoActor("user_prueba", async (tx) => {
      await tx.update(esquema.negocio).set({ planId: otroPlan }).where(eq(esquema.negocio.id, negocioId));
      await tx.insert(esquema.negocioLimite).values({ negocioId, limite: "max_users", valor: 1 });
    });

    expect(await delNegocio(negocioId, "negocio")).toMatchObject([
      { operacion: "INSERT", actor: rol },
      { operacion: "UPDATE", actor: "user_prueba" },
    ]);
    expect(await delNegocio(negocioId, "negocio_limite")).toMatchObject([
      { operacion: "INSERT", actor: "user_prueba" },
    ]);
  });

  test("con SQL directo y sin app.actor, el autor es el rol de la base de datos", async () => {
    const negocioId = await crearNegocio();

    await db().execute(
      sql`update negocio set fin_prueba = fin_prueba + interval '1 day' where id = ${negocioId}`,
    );

    const filas = await delNegocio(negocioId, "negocio");
    expect(filas.at(-1)).toMatchObject({ operacion: "UPDATE", actor: rol });
    expect(rol).not.toBe("");
  });

  test("app.actor solo vive en su transacción", async () => {
    const negocioId = await crearNegocio();
    await comoActor("user_prueba", async () => {});

    await enTransaccion(async (tx) => {
      await tx
        .update(esquema.negocio)
        .set({ pagadoHasta: new Date(Date.now() + DIA) })
        .where(eq(esquema.negocio.id, negocioId));
    });

    expect((await delNegocio(negocioId, "negocio")).at(-1)).toMatchObject({ actor: rol });
  });
});
