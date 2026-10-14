CREATE TABLE "recurso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negocio_id" uuid NOT NULL,
	"sede_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_recurso" DEFAULT 'consultorio' NOT NULL,
	"capacidad" smallint DEFAULT 1 NOT NULL,
	"foto_url" text,
	"descripcion" text,
	"correo" text,
	"orden" smallint DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurso_id_negocio_id_key" UNIQUE("id","negocio_id"),
	CONSTRAINT "recurso_id_sede_id_key" UNIQUE("id","sede_id"),
	CONSTRAINT "recurso_capacidad_check" CHECK ("recurso"."capacidad" >= 1),
	CONSTRAINT "recurso_correo_check" CHECK ("recurso"."correo" = lower("recurso"."correo")),
	CONSTRAINT "recurso_check" CHECK ("recurso"."tipo" <> 'profesional' OR "recurso"."capacidad" = 1)
);
--> statement-breakpoint
CREATE TABLE "sede" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negocio_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text,
	"telefono" text,
	"activa" boolean DEFAULT true NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sede_id_negocio_id_key" UNIQUE("id","negocio_id"),
	CONSTRAINT "sede_negocio_id_nombre_key" UNIQUE("negocio_id","nombre")
);
--> statement-breakpoint
ALTER TABLE "recurso" ADD CONSTRAINT "recurso_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurso" ADD CONSTRAINT "recurso_sede_id_negocio_id_fkey" FOREIGN KEY ("sede_id","negocio_id") REFERENCES "public"."sede"("id","negocio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sede" ADD CONSTRAINT "sede_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;