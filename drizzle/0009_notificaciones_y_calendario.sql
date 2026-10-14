CREATE TABLE "enlace_calendario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negocio_id" uuid NOT NULL,
	"sede_id" uuid,
	"recurso_id" uuid,
	"creado_por" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"revocado_en" timestamp with time zone,
	"ultimo_acceso_en" timestamp with time zone,
	CONSTRAINT "enlace_calendario_check" CHECK ("enlace_calendario"."recurso_id" IS NULL OR "enlace_calendario"."sede_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "notificacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negocio_id" uuid NOT NULL,
	"cita_id" uuid,
	"tipo" "tipo_notificacion" NOT NULL,
	"canal" "canal_notificacion" DEFAULT 'correo' NOT NULL,
	"destinatario" text NOT NULL,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"clave_idempotencia" text NOT NULL,
	"programada_para" timestamp with time zone DEFAULT now() NOT NULL,
	"estado" "estado_notificacion" DEFAULT 'pendiente' NOT NULL,
	"intentos" smallint DEFAULT 0 NOT NULL,
	"bloqueada_hasta" timestamp with time zone,
	"proveedor_mensaje_id" text,
	"ultimo_error" text,
	"enviada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notificacion_clave_idempotencia_key" UNIQUE("clave_idempotencia"),
	CONSTRAINT "notificacion_check" CHECK (("notificacion"."estado" = 'enviada') = ("notificacion"."enviada_en" IS NOT NULL)),
	CONSTRAINT "notificacion_check1" CHECK (("notificacion"."tipo" IN ('dueno_gracia', 'dueno_suspension')) = ("notificacion"."cita_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "enlace_calendario" ADD CONSTRAINT "enlace_calendario_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enlace_calendario" ADD CONSTRAINT "enlace_calendario_sede_id_negocio_id_fkey" FOREIGN KEY ("sede_id","negocio_id") REFERENCES "public"."sede"("id","negocio_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enlace_calendario" ADD CONSTRAINT "enlace_calendario_recurso_id_sede_id_fkey" FOREIGN KEY ("recurso_id","sede_id") REFERENCES "public"."recurso"("id","sede_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_cita_id_negocio_id_fkey" FOREIGN KEY ("cita_id","negocio_id") REFERENCES "public"."cita"("id","negocio_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notificacion_cola_idx" ON "notificacion" USING btree ("programada_para") WHERE "notificacion"."estado" IN ('pendiente', 'enviando');--> statement-breakpoint
CREATE INDEX "notificacion_cita_idx" ON "notificacion" USING btree ("cita_id");