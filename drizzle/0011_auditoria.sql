CREATE TABLE "auditoria_admin" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_admin_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"negocio_id" uuid,
	"tabla" text NOT NULL,
	"operacion" text NOT NULL,
	"actor" text NOT NULL,
	"antes" jsonb,
	"despues" jsonb,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
