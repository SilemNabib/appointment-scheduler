-- Migración manual (ARCH §8): auditoría con triggers de los cambios de plan, de
-- suscripción y de excepciones (RN-30, ADR-11, ARCH §16.4). Los triggers cubren también
-- los cambios hechos con SQL directo. Idéntica a ARCH §18.2.
--
-- Autor: la herramienta interna hace `SELECT set_config('app.actor', '<clerk_user_id>', true)`
-- dentro de su transacción. Sin `app.actor`, el autor es el rol de la base de datos.

CREATE FUNCTION auditar_cambio() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_antes   jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_despues jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_fila    jsonb := coalesce(v_despues, v_antes);
BEGIN
  INSERT INTO auditoria_admin (negocio_id, tabla, operacion, actor, antes, despues)
  VALUES (
    CASE WHEN TG_TABLE_NAME = 'negocio' THEN v_fila ->> 'id' ELSE v_fila ->> 'negocio_id' END::uuid,
    TG_TABLE_NAME, TG_OP,
    coalesce(nullif(current_setting('app.actor', true), ''), session_user),
    v_antes, v_despues);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER auditar_alta_negocio AFTER INSERT ON negocio
  FOR EACH ROW EXECUTE FUNCTION auditar_cambio();
--> statement-breakpoint
CREATE TRIGGER auditar_plan_negocio AFTER UPDATE OF plan_id, estado_suscripcion, fin_prueba, pagado_hasta ON negocio
  FOR EACH ROW
  WHEN (OLD.plan_id IS DISTINCT FROM NEW.plan_id
     OR OLD.estado_suscripcion IS DISTINCT FROM NEW.estado_suscripcion
     OR OLD.fin_prueba IS DISTINCT FROM NEW.fin_prueba
     OR OLD.pagado_hasta IS DISTINCT FROM NEW.pagado_hasta)
  EXECUTE FUNCTION auditar_cambio();
--> statement-breakpoint
CREATE TRIGGER auditar_negocio_funcionalidad AFTER INSERT OR UPDATE OR DELETE ON negocio_funcionalidad
  FOR EACH ROW EXECUTE FUNCTION auditar_cambio();
--> statement-breakpoint
CREATE TRIGGER auditar_negocio_limite AFTER INSERT OR UPDATE OR DELETE ON negocio_limite
  FOR EACH ROW EXECUTE FUNCTION auditar_cambio();
--> statement-breakpoint
CREATE TRIGGER auditar_plan_funcionalidad AFTER INSERT OR UPDATE OR DELETE ON plan_funcionalidad
  FOR EACH ROW EXECUTE FUNCTION auditar_cambio();
--> statement-breakpoint
CREATE TRIGGER auditar_plan_limite AFTER INSERT OR UPDATE OR DELETE ON plan_limite
  FOR EACH ROW EXECUTE FUNCTION auditar_cambio();
