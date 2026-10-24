import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db, type Conexion, type Transaccion } from "../cliente";
import { enlaceCalendario } from "../esquema";

// Enlaces de calendario del dueño (PAN-20; RN-35; ARCH §14.7 y §18.3). El token no se
// guarda: se deriva del id (servidor/calendario/firma.ts). En el MVP hay un enlace por
// negocio, sin sede ni recurso. El índice único parcial `enlace_calendario_vigente_uq`
// impide dos vigentes para el mismo alcance. Toda función recibe `negocioId` y lo usa en
// el WHERE (ARCH §6), salvo la que sirve el calendario, que parte del id del enlace.

/** El enlace vigente del negocio entero: sin sede, sin recurso y sin revocar. */
const vigenteDe = (negocioId: string) =>
  and(
    eq(enlaceCalendario.negocioId, negocioId),
    isNull(enlaceCalendario.sedeId),
    isNull(enlaceCalendario.recursoId),
    isNull(enlaceCalendario.revocadoEn),
  );

/** El id del enlace vigente del negocio, o `null`. */
export async function vigente(negocioId: string, conexion: Conexion = db()): Promise<string | null> {
  const [fila] = await conexion.select({ id: enlaceCalendario.id }).from(enlaceCalendario).where(vigenteDe(negocioId));
  return fila?.id ?? null;
}

/** Revoca el enlace vigente del negocio, si lo hay: su URL deja de servir (ARCH §14.7). */
export async function revocarVigente(negocioId: string, ahora: Date, tx: Transaccion): Promise<void> {
  await tx.update(enlaceCalendario).set({ revocadoEn: ahora }).where(vigenteDe(negocioId));
}

/** Crea el enlace del negocio, con el `clerk_user_id` de quien lo crea. Devuelve su id. */
export async function crear(negocioId: string, creadoPor: string, ahora: Date, tx: Transaccion): Promise<string> {
  const [{ id }] = await tx
    .insert(enlaceCalendario)
    .values({ negocioId, creadoPor, creadoEn: ahora })
    .returning({ id: enlaceCalendario.id });
  return id;
}

/** Lo que necesita servir el calendario (ARCH §14.7): el negocio del enlace y si sigue vigente. */
export async function paraServir(
  enlaceId: string,
  conexion: Conexion = db(),
): Promise<{ negocioId: string; revocado: boolean } | null> {
  const [fila] = await conexion
    .select({ negocioId: enlaceCalendario.negocioId, revocadoEn: enlaceCalendario.revocadoEn })
    .from(enlaceCalendario)
    .where(eq(enlaceCalendario.id, enlaceId));
  return fila ? { negocioId: fila.negocioId, revocado: fila.revocadoEn !== null } : null;
}

/** Anota el acceso, como máximo una vez por hora (ARCH §14.7). */
export async function anotarAcceso(enlaceId: string, ahora: Date, conexion: Conexion = db()): Promise<void> {
  const haceUnaHora = new Date(ahora.getTime() - 60 * 60 * 1000);
  await conexion
    .update(enlaceCalendario)
    .set({ ultimoAccesoEn: ahora })
    .where(
      and(
        eq(enlaceCalendario.id, enlaceId),
        or(isNull(enlaceCalendario.ultimoAccesoEn), lt(enlaceCalendario.ultimoAccesoEn, sql`${haceUnaHora.toISOString()}::timestamptz`)),
      ),
    );
}
