CREATE TABLE "configuracion_negocio" (
	"negocio_id" uuid PRIMARY KEY NOT NULL,
	"granularidad_minutos" smallint DEFAULT 30 NOT NULL,
	"anticipacion_minima_minutos" integer DEFAULT 120 NOT NULL,
	"anticipacion_maxima_dias" integer DEFAULT 60 NOT NULL,
	"plazo_cancelacion_horas" integer DEFAULT 24 NOT NULL,
	"recordatorio_horas_antes" integer DEFAULT 24,
	"max_reprogramaciones_cliente" smallint DEFAULT 3,
	"asistencia_por_defecto" text DEFAULT 'completada' NOT NULL,
	CONSTRAINT "configuracion_negocio_granularidad_minutos_check" CHECK ("configuracion_negocio"."granularidad_minutos" IN (15, 30, 60)),
	CONSTRAINT "configuracion_negocio_anticipacion_minima_minutos_check" CHECK ("configuracion_negocio"."anticipacion_minima_minutos" >= 0),
	CONSTRAINT "configuracion_negocio_anticipacion_maxima_dias_check" CHECK ("configuracion_negocio"."anticipacion_maxima_dias" BETWEEN 1 AND 365),
	CONSTRAINT "configuracion_negocio_plazo_cancelacion_horas_check" CHECK ("configuracion_negocio"."plazo_cancelacion_horas" >= 0),
	CONSTRAINT "configuracion_negocio_recordatorio_horas_antes_check" CHECK ("configuracion_negocio"."recordatorio_horas_antes" > 0),
	CONSTRAINT "configuracion_negocio_max_reprogramaciones_cliente_check" CHECK ("configuracion_negocio"."max_reprogramaciones_cliente" >= 0),
	CONSTRAINT "configuracion_negocio_asistencia_por_defecto_check" CHECK ("configuracion_negocio"."asistencia_por_defecto" IN ('completada', 'no_asistio', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "miembro_negocio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negocio_id" uuid NOT NULL,
	"correo" text NOT NULL,
	"clerk_user_id" text,
	"rol" "rol_miembro" DEFAULT 'dueno' NOT NULL,
	"vinculado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "miembro_negocio_correo_key" UNIQUE("correo"),
	CONSTRAINT "miembro_negocio_clerk_user_id_key" UNIQUE("clerk_user_id"),
	CONSTRAINT "miembro_negocio_correo_check" CHECK ("miembro_negocio"."correo" = lower("miembro_negocio"."correo"))
);
--> statement-breakpoint
CREATE TABLE "politica_datos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negocio_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"contenido" text NOT NULL,
	"publicada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "politica_datos_negocio_id_version_key" UNIQUE("negocio_id","version"),
	CONSTRAINT "politica_datos_id_negocio_id_key" UNIQUE("id","negocio_id"),
	CONSTRAINT "politica_datos_version_check" CHECK ("politica_datos"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "configuracion_negocio" ADD CONSTRAINT "configuracion_negocio_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "miembro_negocio" ADD CONSTRAINT "miembro_negocio_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "politica_datos" ADD CONSTRAINT "politica_datos_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;