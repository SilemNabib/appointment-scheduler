CREATE TYPE "public"."tipo_contacto" AS ENUM('whatsapp', 'telefono', 'correo');--> statement-breakpoint
CREATE TABLE "contacto_sede" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negocio_id" uuid NOT NULL,
	"sede_id" uuid NOT NULL,
	"tipo" "tipo_contacto" NOT NULL,
	"valor" text NOT NULL,
	"etiqueta" text,
	"orden" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "contacto_sede_etiqueta_check" CHECK (char_length("contacto_sede"."etiqueta") <= 40),
	CONSTRAINT "contacto_sede_check" CHECK ("contacto_sede"."tipo" = 'correo' OR "contacto_sede"."valor" ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "contacto_sede_check1" CHECK ("contacto_sede"."tipo" <> 'correo' OR "contacto_sede"."valor" = lower("contacto_sede"."valor"))
);
--> statement-breakpoint
ALTER TABLE "contacto_sede" ADD CONSTRAINT "contacto_sede_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacto_sede" ADD CONSTRAINT "contacto_sede_sede_id_negocio_id_fkey" FOREIGN KEY ("sede_id","negocio_id") REFERENCES "public"."sede"("id","negocio_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacto_sede_idx" ON "contacto_sede" USING btree ("sede_id","orden");