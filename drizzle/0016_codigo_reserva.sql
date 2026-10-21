-- Código de reserva (D-28; ARCH §11.4; Q-41). Generada por drizzle-kit y editada a mano
-- (ARCH §8): la columna se agrega sin NOT NULL, se rellenan las citas existentes y
-- después se fija NOT NULL, para que la migración funcione sobre una base con citas.
ALTER TABLE "cita" ADD COLUMN "codigo" text;--> statement-breakpoint
-- Relleno: el prefijo del nombre de su negocio, como prefijoCodigo (dominio/codigo-reserva.ts):
-- sin tildes, solo letras A-Z, las iniciales de las dos primeras palabras o las dos
-- primeras letras de la única, completadas con X, y XX sin letras. El número es
-- correlativo dentro del negocio, por orden de creación (Q-41), con 4 dígitos, o 6 a partir
-- de la cita 10 000. Las tildes se quitan en ambos casos antes de upper() para no depender
-- de la configuración regional de la base.
WITH palabras AS (
  SELECT id,
         regexp_split_to_array(
           btrim(regexp_replace(
             upper(translate(nombre,
               'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
               'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')),
             '[^A-Z]+', ' ', 'g')),
           ' ') AS p
    FROM negocio
), prefijos AS (
  SELECT id AS negocio_id,
         CASE
           WHEN p[1] = '' THEN 'XX'
           WHEN cardinality(p) = 1 THEN rpad(left(p[1], 2), 2, 'X')
           ELSE left(p[1], 1) || left(p[2], 1)
         END AS prefijo
    FROM palabras
), numeradas AS (
  SELECT c.id, pr.prefijo,
         row_number() OVER (PARTITION BY c.negocio_id ORDER BY c.creado_en, c.id) AS n
    FROM cita c
    JOIN prefijos pr ON pr.negocio_id = c.negocio_id
)
UPDATE cita
   SET codigo = numeradas.prefijo || '-' || lpad(numeradas.n::text, CASE WHEN numeradas.n < 10000 THEN 4 ELSE 6 END, '0')
  FROM numeradas
 WHERE cita.id = numeradas.id;--> statement-breakpoint
ALTER TABLE "cita" ALTER COLUMN "codigo" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_negocio_id_codigo_key" UNIQUE("negocio_id","codigo");--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_codigo_check" CHECK ("cita"."codigo" ~ '^[A-Z]{2}-[0-9]{4,6}$');
