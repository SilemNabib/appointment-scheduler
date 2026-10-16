import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { altaNegocio } from "@/servidor/casos-uso/alta-negocio";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import * as recursos from "@/servidor/db/repositorios/recursos";
import * as sedes from "@/servidor/db/repositorios/sedes";
import { ADMIN_PRUEBA, crearNegocio, crearRecurso, crearSede, entradaDeAlta } from "../fixtures";

// Sede principal y su consultorio, sobre los que actúa toda la configuración del MVP
// (RN-32, D-16; Q-20). Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ invitations: { createInvitation: vi.fn(async () => ({})) } })),
}));

beforeEach(() => {
  vi.stubEnv("APP_URL", "http://localhost:3000");
  return () => vi.unstubAllEnvs();
});

async function darDeAlta() {
  const entrada = entradaDeAlta();
  const resultado = await altaNegocio(entrada, ADMIN_PRUEBA);
  if (!resultado.ok) throw new Error(resultado.error);
  return { negocioId: resultado.valor.negocioId, entrada };
}

describe("repositorios/sedes y recursos: sede principal", () => {
  test("después de un alta, principal devuelve la Sede principal y consultorioPrincipal, su Consultorio con capacidad 1", async () => {
    const { negocioId, entrada } = await darDeAlta();

    const sede = await sedes.principal(negocioId);
    expect(sede).toEqual({
      id: expect.any(String),
      nombre: "Sede principal",
      direccion: entrada.direccionSede,
      telefono: entrada.telefonoSede,
    });
    expect(await recursos.consultorioPrincipal(negocioId)).toEqual({
      id: expect.any(String),
      sedeId: sede!.id,
      nombre: "Consultorio",
      capacidad: 1,
    });
  });

  test("con el negocioId de otro negocio, que no tiene sede, o de uno inexistente, ambas devuelven null (ARCH §6)", async () => {
    await darDeAlta();
    const otroNegocio = await crearNegocio(); // sin sede ni recursos

    for (const negocioId of [otroNegocio, randomUUID()]) {
      expect(await sedes.principal(negocioId)).toBeNull();
      expect(await recursos.consultorioPrincipal(negocioId)).toBeNull();
    }
  });

  test("cada negocio obtiene su propia sede y su propio consultorio", async () => {
    const a = await darDeAlta();
    const b = await darDeAlta();

    const [sedeA, sedeB] = [await sedes.principal(a.negocioId), await sedes.principal(b.negocioId)];
    expect(sedeA!.id).not.toBe(sedeB!.id);
    expect((await recursos.consultorioPrincipal(a.negocioId))!.sedeId).toBe(sedeA!.id);
    expect((await recursos.consultorioPrincipal(b.negocioId))!.sedeId).toBe(sedeB!.id);
  });

  test("la principal es la sede activa con menor (orden, creado_en), y su consultorio no sale de otra sede (Q-20)", async () => {
    const { negocioId } = await darDeAlta();
    const original = await sedes.principal(negocioId);

    // Una sede creada después, con un consultorio de orden menor, no cambia nada.
    const otraSede = await crearSede(negocioId);
    await crearRecurso(negocioId, otraSede, { orden: -1 });
    expect(await sedes.principal(negocioId)).toEqual(original);
    expect((await recursos.consultorioPrincipal(negocioId))!.sedeId).toBe(original!.id);

    // Desactivada la original, la otra pasa a ser la principal.
    await db().update(esquema.sede).set({ activa: false }).where(eq(esquema.sede.id, original!.id));
    expect((await sedes.principal(negocioId))!.id).toBe(otraSede);
    expect((await recursos.consultorioPrincipal(negocioId))!.sedeId).toBe(otraSede);
  });

  test("consultorioPrincipal ignora los recursos inactivos y los profesionales", async () => {
    const { negocioId } = await darDeAlta();
    const sede = await sedes.principal(negocioId);
    const consultorio = await recursos.consultorioPrincipal(negocioId);

    await crearRecurso(negocioId, sede!.id, { orden: -2, activo: false });
    await crearRecurso(negocioId, sede!.id, { orden: -1, tipo: "profesional" });

    expect(await recursos.consultorioPrincipal(negocioId)).toEqual(consultorio);
  });
});
