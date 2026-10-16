import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import { guardarConsultorio, leerConsultorio } from "@/servidor/casos-uso/consultorio";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearRecurso, crearSede, sesionDeDueno } from "../fixtures";

// Caso de uso guardarConsultorio (PAN-13; RN-06, Q-20). Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

async function recursosDe(negocioId: string) {
  const filas = await db().select().from(esquema.recurso).where(eq(esquema.recurso.negocioId, negocioId));
  return filas.sort((a, b) => a.id.localeCompare(b.id));
}

describe("guardarConsultorio", () => {
  test("cambia el nombre y la capacidad del consultorio de la sede principal, y de ningún otro recurso", async () => {
    const { negocioId } = await sesionDeDueno();
    const { negocioId: otroNegocio } = await sesionDeDueno();
    const principal = await leerConsultorio({ negocioId });
    // Otro consultorio en la sede principal, uno en otra sede y un empleado: ninguno cambia.
    await crearRecurso(negocioId, principal.sedeId, { nombre: "Sala 2", orden: 1 });
    await crearRecurso(negocioId, await crearSede(negocioId), { nombre: "Sala norte" });
    await crearRecurso(negocioId, principal.sedeId, { nombre: "Ana", tipo: "profesional", orden: -1 });
    const antes = await recursosDe(negocioId);
    const otroAntes = await recursosDe(otroNegocio);

    expect(await guardarConsultorio({ negocioId }, { nombre: "Consultorio 1", capacidad: "2" })).toEqual({
      ok: true,
      valor: undefined,
    });

    expect(await leerConsultorio({ negocioId })).toEqual({ ...principal, nombre: "Consultorio 1", capacidad: 2 });
    expect(await recursosDe(negocioId)).toEqual(
      antes.map((r) => (r.id === principal.id ? { ...r, nombre: "Consultorio 1", capacidad: 2 } : r)),
    );
    expect(await recursosDe(otroNegocio)).toEqual(otroAntes);
  });

  test.each([
    ["con decimales", "1.5"],
    ["que no es un número", "dos"],
    ["vacía", ""],
    ["de 0", "0"],
    ["negativa", "-1"],
  ])("una capacidad %s devuelve DATOS_INVALIDOS y no cambia nada", async (_, capacidad) => {
    const { negocioId } = await sesionDeDueno();
    const antes = await leerConsultorio({ negocioId });

    expect(await guardarConsultorio({ negocioId }, { nombre: "Consultorio 1", capacidad })).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
    });
    expect(await leerConsultorio({ negocioId })).toEqual(antes);
  });

  test("un nombre vacío devuelve DATOS_INVALIDOS", async () => {
    const { negocioId } = await sesionDeDueno();

    expect(await guardarConsultorio({ negocioId }, { nombre: "  ", capacidad: "1" })).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
    });
  });
});
