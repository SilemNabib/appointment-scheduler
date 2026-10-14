import { inject } from "vitest";

// `cliente.ts` lee las cadenas de `process.env`: en las pruebas de integración
// apuntan a la rama efímera que crea global-setup.ts, nunca a `development`.
process.env.DATABASE_URL = inject("databaseUrl");
process.env.DATABASE_URL_DIRECTA = inject("databaseUrlDirecta");
