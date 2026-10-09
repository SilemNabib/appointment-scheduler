import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const ruta = (relativa: string) =>
  fileURLToPath(new URL(relativa, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": ruta("./src"),
      // `server-only` lanza un error fuera del entorno de React Server Components;
      // en las pruebas se reemplaza por un módulo vacío.
      "server-only": ruta("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    // Mientras no haya pruebas, `vitest run` no debe fallar.
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
