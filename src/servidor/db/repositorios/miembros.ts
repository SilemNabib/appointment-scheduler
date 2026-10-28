import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../cliente";
import { miembroNegocio } from "../esquema";

// Miembros del negocio (ADR-05, ARCH §7.4). Son la puerta de entrada al negocio:
// se buscan por el usuario de Clerk o por el correo, antes de conocer el `negocioId`.

export type Miembro = {
  id: string;
  negocioId: string;
  rol: "dueno";
};

const columnas = {
  id: miembroNegocio.id,
  negocioId: miembroNegocio.negocioId,
  rol: miembroNegocio.rol,
};

/** Miembro ya vinculado al usuario de Clerk, o `null`. */
export async function porClerkId(clerkUserId: string): Promise<Miembro | null> {
  const [fila] = await db()
    .select(columnas)
    .from(miembroNegocio)
    .where(eq(miembroNegocio.clerkUserId, clerkUserId));
  return fila ?? null;
}

/**
 * El correo del dueño del negocio y si ya se vinculó (ARCH §7.4), o `null` si no hay un
 * negocio con ese id. Para el admin, que elige el negocio (ARCH §6).
 */
export async function duenoDelNegocio(negocioId: string): Promise<{ correo: string; vinculado: boolean } | null> {
  const [fila] = await db()
    .select({ correo: miembroNegocio.correo, vinculado: sql<boolean>`${miembroNegocio.clerkUserId} is not null` })
    .from(miembroNegocio)
    .where(and(eq(miembroNegocio.negocioId, negocioId), eq(miembroNegocio.rol, "dueno")));
  return fila ?? null;
}

/**
 * Vincula al miembro pendiente con ese correo en el primer ingreso (ARCH §7.4): fija
 * `clerk_user_id` y `vinculado_en` en una sola sentencia, solo si todavía no tiene
 * usuario. Devuelve `null` si no hay un miembro pendiente con ese correo, así un
 * miembro ya vinculado nunca cambia de usuario.
 *
 * El correo debe ser el principal y verificado del usuario; quien llama lo comprueba.
 */
export async function vincular(correo: string, clerkUserId: string): Promise<Miembro | null> {
  const [fila] = await db()
    .update(miembroNegocio)
    .set({ clerkUserId, vinculadoEn: sql`now()` })
    .where(and(eq(miembroNegocio.correo, correo.toLowerCase()), isNull(miembroNegocio.clerkUserId)))
    .returning(columnas);
  return fila ?? null;
}
