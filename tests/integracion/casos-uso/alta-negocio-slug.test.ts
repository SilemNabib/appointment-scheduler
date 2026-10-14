import { beforeEach, describe, expect, test, vi } from "vitest";
import { RESERVADOS } from "@/dominio/slug";
import { altaNegocio } from "@/servidor/casos-uso/alta-negocio";
import { ADMIN_PRUEBA, entradaDeAlta, filasDelAlta } from "../fixtures";

// Reglas del slug a través del alta: el alta falla y no crea ninguna fila (RN-02;
// ARCH §5 y §18.4; códigos de Q-09). Clerk se simula.

const createInvitation = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ invitations: { createInvitation } })),
}));

beforeEach(() => {
  createInvitation.mockReset().mockResolvedValue({});
  vi.stubEnv("APP_URL", "http://localhost:3000");
  return () => vi.unstubAllEnvs();
});

describe("alta: slug (RN-02)", () => {
  test("falla con un slug repetido y no crea ninguna fila", async () => {
    const primera = entradaDeAlta();
    expect((await altaNegocio(primera, ADMIN_PRUEBA)).ok).toBe(true);
    createInvitation.mockClear();

    const repetida = entradaDeAlta({ slug: primera.slug });
    expect(await altaNegocio(repetida, ADMIN_PRUEBA)).toEqual({ ok: false, error: "SLUG_NO_DISPONIBLE" });
    // Sigue el negocio de la primera, y el dueño de la segunda no quedó creado.
    expect(await filasDelAlta(primera.slug, repetida.correoDueno)).toEqual({ negocios: 1, miembros: 0 });
    expect(createInvitation).not.toHaveBeenCalled();
  });

  test.each(RESERVADOS)('falla con el slug reservado "%s" y no crea ninguna fila (ARCH §5)', async (slug) => {
    const entrada = entradaDeAlta({ slug });

    expect(await altaNegocio(entrada, ADMIN_PRUEBA)).toEqual({ ok: false, error: "SLUG_NO_DISPONIBLE" });
    expect(await filasDelAlta(slug, entrada.correoDueno)).toEqual({ negocios: 0, miembros: 0 });
    expect(createInvitation).not.toHaveBeenCalled();
  });

  test.each([
    ["mayúsculas", "Optica-Vision"],
    ["guion bajo", "optica_vision"],
    ["espacios", "optica vision"],
    ["tildes", "óptica"],
    ["punto", "optica.vision"],
    ["guion al inicio", "-optica"],
    ["guion al final", "optica-"],
    ["guion doble", "optica--vision"],
    ["2 caracteres", "ab"],
    ["41 caracteres", "a".repeat(41)],
    ["vacío", ""],
  ])("falla con formato inválido (%s) y no crea ninguna fila", async (_, slug) => {
    const entrada = entradaDeAlta({ slug });

    expect(await altaNegocio(entrada, ADMIN_PRUEBA)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect(await filasDelAlta(slug, entrada.correoDueno)).toEqual({ negocios: 0, miembros: 0 });
    expect(createInvitation).not.toHaveBeenCalled();
  });

  test("acepta los bordes válidos: 3 y 40 caracteres", async () => {
    // Empieza con un dígito, así nunca coincide con un slug reservado.
    const sufijo = `9${Math.random().toString(36).slice(2, 4).padEnd(2, "x")}`;
    for (const slug of [sufijo, `${sufijo}-${"a".repeat(36)}`]) {
      expect(slug.length === 3 || slug.length === 40).toBe(true);
      expect((await altaNegocio(entradaDeAlta({ slug }), ADMIN_PRUEBA)).ok, slug).toBe(true);
    }
  });
});
