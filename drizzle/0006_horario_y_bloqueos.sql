CREATE TABLE "bloqueo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negocio_id" uuid NOT NULL,
	"sede_id" uuid,
	"recurso_id" uuid,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bloqueo_check" CHECK ("bloqueo"."fin" > "bloqueo"."inicio"),
	CONSTRAINT "bloqueo_check1" CHECK ("bloqueo"."recurso_id" IS NULL OR "bloqueo"."sede_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "horario_semanal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negocio_id" uuid NOT NULL,
	"sede_id" uuid NOT NULL,
	"recurso_id" uuid,
	"dia_semana" smallint NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fin" time NOT NULL,
	CONSTRAINT "horario_semanal_dia_semana_check" CHECK ("horario_semanal"."dia_semana" BETWEEN 1 AND 7),
	CONSTRAINT "horario_semanal_check" CHECK ("horario_semanal"."hora_fin" > "horario_semanal"."hora_inicio")
);
--> statement-breakpoint
ALTER TABLE "bloqueo" ADD CONSTRAINT "bloqueo_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueo" ADD CONSTRAINT "bloqueo_sede_id_negocio_id_fkey" FOREIGN KEY ("sede_id","negocio_id") REFERENCES "public"."sede"("id","negocio_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueo" ADD CONSTRAINT "bloqueo_recurso_id_sede_id_fkey" FOREIGN KEY ("recurso_id","sede_id") REFERENCES "public"."recurso"("id","sede_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horario_semanal" ADD CONSTRAINT "horario_semanal_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horario_semanal" ADD CONSTRAINT "horario_semanal_sede_id_negocio_id_fkey" FOREIGN KEY ("sede_id","negocio_id") REFERENCES "public"."sede"("id","negocio_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horario_semanal" ADD CONSTRAINT "horario_semanal_recurso_id_sede_id_fkey" FOREIGN KEY ("recurso_id","sede_id") REFERENCES "public"."recurso"("id","sede_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "horario_sede_idx" ON "horario_semanal" USING btree ("sede_id","dia_semana");