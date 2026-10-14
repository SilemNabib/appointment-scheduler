CREATE TABLE "cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negocio_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"telefono_e164" text,
	"correo" text,
	"nota_interna" text,
	"anonimizado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cliente_id_negocio_id_key" UNIQUE("id","negocio_id"),
	CONSTRAINT "cliente_negocio_id_telefono_e164_key" UNIQUE("negocio_id","telefono_e164"),
	CONSTRAINT "cliente_telefono_e164_check" CHECK ("cliente"."telefono_e164" ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "cliente_correo_check" CHECK ("cliente"."correo" = lower("cliente"."correo")),
	CONSTRAINT "cliente_check" CHECK ("cliente"."anonimizado_en" IS NOT NULL OR "cliente"."telefono_e164" IS NOT NULL OR "cliente"."correo" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cliente_correo_uq" ON "cliente" USING btree ("negocio_id","correo") WHERE "cliente"."correo" IS NOT NULL;