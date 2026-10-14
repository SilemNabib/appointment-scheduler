CREATE TYPE "public"."canal_notificacion" AS ENUM('correo', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."estado_cita" AS ENUM('pendiente_pago', 'confirmada', 'completada', 'cancelada', 'no_asistio');--> statement-breakpoint
CREATE TYPE "public"."estado_notificacion" AS ENUM('pendiente', 'enviando', 'enviada', 'fallida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."estado_suscripcion" AS ENUM('prueba', 'activa', 'suspendida');--> statement-breakpoint
CREATE TYPE "public"."origen_cita" AS ENUM('publico', 'panel');--> statement-breakpoint
CREATE TYPE "public"."rol_miembro" AS ENUM('dueno');--> statement-breakpoint
CREATE TYPE "public"."tipo_actor" AS ENUM('cliente', 'dueno', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."tipo_notificacion" AS ENUM('confirmacion', 'recordatorio', 'cancelacion', 'reprogramacion', 'dueno_cita_nueva', 'dueno_cambio', 'dueno_gracia', 'dueno_suspension', 'empleado_cita_nueva', 'empleado_cambio');--> statement-breakpoint
CREATE TYPE "public"."tipo_recurso" AS ENUM('consultorio', 'profesional');--> statement-breakpoint
CREATE TABLE "plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "plan_codigo_key" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "plan_funcionalidad" (
	"plan_id" uuid NOT NULL,
	"funcionalidad" "clave_funcionalidad" NOT NULL,
	"habilitada" boolean NOT NULL,
	CONSTRAINT "plan_funcionalidad_pkey" PRIMARY KEY("plan_id","funcionalidad")
);
--> statement-breakpoint
CREATE TABLE "plan_limite" (
	"plan_id" uuid NOT NULL,
	"limite" "clave_limite" NOT NULL,
	"valor" integer,
	CONSTRAINT "plan_limite_pkey" PRIMARY KEY("plan_id","limite"),
	CONSTRAINT "plan_limite_valor_check" CHECK ("plan_limite"."valor" IS NULL OR "plan_limite"."valor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "plan_funcionalidad" ADD CONSTRAINT "plan_funcionalidad_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_limite" ADD CONSTRAINT "plan_limite_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;