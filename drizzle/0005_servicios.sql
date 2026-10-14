CREATE TABLE "servicio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negocio_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"duracion_minutos" smallint NOT NULL,
	"buffer_minutos" smallint DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servicio_id_negocio_id_key" UNIQUE("id","negocio_id"),
	CONSTRAINT "servicio_duracion_minutos_check" CHECK ("servicio"."duracion_minutos" BETWEEN 5 AND 720),
	CONSTRAINT "servicio_buffer_minutos_check" CHECK ("servicio"."buffer_minutos" BETWEEN 0 AND 240)
);
--> statement-breakpoint
CREATE TABLE "servicio_sede" (
	"negocio_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"sede_id" uuid NOT NULL,
	"duracion_minutos" smallint,
	"buffer_minutos" smallint,
	"cliente_elige" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "servicio_sede_pkey" PRIMARY KEY("servicio_id","sede_id"),
	CONSTRAINT "servicio_sede_servicio_id_sede_id_negocio_id_key" UNIQUE("servicio_id","sede_id","negocio_id"),
	CONSTRAINT "servicio_sede_duracion_minutos_check" CHECK ("servicio_sede"."duracion_minutos" BETWEEN 5 AND 720),
	CONSTRAINT "servicio_sede_buffer_minutos_check" CHECK ("servicio_sede"."buffer_minutos" BETWEEN 0 AND 240)
);
--> statement-breakpoint
CREATE TABLE "servicio_sede_recurso" (
	"negocio_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"sede_id" uuid NOT NULL,
	"recurso_id" uuid NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "servicio_sede_recurso_pkey" PRIMARY KEY("servicio_id","sede_id","recurso_id")
);
--> statement-breakpoint
ALTER TABLE "servicio" ADD CONSTRAINT "servicio_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicio_sede" ADD CONSTRAINT "servicio_sede_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicio_sede" ADD CONSTRAINT "servicio_sede_servicio_id_negocio_id_fkey" FOREIGN KEY ("servicio_id","negocio_id") REFERENCES "public"."servicio"("id","negocio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicio_sede" ADD CONSTRAINT "servicio_sede_sede_id_negocio_id_fkey" FOREIGN KEY ("sede_id","negocio_id") REFERENCES "public"."sede"("id","negocio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicio_sede_recurso" ADD CONSTRAINT "servicio_sede_recurso_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicio_sede_recurso" ADD CONSTRAINT "servicio_sede_recurso_servicio_id_sede_id_negocio_id_fkey" FOREIGN KEY ("servicio_id","sede_id","negocio_id") REFERENCES "public"."servicio_sede"("servicio_id","sede_id","negocio_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicio_sede_recurso" ADD CONSTRAINT "servicio_sede_recurso_recurso_id_sede_id_fkey" FOREIGN KEY ("recurso_id","sede_id") REFERENCES "public"."recurso"("id","sede_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "servicio_sede_recurso_recurso_idx" ON "servicio_sede_recurso" USING btree ("recurso_id");