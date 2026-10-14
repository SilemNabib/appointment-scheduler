import "server-only";
import { eq } from "drizzle-orm";
import type { DatosSuscripcion } from "@/dominio/suscripcion";
import { db } from "../cliente";
import { negocio } from "../esquema";

// Negocios. Toda función recibe `negocioId` como primer parámetro y lo usa en el
// WHERE (ARCH §6, defensa 1).

/** Columnas de la suscripción, para calcular el estado efectivo (ARCH §7.6). */
export async function suscripcion(negocioId: string): Promise<DatosSuscripcion | null> {
  const [fila] = await db()
    .select({
      estadoSuscripcion: negocio.estadoSuscripcion,
      finPrueba: negocio.finPrueba,
      pagadoHasta: negocio.pagadoHasta,
    })
    .from(negocio)
    .where(eq(negocio.id, negocioId));
  return fila ?? null;
}

/** Nombre y slug, para el encabezado del panel. */
export async function resumen(negocioId: string): Promise<{ nombre: string; slug: string } | null> {
  const [fila] = await db()
    .select({ nombre: negocio.nombre, slug: negocio.slug })
    .from(negocio)
    .where(eq(negocio.id, negocioId));
  return fila ?? null;
}
