import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { listarPoliticas, publicarPolitica } from "@/servidor/casos-uso/politica-datos";
import * as politicas from "@/servidor/db/repositorios/politicas";
import { politicaInicial } from "@/servidor/politica-datos/plantilla";
import { sesionDeDueno } from "../fixtures";

// Política de tratamiento de datos (PAN-17; D-05, RN-17; ARCH §17.3 y §18.3). Clerk se
// simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

describe("listarPoliticas y publicarPolitica", () => {
  test("un negocio nuevo tiene solo la v1, con la plantilla", async () => {
    const { negocioId } = await sesionDeDueno();

    expect(await listarPoliticas({ negocioId })).toEqual([
      { id: expect.any(String), version: 1, contenido: politicaInicial("Óptica Visión"), publicadaEn: expect.any(Date) },
    ]);
  });

  test("publicar crea la v2, y la v1 conserva su contenido y su fecha (ARCH §18.3: \"La política aceptada no cambia\")", async () => {
    const { negocioId } = await sesionDeDueno();
    const [v1] = await listarPoliticas({ negocioId });

    expect(await publicarPolitica({ negocioId }, { contenido: "# Política nueva" })).toEqual({
      ok: true,
      valor: { version: 2 },
    });

    const versiones = await listarPoliticas({ negocioId });
    expect(versiones.map((v) => v.version)).toEqual([2, 1]); // la vigente primero
    expect(versiones[0].contenido).toBe("# Política nueva");
    expect(versiones[1]).toEqual(v1);
  });

  test("las versiones son de cada negocio", async () => {
    const a = await sesionDeDueno();
    const b = await sesionDeDueno();

    await publicarPolitica({ negocioId: a.negocioId }, { contenido: "Versión de A" });
    await publicarPolitica({ negocioId: a.negocioId }, { contenido: "Otra versión de A" });

    expect((await listarPoliticas({ negocioId: a.negocioId })).map((v) => v.version)).toEqual([3, 2, 1]);
    expect((await listarPoliticas({ negocioId: b.negocioId })).map((v) => v.version)).toEqual([1]);
  });

  test("un texto vacío devuelve DATOS_INVALIDOS y no crea ninguna versión", async () => {
    const { negocioId } = await sesionDeDueno();

    for (const contenido of ["", "   \n  "]) {
      expect(await publicarPolitica({ negocioId }, { contenido })).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    }
    expect(await listarPoliticas({ negocioId })).toHaveLength(1);
  });

  test("el repositorio no expone ninguna función de UPDATE ni de DELETE sobre politica_datos", () => {
    expect(Object.keys(politicas).sort()).toEqual(["listar", "publicar"]);
    const fuente = readFileSync("src/servidor/db/repositorios/politicas.ts", "utf8");
    expect(fuente).not.toMatch(/\.(update|delete)\(/);
  });
});
