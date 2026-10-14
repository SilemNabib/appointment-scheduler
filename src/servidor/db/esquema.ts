// Esquema de Drizzle: debe producir exactamente el DDL de ARCH §18.2.
//
// Las restricciones se nombran como lo haría Postgres al ejecutar ese DDL, que no
// las nombra (`<tabla>_pkey`, `<tabla>_<columna>_key`, `<tabla>_<columna>_fkey`,
// `<tabla>_<columna>_check`). Drizzle pondría otros nombres por defecto.
//
// Excepción a "todo servidor/ con `import 'server-only'`" (ARCH §4): drizzle-kit
// carga este archivo fuera de Next, donde `server-only` no se puede importar.
// Solo declara tablas; quien lo usa desde la app es cliente.ts, que sí lo protege.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Tipos y dominios ─────────────────────────────────────────────────────────

export const estadoSuscripcion = pgEnum("estado_suscripcion", ["prueba", "activa", "suspendida"]);
export const rolMiembro = pgEnum("rol_miembro", ["dueno"]);
export const tipoRecurso = pgEnum("tipo_recurso", ["consultorio", "profesional"]);
export const estadoCita = pgEnum("estado_cita", [
  "pendiente_pago",
  "confirmada",
  "completada",
  "cancelada",
  "no_asistio",
]);
export const origenCita = pgEnum("origen_cita", ["publico", "panel"]);
export const tipoActor = pgEnum("tipo_actor", ["cliente", "dueno", "sistema"]);
export const canalNotificacion = pgEnum("canal_notificacion", ["correo", "whatsapp"]);
export const tipoNotificacion = pgEnum("tipo_notificacion", [
  "confirmacion",
  "recordatorio",
  "cancelacion",
  "reprogramacion",
  "dueno_cita_nueva",
  "dueno_cambio",
  "dueno_gracia", // correos de la cuenta (S-16)
  "dueno_suspension",
  "empleado_cita_nueva", // módulo de empleados (RN-35)
  "empleado_cambio",
]);
export const estadoNotificacion = pgEnum("estado_notificacion", [
  "pendiente",
  "enviando",
  "enviada",
  "fallida",
  "cancelada",
]);

// Los dominios los crea la migración manual drizzle/0000_dominios.sql; aquí solo se
// declaran como tipo de columna para que las tablas los usen en lugar de `text`.
const claveFuncionalidad = customType<{ data: string }>({
  dataType: () => "clave_funcionalidad",
});
const claveLimite = customType<{ data: string }>({
  dataType: () => "clave_limite",
});

// ─── Planes (ARCH §16, §17.2) ─────────────────────────────────────────────────

export const plan = pgTable("plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique("plan_codigo_key"),
  nombre: text("nombre").notNull(),
  activo: boolean("activo").notNull().default(true),
});

export const planFuncionalidad = pgTable(
  "plan_funcionalidad",
  {
    planId: uuid("plan_id").notNull(),
    funcionalidad: claveFuncionalidad("funcionalidad").notNull(),
    habilitada: boolean("habilitada").notNull(),
  },
  (t) => [
    primaryKey({ name: "plan_funcionalidad_pkey", columns: [t.planId, t.funcionalidad] }),
    foreignKey({
      name: "plan_funcionalidad_plan_id_fkey",
      columns: [t.planId],
      foreignColumns: [plan.id],
    }).onDelete("cascade"),
  ],
);

export const planLimite = pgTable(
  "plan_limite",
  {
    planId: uuid("plan_id").notNull(),
    limite: claveLimite("limite").notNull(),
    valor: integer("valor"), // NULL = ilimitado
  },
  (t) => [
    primaryKey({ name: "plan_limite_pkey", columns: [t.planId, t.limite] }),
    foreignKey({
      name: "plan_limite_plan_id_fkey",
      columns: [t.planId],
      foreignColumns: [plan.id],
    }).onDelete("cascade"),
    check("plan_limite_valor_check", sql`${t.valor} IS NULL OR ${t.valor} >= 0`),
  ],
);
