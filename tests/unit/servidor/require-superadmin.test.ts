import { auth } from "@clerk/nextjs/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { requireSuperadmin } from "@/servidor/auth/sesion";
import { errorDe, esNoEncontrado } from "../../ayudantes-next";

// requireSuperadmin con auth() simulado (ADR-07; ARCH §5 y §7.5).

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

function conSesion(userId: string | null) {
  vi.mocked(auth).mockResolvedValue({ userId } as Awaited<ReturnType<typeof auth>>);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(auth).mockReset();
});

describe("requireSuperadmin", () => {
  test("un userId de la lista pasa, aunque la variable tenga espacios junto a las comas", async () => {
    vi.stubEnv("SUPERADMIN_CLERK_USER_IDS", " user_uno ,user_dos , user_tres");

    for (const userId of ["user_uno", "user_dos", "user_tres"]) {
      conSesion(userId);
      expect(await requireSuperadmin()).toEqual({ clerkUserId: userId });
    }
  });

  test("un userId fuera de la lista llama a notFound()", async () => {
    vi.stubEnv("SUPERADMIN_CLERK_USER_IDS", "user_uno,user_dos");
    conSesion("user_otro");

    expect(esNoEncontrado(await errorDe(requireSuperadmin()))).toBe(true);
  });

  test.each([
    ["vacía", ""],
    ["con solo comas y espacios", " , ,"],
  ])("con la variable %s llama a notFound()", async (_, valor) => {
    vi.stubEnv("SUPERADMIN_CLERK_USER_IDS", valor);
    conSesion("user_uno");

    expect(esNoEncontrado(await errorDe(requireSuperadmin()))).toBe(true);
  });

  test("sin la variable llama a notFound()", async () => {
    vi.stubEnv("SUPERADMIN_CLERK_USER_IDS", undefined);
    conSesion("user_uno");

    expect(esNoEncontrado(await errorDe(requireSuperadmin()))).toBe(true);
  });

  test("sin sesión llama a notFound(), no redirige a /login", async () => {
    vi.stubEnv("SUPERADMIN_CLERK_USER_IDS", "user_uno");
    conSesion(null);

    expect(esNoEncontrado(await errorDe(requireSuperadmin()))).toBe(true);
  });
});
