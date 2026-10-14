// Esquema de Drizzle: debe producir exactamente el DDL de ARCH §18.2.
// Las tablas se declaran a partir de T1.12.
//
// Excepción a "todo servidor/ con `import 'server-only'`" (ARCH §4): drizzle-kit
// carga este archivo fuera de Next, donde `server-only` no se puede importar.
// Solo declara tablas; quien lo usa desde la app es cliente.ts, que sí lo protege.

export {};
