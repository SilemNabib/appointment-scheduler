import { describe, expect, test } from "vitest";
import { nextEnvLimpio, soloPublicas } from "../../../scripts/limpiar-env-del-bundle.mjs";

// Limpieza de los .env que OpenNext copia al bundle del Worker (RNF-04, ARCH §21.3).

describe("scripts/limpiar-env-del-bundle", () => {
  test("soloPublicas deja solo las NEXT_PUBLIC_*", () => {
    expect(
      soloPublicas({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
        NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/login",
        DATABASE_URL: "postgres://secreto",
        CLERK_SECRET_KEY: "sk_test_secreto",
        NEON_API_KEY: "napi_secreto",
        NEXT_PUBLICO: "no empieza igual",
      }),
    ).toEqual({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x", NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/login" });
    expect(soloPublicas(undefined)).toEqual({});
  });

  test("nextEnvLimpio conserva el formato de OpenNext y no deja ningún secreto", () => {
    const contenido = nextEnvLimpio({
      production: { NEXT_PUBLIC_A: "1", DATABASE_URL_DIRECTA: "postgres://secreto" },
      development: { CLERK_SECRET_KEY: "sk_test_secreto" },
      test: {},
    });

    expect(contenido).toBe(
      'export const production = {"NEXT_PUBLIC_A":"1"};\n' +
        "export const development = {};\n" +
        "export const test = {};\n",
    );
    expect(contenido).not.toMatch(/secreto/);
  });
});
