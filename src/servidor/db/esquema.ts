// Esquema de Drizzle: debe producir exactamente el DDL de ARCH §18.2.
//
// Las restricciones se nombran como lo haría Postgres al ejecutar ese DDL, que no
// las nombra (`<tabla>_pkey`, `<tabla>_<columna>_key`, `<tabla>_<columna>_fkey`,
// `<tabla>_<columna>_check`). Drizzle pondría otros nombres por defecto. Un CHECK
// que toca varias columnas se llama `<tabla>_check`, `<tabla>_check1`…, en el orden
// del DDL.
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
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/** `timestamptz`: todos los instantes se guardan en UTC (ARCH §9, §18.1). */
const instante = (columna: string) => timestamp(columna, { withTimezone: true });

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

// ─── Negocio (ARCH §17.1, §18.2) ──────────────────────────────────────────────

export const negocio = pgTable(
  "negocio",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique("negocio_slug_key"), // RN-02
    nombre: text("nombre").notNull(),
    logoUrl: text("logo_url"),
    colorPrimario: text("color_primario").notNull().default("#0f766e"),
    colorSecundario: text("color_secundario"),
    correoContacto: text("correo_contacto"), // dirección y teléfono van en sede (RN-32)
    zonaHoraria: text("zona_horaria").notNull().default("America/Bogota"), // validada en código contra la base IANA
    planId: uuid("plan_id").notNull(), // RN-26: sin valor por defecto
    estadoSuscripcion: estadoSuscripcion("estado_suscripcion").notNull().default("prueba"),
    finPrueba: instante("fin_prueba"), // vencimiento en 'prueba' (RN-31)
    pagadoHasta: instante("pagado_hasta"), // vencimiento en 'activa' (RN-31)
    creadoEn: instante("creado_en").notNull().defaultNow(),
    actualizadoEn: instante("actualizado_en")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "negocio_slug_check",
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${t.slug}) BETWEEN 3 AND 40`,
    ),
    check("negocio_color_primario_check", sql`${t.colorPrimario} ~ '^#[0-9a-f]{6}$'`),
    check("negocio_color_secundario_check", sql`${t.colorSecundario} ~ '^#[0-9a-f]{6}$'`),
    foreignKey({ name: "negocio_plan_id_fkey", columns: [t.planId], foreignColumns: [plan.id] }),
    // 'prueba' exige fin_prueba (RN-31).
    check("negocio_check", sql`${t.estadoSuscripcion} <> 'prueba' OR ${t.finPrueba} IS NOT NULL`),
    // 'activa' exige pagado_hasta (RN-31).
    check("negocio_check1", sql`${t.estadoSuscripcion} <> 'activa' OR ${t.pagadoHasta} IS NOT NULL`),
  ],
);

export const negocioFuncionalidad = pgTable(
  "negocio_funcionalidad",
  {
    negocioId: uuid("negocio_id").notNull(),
    funcionalidad: claveFuncionalidad("funcionalidad").notNull(),
    habilitada: boolean("habilitada").notNull(),
  },
  (t) => [
    primaryKey({ name: "negocio_funcionalidad_pkey", columns: [t.negocioId, t.funcionalidad] }),
    foreignKey({
      name: "negocio_funcionalidad_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
  ],
);

export const negocioLimite = pgTable(
  "negocio_limite",
  {
    negocioId: uuid("negocio_id").notNull(),
    limite: claveLimite("limite").notNull(),
    valor: integer("valor"), // NULL = ilimitado
  },
  (t) => [
    primaryKey({ name: "negocio_limite_pkey", columns: [t.negocioId, t.limite] }),
    foreignKey({
      name: "negocio_limite_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
    check("negocio_limite_valor_check", sql`${t.valor} IS NULL OR ${t.valor} >= 0`),
  ],
);

export const configuracionNegocio = pgTable(
  "configuracion_negocio",
  {
    negocioId: uuid("negocio_id").primaryKey(),
    granularidadMinutos: smallint("granularidad_minutos").notNull().default(30), // RN-08
    anticipacionMinimaMinutos: integer("anticipacion_minima_minutos").notNull().default(120),
    anticipacionMaximaDias: integer("anticipacion_maxima_dias").notNull().default(60),
    plazoCancelacionHoras: integer("plazo_cancelacion_horas").notNull().default(24), // RN-13
    recordatorioHorasAntes: integer("recordatorio_horas_antes").default(24), // RN-21; NULL = sin recordatorio
    maxReprogramacionesCliente: smallint("max_reprogramaciones_cliente").default(3), // RN-34; NULL = sin límite; 0 = no se permite
    asistenciaPorDefecto: text("asistencia_por_defecto").notNull().default("completada"), // D-21; 'manual' = siempre decide el dueño
  },
  (t) => [
    foreignKey({
      name: "configuracion_negocio_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
    check(
      "configuracion_negocio_granularidad_minutos_check",
      sql`${t.granularidadMinutos} IN (15, 30, 60)`,
    ),
    check(
      "configuracion_negocio_anticipacion_minima_minutos_check",
      sql`${t.anticipacionMinimaMinutos} >= 0`,
    ),
    check(
      "configuracion_negocio_anticipacion_maxima_dias_check",
      sql`${t.anticipacionMaximaDias} BETWEEN 1 AND 365`,
    ),
    check("configuracion_negocio_plazo_cancelacion_horas_check", sql`${t.plazoCancelacionHoras} >= 0`),
    check("configuracion_negocio_recordatorio_horas_antes_check", sql`${t.recordatorioHorasAntes} > 0`),
    check(
      "configuracion_negocio_max_reprogramaciones_cliente_check",
      sql`${t.maxReprogramacionesCliente} >= 0`,
    ),
    check(
      "configuracion_negocio_asistencia_por_defecto_check",
      sql`${t.asistenciaPorDefecto} IN ('completada', 'no_asistio', 'manual')`,
    ),
  ],
);

export const politicaDatos = pgTable(
  "politica_datos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    negocioId: uuid("negocio_id").notNull(),
    version: integer("version").notNull(),
    contenido: text("contenido").notNull(), // Markdown basado en la plantilla del SaaS
    publicadaEn: instante("publicada_en").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "politica_datos_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
    check("politica_datos_version_check", sql`${t.version} > 0`),
    unique("politica_datos_negocio_id_version_key").on(t.negocioId, t.version),
    unique("politica_datos_id_negocio_id_key").on(t.id, t.negocioId),
  ],
);

export const miembroNegocio = pgTable(
  "miembro_negocio",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    negocioId: uuid("negocio_id").notNull(),
    correo: text("correo").notNull().unique("miembro_negocio_correo_key"), // MVP: una persona, un negocio (ARCH §7.8)
    clerkUserId: text("clerk_user_id").unique("miembro_negocio_clerk_user_id_key"), // NULL hasta el primer ingreso (ARCH §7.4)
    rol: rolMiembro("rol").notNull().default("dueno"),
    vinculadoEn: instante("vinculado_en"),
    creadoEn: instante("creado_en").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "miembro_negocio_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
    check("miembro_negocio_correo_check", sql`${t.correo} = lower(${t.correo})`),
  ],
);
