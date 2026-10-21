-- Migración manual (ARCH §8; Q-40): copia cada sede.telefono no vacío como el primer
-- contacto `telefono` de su sede (D-29). La columna sede.telefono no cambia y no se borra
-- en esta fase (migraciones compatibles hacia atrás); desde la v0.12 deja de leerse y
-- escribirse.
--
-- sede.telefono era texto libre, y contacto_sede guarda E.164 (contacto_sede_check). La
-- normalización imita a normalizarTelefono (dominio/identidad-cliente.ts) en los casos
-- que llegan del alta y del panel: se quitan espacios, guiones, puntos y paréntesis, y un
-- número sin "+" se toma como colombiano (+57). Un valor que aun así no cumple el CHECK
-- no se copia, para que la migración no falle; el dueño lo vuelve a escribir en el panel.

INSERT INTO contacto_sede (negocio_id, sede_id, tipo, valor, orden)
SELECT negocio_id, id, 'telefono', valor, 0
  FROM (
    SELECT negocio_id, id,
           CASE WHEN btrim(telefono) LIKE '+%' THEN '+' ELSE '+57' END
             || regexp_replace(telefono, '[^0-9]', '', 'g') AS valor
      FROM sede
     WHERE btrim(coalesce(telefono, '')) <> ''
  ) AS normalizado
 WHERE valor ~ '^\+[1-9][0-9]{6,14}$';
