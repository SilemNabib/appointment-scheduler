import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const ruta = (relativa: string) =>
  fileURLToPath(new URL(relativa, import.meta.url));

/**
 * Pruebas que procesan "todo lo vencido" de todos los negocios: el procesador de la
 * bandeja de salida sin `citaId`, el cron, los vencimientos y la asistencia por defecto
 * (ARCH §14.3, §14.4 y §7.6). En paralelo con las demás tomarían sus filas, así que corren
 * en su propio proyecto, con su propia rama efímera, después de las demás y de a un
 * archivo (T6.15).
 */
const PRUEBAS_GLOBALES = [
  "tests/integracion/notificaciones/procesar.test.ts",
  "tests/integracion/casos-uso/vencimientos.test.ts",
  "tests/integracion/casos-uso/asistencia-por-defecto.test.ts",
];

const integracion = {
  environment: "node",
  // Crea y elimina la rama efímera de Neon (ARCH §20).
  globalSetup: ["tests/integracion/global-setup.ts"],
  setupFiles: ["tests/integracion/setup.ts"],
  testTimeout: 30_000,
  hookTimeout: 60_000,
};

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
      {
        extends: true,
        test: {
          ...integracion,
          name: "integracion",
          include: ["tests/integracion/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...PRUEBAS_GLOBALES],
        },
      },
      {
        extends: true,
        test: {
          ...integracion,
          name: "integracion-global",
          include: PRUEBAS_GLOBALES,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
