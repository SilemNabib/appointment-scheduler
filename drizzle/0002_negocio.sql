CREATE TABLE "negocio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"logo_url" text,
	"color_primario" text DEFAULT '#0f766e' NOT NULL,
	"color_secundario" text,
	"correo_contacto" text,
	"zona_horaria" text DEFAULT 'America/Bogota' NOT NULL,
	"plan_id" uuid NOT NULL,
	"estado_suscripcion" "estado_suscripcion" DEFAULT 'prueba' NOT NULL,
	"fin_prueba" timestamp with time zone,
	"pagado_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "negocio_slug_key" UNIQUE("slug"),
	CONSTRAINT "negocio_slug_check" CHECK ("negocio"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("negocio"."slug") BETWEEN 3 AND 40),
	CONSTRAINT "negocio_color_primario_check" CHECK ("negocio"."color_primario" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "negocio_color_secundario_check" CHECK ("negocio"."color_secundario" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "negocio_check" CHECK ("negocio"."estado_suscripcion" <> 'prueba' OR "negocio"."fin_prueba" IS NOT NULL),
	CONSTRAINT "negocio_check1" CHECK ("negocio"."estado_suscripcion" <> 'activa' OR "negocio"."pagado_hasta" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "negocio_funcionalidad" (
	"negocio_id" uuid NOT NULL,
	"funcionalidad" "clave_funcionalidad" NOT NULL,
	"habilitada" boolean NOT NULL,
	CONSTRAINT "negocio_funcionalidad_pkey" PRIMARY KEY("negocio_id","funcionalidad")
);
--> statement-breakpoint
CREATE TABLE "negocio_limite" (
	"negocio_id" uuid NOT NULL,
	"limite" "clave_limite" NOT NULL,
	"valor" integer,
	CONSTRAINT "negocio_limite_pkey" PRIMARY KEY("negocio_id","limite"),
	CONSTRAINT "negocio_limite_valor_check" CHECK ("negocio_limite"."valor" IS NULL OR "negocio_limite"."valor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "negocio" ADD CONSTRAINT "negocio_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negocio_funcionalidad" ADD CONSTRAINT "negocio_funcionalidad_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negocio_limite" ADD CONSTRAINT "negocio_limite_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocio"("id") ON DELETE cascade ON UPDATE no action;