-- Migración manual (ARCH §8): índices que Drizzle 0.45 no expresa. Su constructor de
-- índices no tiene INCLUDE ni NULLS NOT DISTINCT. Como no están en el snapshot,
-- `drizzle-kit generate` no intenta borrarlos. Idénticos a ARCH §18.2.

-- Ocupación de un recurso (D-06): toda cita no cancelada ocupa capacidad. La consulta
-- de la reserva (ARCH §11.2) lee ocupado_hasta del propio índice.
CREATE INDEX cita_ocupacion_idx ON cita (recurso_id, inicio) INCLUDE (ocupado_hasta) WHERE estado <> 'cancelada';
--> statement-breakpoint
-- Un solo enlace vigente por alcance (negocio, sede, empleado) (RN-35). NULLS NOT DISTINCT:
-- dos enlaces de todo el negocio (sede y recurso en NULL) también chocan.
CREATE UNIQUE INDEX enlace_calendario_vigente_uq ON enlace_calendario (negocio_id, sede_id, recurso_id)
  NULLS NOT DISTINCT WHERE revocado_en IS NULL;
