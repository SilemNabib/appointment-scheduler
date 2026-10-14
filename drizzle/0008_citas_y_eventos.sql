CREATE TABLE "cita" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"negocio_id" uuid NOT NULL,
	"sede_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"recurso_id" uuid NOT NULL,
	"recurso_elegido" boolean DEFAULT false NOT NULL,
	"cliente_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"ocupado_hasta" timestamp with time zone NOT NULL,
	"estado" "estado_cita" DEFAULT 'confirmada' NOT NULL,
	"origen" "origen_cita" NOT NULL,
	"servicio_nombre" text NOT NULL,
	"cliente_nombre" text NOT NULL,
	"cliente_apellido" text NOT NULL,
	"cliente_telefono" text,
	"cliente_correo" text,
	"politica_datos_id" uuid,
	"politica_aceptada_en" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"token_version" smallint DEFAULT 1 NOT NULL,
	"reprogramaciones_cliente" smallint DEFAULT 0 NOT NULL,
	"cancelada_en" timestamp with time zone,
	"cancelada_por" "tipo_actor",
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cita_id_negocio_id_key" UNIQUE("id","negocio_id"),
	CONSTRAINT "cita_reprogramaciones_cliente_check" CHECK ("cita"."reprogramaciones_cliente" >= 0),
	CONSTRAINT "cita_check" CHECK ("cita"."inicio" < "cita"."fin" AND "cita"."fin" <= "cita"."ocupado_hasta"),
	CONSTRAINT "cita_check1" CHECK (("cita"."estado" = 'cancelada') = ("cita"."cancelada_en" IS NOT NULL)),
	CONSTRAINT "cita_check2" CHECK (("cita"."estado" = 'cancelada') = ("cita"."cancelada_por" IS NOT NULL)),
	CONSTRAINT "cita_check3" CHECK ("cita"."origen" = 'panel' OR ("cita"."politica_datos_id" IS NOT NULL AND "cita"."politica_aceptada_en" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "evento_cita" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "evento_cita_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"negocio_id" uuid NOT NULL,
	"cita_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"actor" "tipo_actor" NOT NULL,
	"actor_id" text,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evento_cita_tipo_check" CHECK ("evento_cita"."tipo" IN ('creada', 'reprogramada', 'cancelada', 'completada', 'no_asistio', 'estado_corregido'))
);
--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_sede_id_negocio_id_fkey" FOREIGN KEY ("sede_id","negocio_id") REFERENCES "public"."sede"("id","negocio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_servicio_id_negocio_id_fkey" FOREIGN KEY ("servicio_id","negocio_id") REFERENCES "public"."servicio"("id","negocio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_servicio_id_sede_id_fkey" FOREIGN KEY ("servicio_id","sede_id") REFERENCES "public"."servicio_sede"("servicio_id","sede_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_recurso_id_sede_id_fkey" FOREIGN KEY ("recurso_id","sede_id") REFERENCES "public"."recurso"("id","sede_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_cliente_id_negocio_id_fkey" FOREIGN KEY ("cliente_id","negocio_id") REFERENCES "public"."cliente"("id","negocio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_politica_datos_id_negocio_id_fkey" FOREIGN KEY ("politica_datos_id","negocio_id") REFERENCES "public"."politica_datos"("id","negocio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_cita" ADD CONSTRAINT "evento_cita_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_cita" ADD CONSTRAINT "evento_cita_cita_id_negocio_id_fkey" FOREIGN KEY ("cita_id","negocio_id") REFERENCES "public"."cita"("id","negocio_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cita_agenda_idx" ON "cita" USING btree ("negocio_id","inicio");--> statement-breakpoint
CREATE INDEX "cita_sede_idx" ON "cita" USING btree ("sede_id","inicio");--> statement-breakpoint
CREATE INDEX "cita_cliente_idx" ON "cita" USING btree ("cliente_id","inicio" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "evento_cita_idx" ON "evento_cita" USING btree ("cita_id","creado_en");