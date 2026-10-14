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
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
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

// ─── Agenda: sedes y recursos (ARCH §17.1, §18.2; D-16, D-17) ─────────────────

export const sede = pgTable(
  "sede",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    negocioId: uuid("negocio_id").notNull(),
    nombre: text("nombre").notNull(), // 'Sede principal' en el alta
    direccion: text("direccion"),
    telefono: text("telefono"),
    activa: boolean("activa").notNull().default(true), // siempre al menos una activa (código, RN-32)
    orden: smallint("orden").notNull().default(0),
    creadoEn: instante("creado_en").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "sede_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
    unique("sede_id_negocio_id_key").on(t.id, t.negocioId),
    unique("sede_negocio_id_nombre_key").on(t.negocioId, t.nombre),
  ],
);

export const recurso = pgTable(
  "recurso",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    negocioId: uuid("negocio_id").notNull(),
    sedeId: uuid("sede_id").notNull(),
    nombre: text("nombre").notNull(),
    tipo: tipoRecurso("tipo").notNull().default("consultorio"),
    capacidad: smallint("capacidad").notNull().default(1), // RN-06
    // Campos de empleados (RN-33): sin interfaz en el MVP (D-17).
    fotoUrl: text("foto_url"), // archivo en R2
    descripcion: text("descripcion"), // p. ej. "Colorista"
    correo: text("correo"), // C-09 y C-10 con invitación (RN-35)
    orden: smallint("orden").notNull().default(0), // orden en la página y desempate al asignar
    activo: boolean("activo").notNull().default(true),
    creadoEn: instante("creado_en").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "recurso_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
    check("recurso_capacidad_check", sql`${t.capacidad} >= 1`),
    check("recurso_correo_check", sql`${t.correo} = lower(${t.correo})`),
    // Un empleado atiende una cita a la vez (RN-33).
    check("recurso_check", sql`${t.tipo} <> 'profesional' OR ${t.capacidad} = 1`),
    unique("recurso_id_negocio_id_key").on(t.id, t.negocioId),
    unique("recurso_id_sede_id_key").on(t.id, t.sedeId), // para FK (recurso, sede)
    foreignKey({
      name: "recurso_sede_id_negocio_id_fkey",
      columns: [t.sedeId, t.negocioId],
      foreignColumns: [sede.id, sede.negocioId],
    }),
  ],
);

// ─── Catálogo de servicios y oferta por sede (ARCH §18.2; RN-05, RN-32, RN-33) ─

export const servicio = pgTable(
  "servicio",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    negocioId: uuid("negocio_id").notNull(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion"),
    duracionMinutos: smallint("duracion_minutos").notNull(), // RN-05
    bufferMinutos: smallint("buffer_minutos").notNull().default(0), // D-02
    activo: boolean("activo").notNull().default(true),
    orden: smallint("orden").notNull().default(0),
    creadoEn: instante("creado_en").notNull().defaultNow(),
    actualizadoEn: instante("actualizado_en")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: "servicio_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
    check("servicio_duracion_minutos_check", sql`${t.duracionMinutos} BETWEEN 5 AND 720`),
    check("servicio_buffer_minutos_check", sql`${t.bufferMinutos} BETWEEN 0 AND 240`),
    unique("servicio_id_negocio_id_key").on(t.id, t.negocioId),
  ],
);

/** Qué servicios del catálogo ofrece cada sede, con qué sobrescrituras (RN-32) y cómo se atienden (RN-33). */
export const servicioSede = pgTable(
  "servicio_sede",
  {
    negocioId: uuid("negocio_id").notNull(),
    servicioId: uuid("servicio_id").notNull(),
    sedeId: uuid("sede_id").notNull(),
    duracionMinutos: smallint("duracion_minutos"), // NULL = la del servicio
    bufferMinutos: smallint("buffer_minutos"), // NULL = el del servicio
    clienteElige: boolean("cliente_elige").notNull().default(false), // "el cliente elige quién lo atiende" (RN-33)
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    foreignKey({
      name: "servicio_sede_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
    check("servicio_sede_duracion_minutos_check", sql`${t.duracionMinutos} BETWEEN 5 AND 720`),
    check("servicio_sede_buffer_minutos_check", sql`${t.bufferMinutos} BETWEEN 0 AND 240`),
    primaryKey({ name: "servicio_sede_pkey", columns: [t.servicioId, t.sedeId] }),
    // Para la FK desde servicio_sede_recurso.
    unique("servicio_sede_servicio_id_sede_id_negocio_id_key").on(t.servicioId, t.sedeId, t.negocioId),
    foreignKey({
      name: "servicio_sede_servicio_id_negocio_id_fkey",
      columns: [t.servicioId, t.negocioId],
      foreignColumns: [servicio.id, servicio.negocioId],
    }),
    foreignKey({
      name: "servicio_sede_sede_id_negocio_id_fkey",
      columns: [t.sedeId, t.negocioId],
      foreignColumns: [sede.id, sede.negocioId],
    }),
  ],
);

/** Quién puede atender cada servicio en cada sede (RN-33). En el MVP: una fila con el consultorio. */
export const servicioSedeRecurso = pgTable(
  "servicio_sede_recurso",
  {
    negocioId: uuid("negocio_id").notNull(),
    servicioId: uuid("servicio_id").notNull(),
    sedeId: uuid("sede_id").notNull(),
    recursoId: uuid("recurso_id").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    // Directa: borrar el negocio la elimina en el primer nivel de la cascada (ARCH §18.1).
    foreignKey({
      name: "servicio_sede_recurso_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
    primaryKey({
      name: "servicio_sede_recurso_pkey",
      columns: [t.servicioId, t.sedeId, t.recursoId],
    }),
    foreignKey({
      name: "servicio_sede_recurso_servicio_id_sede_id_negocio_id_fkey",
      columns: [t.servicioId, t.sedeId, t.negocioId],
      foreignColumns: [servicioSede.servicioId, servicioSede.sedeId, servicioSede.negocioId],
    }).onDelete("cascade"),
    // El recurso pertenece a la sede.
    foreignKey({
      name: "servicio_sede_recurso_recurso_id_sede_id_fkey",
      columns: [t.recursoId, t.sedeId],
      foreignColumns: [recurso.id, recurso.sedeId],
    }),
    index("servicio_sede_recurso_recurso_idx").on(t.recursoId),
  ],
);

// ─── Horario y bloqueos (ARCH §9, §18.2; RN-07, D-19) ─────────────────────────

export const horarioSemanal = pgTable(
  "horario_semanal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    negocioId: uuid("negocio_id").notNull(),
    sedeId: uuid("sede_id").notNull(),
    recursoId: uuid("recurso_id"), // NULL = horario de la sede; si no, horario propio del empleado (D-19)
    diaSemana: smallint("dia_semana").notNull(), // ISO: 1 = lunes
    horaInicio: time("hora_inicio").notNull(), // hora LOCAL de la sede (ADR-12)
    horaFin: time("hora_fin").notNull(),
  },
  (t) => [
    foreignKey({
      name: "horario_semanal_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
    check("horario_semanal_dia_semana_check", sql`${t.diaSemana} BETWEEN 1 AND 7`),
    check("horario_semanal_check", sql`${t.horaFin} > ${t.horaInicio}`),
    foreignKey({
      name: "horario_semanal_sede_id_negocio_id_fkey",
      columns: [t.sedeId, t.negocioId],
      foreignColumns: [sede.id, sede.negocioId],
    }).onDelete("cascade"),
    foreignKey({
      name: "horario_semanal_recurso_id_sede_id_fkey",
      columns: [t.recursoId, t.sedeId],
      foreignColumns: [recurso.id, recurso.sedeId],
    }).onDelete("cascade"),
    index("horario_sede_idx").on(t.sedeId, t.diaSemana),
  ],
);

export const bloqueo = pgTable(
  "bloqueo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    negocioId: uuid("negocio_id").notNull(),
    sedeId: uuid("sede_id"), // NULL = todo el negocio (en el MVP: la sede principal)
    recursoId: uuid("recurso_id"), // NULL = toda la sede
    inicio: instante("inicio").notNull(),
    fin: instante("fin").notNull(),
    motivo: text("motivo"),
    creadoEn: instante("creado_en").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "bloqueo_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
    check("bloqueo_check", sql`${t.fin} > ${t.inicio}`),
    // Un bloqueo de recurso indica su sede.
    check("bloqueo_check1", sql`${t.recursoId} IS NULL OR ${t.sedeId} IS NOT NULL`),
    foreignKey({
      name: "bloqueo_sede_id_negocio_id_fkey",
      columns: [t.sedeId, t.negocioId],
      foreignColumns: [sede.id, sede.negocioId],
    }).onDelete("cascade"),
    foreignKey({
      name: "bloqueo_recurso_id_sede_id_fkey",
      columns: [t.recursoId, t.sedeId],
      foreignColumns: [recurso.id, recurso.sedeId],
    }).onDelete("cascade"),
  ],
);

// ─── Clientes (ARCH §12, §18.2; RN-18, RN-19, S-14) ───────────────────────────

export const cliente = pgTable(
  "cliente",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    negocioId: uuid("negocio_id").notNull(),
    nombre: text("nombre").notNull(),
    apellido: text("apellido").notNull(),
    telefonoE164: text("telefono_e164"), // RN-18.1
    correo: text("correo"), // RN-18.2
    notaInterna: text("nota_interna"), // sin información clínica (RN-24)
    anonimizadoEn: instante("anonimizado_en"), // S-14
    creadoEn: instante("creado_en").notNull().defaultNow(),
    actualizadoEn: instante("actualizado_en")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: "cliente_negocio_id_fkey",
      columns: [t.negocioId],
      foreignColumns: [negocio.id],
    }).onDelete("cascade"),
    // `\\+` en el código para que el SQL reciba `\+`: en una plantilla de JS, `\+` pierde la barra.
    check("cliente_telefono_e164_check", sql`${t.telefonoE164} ~ '^\\+[1-9][0-9]{6,14}$'`),
    check("cliente_correo_check", sql`${t.correo} = lower(${t.correo})`),
    unique("cliente_id_negocio_id_key").on(t.id, t.negocioId),
    unique("cliente_negocio_id_telefono_e164_key").on(t.negocioId, t.telefonoE164), // RN-19
    // Un cliente se identifica por teléfono o correo, salvo si está anonimizado (S-14).
    check(
      "cliente_check",
      sql`${t.anonimizadoEn} IS NOT NULL OR ${t.telefonoE164} IS NOT NULL OR ${t.correo} IS NOT NULL`,
    ),
    uniqueIndex("cliente_correo_uq").on(t.negocioId, t.correo).where(sql`${t.correo} IS NOT NULL`),
  ],
);
