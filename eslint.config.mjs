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

// ─── Tablas de planes solo en su módulo (RN-25, ARCH §16.1) ──────────────────
// Fuera de `src/servidor/planes/` nada lee las tablas de planes ni de excepciones:
// ni importándolas del esquema, ni con la API relacional (`db().query.planLimite`),
// ni nombrándolas en SQL. Todo pasa por la función de acceso (§16.3).

const MENSAJE_PLANES =
  "Solo src/servidor/planes/ lee las tablas de planes y de excepciones: usa tieneFuncionalidad, limite, exigirCupo o listarPlanes (RN-25, ARCH §16.3).";

const TABLAS_DE_PLANES = ["plan", "planFuncionalidad", "planLimite", "negocioFuncionalidad", "negocioLimite"];

// Con `importNames`, `import * as esquema` también se rechaza: podría leerlas igual.
const SIN_TABLAS_DE_PLANES = {
  regex: "^(@/servidor/db/|\\.{1,2}/(.*/)?)esquema$",
  importNames: TABLAS_DE_PLANES,
  caseSensitive: true,
  message: MENSAJE_PLANES,
};

// En SQL: las tablas de excepciones y de planes por su nombre, y `plan` cuando sigue a
// FROM, JOIN, INTO, UPDATE o TABLE (sola, la palabra "plan" es demasiado común).
const SQL_CON_TABLAS_DE_PLANES =
  "/\\b(plan_funcionalidad|plan_limite|negocio_funcionalidad|negocio_limite)\\b|\\b(from|join|into|update|table)\\s+\\W?plan\\b/i";

const SIN_SQL_DE_PLANES = [
  { selector: `TemplateElement[value.raw=${SQL_CON_TABLAS_DE_PLANES}]`, message: MENSAJE_PLANES },
  { selector: `Literal[value=${SQL_CON_TABLAS_DE_PLANES}]`, message: MENSAJE_PLANES },
  {
    selector: `MemberExpression[object.property.name="query"][property.name=/^(${TABLAS_DE_PLANES.join("|")})$/]`,
    message: MENSAJE_PLANES,
  },
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
  {
    files: ["src/**"],
    ignores: [
      "src/servidor/planes/**",
      // Declara las tablas y cliente.ts registra el esquema completo en Drizzle; ninguno las lee.
      "src/servidor/db/esquema.ts",
      "src/servidor/db/cliente.ts",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...SIN_SQL_DE_PLANES],
    },
  },
  {
    // dominio/, app/ y componentes/ ya tienen su propio `no-restricted-imports`, que
    // prohíbe importar servidor/db/ entero (y una regla repetida reemplaza a la anterior).
    files: ["src/**"],
    ignores: [
      "src/servidor/planes/**",
      "src/servidor/db/esquema.ts",
      "src/servidor/db/cliente.ts",
      "src/dominio/**",
      "src/app/**",
      "src/componentes/**",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: [SIN_TABLAS_DE_PLANES] }],
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
