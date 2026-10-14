import { and, count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { altaNegocio } from "@/servidor/casos-uso/alta-negocio";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { limite, tieneFuncionalidad } from "@/servidor/planes/acceso";
import { CLAVES_FUNCIONALIDADES, CLAVES_LIMITES } from "@/servidor/planes/catalogo";
import { ADMIN_PRUEBA, entradaDeAlta, filasDelAlta } from "../fixtures";

// Lo que deja el alta según las reglas de sedes, planes y auditoría (RN-26, RN-27,
// RN-30, RN-32; ARCH §20, Sedes). Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ invitations: { createInvitation: vi.fn(async () => ({})) } })),
}));

beforeEach(() => {
  vi.stubEnv("APP_URL", "http://localhost:3000");
  return () => vi.unstubAllEnvs();
});

async function darDeAlta() {
  const resultado = await altaNegocio(entradaDeAlta(), ADMIN_PRUEBA);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.valor.negocioId;
}

describe("alta: efectos", () => {
  test("crea la Sede principal con el recurso Consultorio en ella (RN-32; ARCH §20, Sedes)", async () => {
    const negocioId = await darDeAlta();

    const sedes = await db().select().from(esquema.sede).where(eq(esquema.sede.negocioId, negocioId));
    const recursos = await db().select().from(esquema.recurso).where(eq(esquema.recurso.negocioId, negocioId));
    expect(sedes).toMatchObject([{ nombre: "Sede principal", activa: true }]);
    expect(recursos).toMatchObject([{ nombre: "Consultorio", sedeId: sedes[0].id, capacidad: 1, activo: true }]);
  });

  test.each([
    ["sin plan", { plan: undefined as never }],
    ["con el plan vacío", { plan: "" }],
    ["con un plan inexistente", { plan: "no-existe" }],
  ])("no se puede dar de alta un negocio %s (RN-26)", async (_, cambios) => {
    const entrada = entradaDeAlta(cambios);

    expect(await altaNegocio(entrada, ADMIN_PRUEBA)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect(await filasDelAlta(entrada.slug, entrada.correoDueno)).toEqual({ negocios: 0, miembros: 0 });
  });

  test("con el plan ilimitado queda sin excepciones, y la función de acceso responde habilitada e ilimitado (RN-26, RN-27)", async () => {
    const negocioId = await darDeAlta();

    const [funcionalidades] = await db()
      .select({ total: count() })
      .from(esquema.negocioFuncionalidad)
      .where(eq(esquema.negocioFuncionalidad.negocioId, negocioId));
    const [limites] = await db()
      .select({ total: count() })
      .from(esquema.negocioLimite)
      .where(eq(esquema.negocioLimite.negocioId, negocioId));
    expect({ funcionalidades: funcionalidades.total, limites: limites.total }).toEqual({ funcionalidades: 0, limites: 0 });

    for (const clave of CLAVES_FUNCIONALIDADES) {
      expect(await tieneFuncionalidad(negocioId, clave), clave).toBe(true);
    }
    for (const clave of CLAVES_LIMITES) {
      expect(await limite(negocioId, clave), clave).toBeNull();
    }
  });

  test("queda en auditoria_admin con el clerk_user_id del administrador como autor (RN-30)", async () => {
    const negocioId = await darDeAlta();

    const registros = await db()
      .select()
      .from(esquema.auditoriaAdmin)
      .where(and(eq(esquema.auditoriaAdmin.negocioId, negocioId), eq(esquema.auditoriaAdmin.tabla, "negocio")));
    expect(registros).toMatchObject([
      {
        operacion: "INSERT",
        actor: ADMIN_PRUEBA.clerkUserId,
        antes: null,
        despues: { id: negocioId, plan_id: expect.any(String), estado_suscripcion: "prueba" },
      },
    ]);
  });
});
