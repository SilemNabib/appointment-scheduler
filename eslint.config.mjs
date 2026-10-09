import { builtinModules } from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ─── Reglas de dependencia entre capas (ARCH §4) ─────────────────────────────
// Se usan expresiones regulares y no patrones de gitignore: "path" o "util"
// en un patrón de gitignore también atraparían "./path" o "./util".

const escapar = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// `src/dominio/` no importa nada del proyecto fuera de sí mismo.
const DOMINIO_SIN_PROYECTO = [
  {
    regex: "^@/(?!dominio(/|$))",
    caseSensitive: true,
    message: "dominio/ no importa nada del proyecto fuera de sí mismo (ARCH §4).",
  },
  {
    // Se prohíbe todo `../`: desde dominio/, que es plano, siempre sale de él.
    // Si algún día tiene subcarpetas, entre ellas se usa `@/dominio/…`.
    regex: "^\\.\\.(/|$)",
    caseSensitive: true,
    message:
      "dominio/ no importa nada del proyecto fuera de sí mismo (ARCH §4). Dentro de dominio/, usa './…' o '@/dominio/…'.",
  },
];

// Ni librerías de framework o de E/S: recibe los datos y `ahora` como parámetros.
const LIBRERIAS_DE_FRAMEWORK_O_ES = [
  "next",
  "react",
  "react-dom",
  "server-only",
  "client-only",
  "drizzle-orm",
  "drizzle-kit",
  "@neondatabase/[^/]+",
  "@clerk/[^/]+",
  "@opennextjs/[^/]+",
  "wrangler",
  "resend",
  "@react-email/[^/]+",
  "node:.+",
  "cloudflare:.+",
  ...builtinModules.filter((m) => !m.startsWith("node:")).map(escapar),
];

const DOMINIO_SIN_FRAMEWORK_NI_ES = {
  regex: `^(${LIBRERIAS_DE_FRAMEWORK_O_ES.join("|")})(/|$)`,
  caseSensitive: true,
  message:
    "dominio/ no usa librerías de framework ni de E/S: recibe los datos y `ahora` como parámetros (ARCH §4).",
};

// `src/app/` y `src/componentes/` no acceden a `src/servidor/db/`: pasan por un caso de uso.
const MENSAJE_SIN_DB =
  "app/ y componentes/ no importan servidor/db/: llaman a un caso de uso de servidor/casos-uso/ (ARCH §4).";

const SIN_ACCESO_A_DB = [
  { regex: "^@/servidor/db(/|$)", caseSensitive: true, message: MENSAJE_SIN_DB },
  { regex: "^\\.{1,2}/(.*/)?servidor/db(/|$)", caseSensitive: true, message: MENSAJE_SIN_DB },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/dominio/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...DOMINIO_SIN_PROYECTO, DOMINIO_SIN_FRAMEWORK_NI_ES] },
      ],
    },
  },
  {
    files: ["src/app/**", "src/componentes/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: SIN_ACCESO_A_DB }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Salida de OpenNext y wrangler, y tipos generados por `wrangler types`:
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
  ]),
]);

export default eslintConfig;
