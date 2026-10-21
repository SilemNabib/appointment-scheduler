import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import { guardarNegocio, leerNegocio, type EntradaNegocio } from "@/servidor/casos-uso/guardar-negocio";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearSede, sesionDeDueno } from "../fixtures";

// Caso de uso guardarNegocio (PAN-11; RN-32, Q-20). Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const entradaValida = (cambios: Partial<EntradaNegocio> = {}): EntradaNegocio => ({
  nombre: "Óptica Nueva",
  colorPrimario: "#1d4ed8",
  colorSecundario: "#f59e0b",
  direccion: "Carrera 7 # 12-34",
  ...cambios,
});

/** El negocio y todas sus sedes, para comparar antes y después. */
async function estado(negocioId: string) {
  const [negocio] = await db().select().from(esquema.negocio).where(eq(esquema.negocio.id, negocioId));
  const sedes = await db().select().from(esquema.sede).where(eq(esquema.sede.negocioId, negocioId));
  return { negocio, sedes: sedes.sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime()) };
}

describe("guardarNegocio", () => {
  test("actualiza el negocio y la sede principal del contexto, sin tocar las demás sedes ni los demás negocios", async () => {
    const { negocioId } = await sesionDeDueno();
    const otraSede = await crearSede(negocioId);
    const { negocioId: otroNegocio } = await sesionDeDueno();
    const antes = await estado(negocioId);
    const otroAntes = await estado(otroNegocio);

    expect(await guardarNegocio({ negocioId }, entradaValida())).toEqual({ ok: true, valor: undefined });

    const despues = await estado(negocioId);
    expect(despues.negocio).toMatchObject({
      nombre: "Óptica Nueva",
      colorPrimario: "#1d4ed8",
      colorSecundario: "#f59e0b",
    });
    const [principal, segunda] = despues.sedes;
    // sede.telefono no se escribe (Q-40): los teléfonos son contactos.
    expect(principal).toEqual({ ...antes.sedes[0], direccion: "Carrera 7 # 12-34" });
    expect(segunda).toEqual(antes.sedes.find((s) => s.id === otraSede));
    expect(await estado(otroNegocio)).toEqual(otroAntes);
    expect(await leerNegocio({ negocioId })).toEqual({
      nombre: "Óptica Nueva",
      logoUrl: null,
      colorPrimario: "#1d4ed8",
      colorSecundario: "#f59e0b",
      direccion: "Carrera 7 # 12-34",
    });
  });

  test("guarda los colores en minúsculas, y el secundario y la dirección vacíos como NULL", async () => {
    const { negocioId } = await sesionDeDueno();

    const resultado = await guardarNegocio(
      { negocioId },
      entradaValida({ colorPrimario: "#ABCDEF", colorSecundario: "", direccion: " " }),
    );

    expect(resultado.ok).toBe(true);
    expect(await leerNegocio({ negocioId })).toMatchObject({
      colorPrimario: "#abcdef",
      colorSecundario: null,
      direccion: null,
    });
  });

  test.each([
    ["un color sin #", { colorPrimario: "1d4ed8" }],
    ["un color de 3 dígitos", { colorPrimario: "#fff" }],
    ["un color con letras fuera de a-f", { colorPrimario: "#12345g" }],
    ["un color secundario inválido", { colorSecundario: "azul" }],
    ["un nombre vacío", { nombre: "   " }],
  ])("%s devuelve DATOS_INVALIDOS y no cambia nada", async (_, cambios) => {
    const { negocioId } = await sesionDeDueno();
    const antes = await estado(negocioId);

    expect(await guardarNegocio({ negocioId }, entradaValida(cambios))).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
    });
    expect(await estado(negocioId)).toEqual(antes);
  });
});
