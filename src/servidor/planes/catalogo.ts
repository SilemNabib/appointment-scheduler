import "server-only";

// Catálogo de funcionalidades y límites: la fuente de verdad (ARCH §16.2, PRD §8.8).
// Los dominios `clave_funcionalidad` y `clave_limite` de la base de datos replican
// estas claves (drizzle/0000_dominios.sql); una prueba falla si difieren (T1.33).
// `porDefecto` es el valor cuando no hay excepción del negocio ni fila del plan (§16.3).

export const FUNCIONALIDADES = {
  online_payments:        { modulo: "Cobro en línea",                 porDefecto: false },
  custom_booking_fields:  { modulo: "Formularios extra por servicio", porDefecto: false },
  multi_user:             { modulo: "Varios usuarios y permisos",     porDefecto: false },
  resource_per_service:   { modulo: "Profesionales por servicio",     porDefecto: false },
  whatsapp_notifications: { modulo: "WhatsApp",                       porDefecto: false },
  reports:                { modulo: "Reportes",                       porDefecto: false },
} as const;

export const LIMITES = {
  max_resources:              { descripcion: "Recursos o profesionales", porDefecto: 0 },
  max_users:                  { descripcion: "Miembros del negocio",     porDefecto: 0 },
  max_services:               { descripcion: "Servicios activos",        porDefecto: 0 },
  max_appointments_per_month: { descripcion: "Citas por mes",            porDefecto: 0 },
  max_emails_per_month:       { descripcion: "Correos por mes",          porDefecto: 0 },
  max_locations:              { descripcion: "Sedes activas",            porDefecto: 1 }, // 1: todo negocio tiene al menos una sede (D-16)
} as const;

export type Funcionalidad = keyof typeof FUNCIONALIDADES;
export type Limite = keyof typeof LIMITES;

/** Claves del catálogo, en su orden. */
export const CLAVES_FUNCIONALIDADES = Object.keys(FUNCIONALIDADES) as Funcionalidad[];
export const CLAVES_LIMITES = Object.keys(LIMITES) as Limite[];
