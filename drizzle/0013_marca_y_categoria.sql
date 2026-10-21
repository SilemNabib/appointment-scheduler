ALTER TABLE "negocio" ALTER COLUMN "color_primario" SET DEFAULT '#2b3fd6';--> statement-breakpoint
ALTER TABLE "negocio" ADD COLUMN "rubro" text;--> statement-breakpoint
ALTER TABLE "negocio" ADD COLUMN "eslogan" text;--> statement-breakpoint
ALTER TABLE "negocio" ADD COLUMN "frase_banner" text;--> statement-breakpoint
ALTER TABLE "negocio" ADD COLUMN "descripcion" text;--> statement-breakpoint
ALTER TABLE "servicio" ADD COLUMN "categoria" text;--> statement-breakpoint
ALTER TABLE "negocio" ADD CONSTRAINT "negocio_rubro_check" CHECK (char_length("negocio"."rubro") <= 60);--> statement-breakpoint
ALTER TABLE "negocio" ADD CONSTRAINT "negocio_eslogan_check" CHECK (char_length("negocio"."eslogan") <= 120);--> statement-breakpoint
ALTER TABLE "negocio" ADD CONSTRAINT "negocio_frase_banner_check" CHECK (char_length("negocio"."frase_banner") <= 120);--> statement-breakpoint
ALTER TABLE "negocio" ADD CONSTRAINT "negocio_descripcion_check" CHECK (char_length("negocio"."descripcion") <= 600);--> statement-breakpoint
ALTER TABLE "servicio" ADD CONSTRAINT "servicio_categoria_check" CHECK (char_length("servicio"."categoria") BETWEEN 1 AND 40);