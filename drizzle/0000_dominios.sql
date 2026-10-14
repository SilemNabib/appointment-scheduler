-- Migración manual (ARCH §8): dominios con las claves del catálogo de planes (ARCH §16.2).
-- Van antes que las tablas que los usan. Idénticos a ARCH §18.2; una prueba (T1.33)
-- verifica que coincidan con FUNCIONALIDADES y LIMITES de src/servidor/planes/catalogo.ts.

CREATE DOMAIN clave_funcionalidad AS text CHECK (VALUE IN (
  'online_payments', 'custom_booking_fields', 'multi_user',
  'resource_per_service', 'whatsapp_notifications', 'reports'));
--> statement-breakpoint
CREATE DOMAIN clave_limite AS text CHECK (VALUE IN (
  'max_resources', 'max_users', 'max_services',
  'max_appointments_per_month', 'max_emails_per_month', 'max_locations'));
