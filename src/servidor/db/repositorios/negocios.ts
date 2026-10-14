import "server-only";
import { asc, eq } from "drizzle-orm";
import type { DatosSuscripcion } from "@/dominio/suscripcion";
import { db, type Transaccion } from "../cliente";
import {
  configuracionNegocio,
  miembroNegocio,
  negocio,
  politicaDatos,
  recurso,
  sede,
} from "../esquema";

// Negocios. Toda función recibe `negocioId` como primer parámetro y lo usa en el
// WHERE (ARCH §6, defensa 1). Al crear, el id se genera antes, en el caso de uso.

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

export type FilaNegocioAdmin = DatosSuscripcion & {
  id: string;
  slug: string;
  nombre: string;
  planId: string;
  zonaHoraria: string;
};

/**
 * Todos los negocios, para la lista del admin (ADM-01). Es la única lectura que cruza
 * negocios y por eso no recibe `negocioId`: el admin no pertenece a ninguno (ARCH §6,
 * "Admin: explícito"). Solo se llama detrás de `requireSuperadmin`.
 */
export async function listarParaAdmin(): Promise<FilaNegocioAdmin[]> {
  return db()
    .select({
      id: negocio.id,
      slug: negocio.slug,
      nombre: negocio.nombre,
      planId: negocio.planId,
      zonaHoraria: negocio.zonaHoraria,
      estadoSuscripcion: negocio.estadoSuscripcion,
      finPrueba: negocio.finPrueba,
      pagadoHasta: negocio.pagadoHasta,
    })
    .from(negocio)
    .orderBy(asc(negocio.nombre), asc(negocio.slug));
}

export type DatosNuevoNegocio = {
  slug: string;
  nombre: string;
  planId: string;
  estadoSuscripcion: "prueba" | "activa";
  /** Fin de prueba o pagado hasta, según el estado, ya convertido al instante que se guarda. */
  vence: Date;
  correoDueno: string;
  sede: { direccion: string | null; telefono: string | null };
  politica: string;
};

export const NOMBRE_SEDE_PRINCIPAL = "Sede principal";
export const NOMBRE_RECURSO_INICIAL = "Consultorio";

/**
 * Crea, dentro de la transacción del alta, las seis filas de ARCH §18.4: el negocio,
 * su configuración con los valores por defecto de D-09, la "Sede principal", el
 * recurso "Consultorio" (capacidad 1) en esa sede, la política v1 y el miembro
 * pendiente (sin usuario de Clerk, ARCH §7.4).
 */
export async function crear(negocioId: string, datos: DatosNuevoNegocio, tx: Transaccion): Promise<void> {
  await tx.insert(negocio).values({
    id: negocioId,
    slug: datos.slug,
    nombre: datos.nombre,
    planId: datos.planId,
    estadoSuscripcion: datos.estadoSuscripcion,
    finPrueba: datos.estadoSuscripcion === "prueba" ? datos.vence : null,
    pagadoHasta: datos.estadoSuscripcion === "activa" ? datos.vence : null,
    correoContacto: null, // Q-11: se decide antes de la Fase 6
  });

  await tx.insert(configuracionNegocio).values({ negocioId }); // D-09: los DEFAULT de la tabla

  const [{ sedeId }] = await tx
    .insert(sede)
    .values({
      negocioId,
      nombre: NOMBRE_SEDE_PRINCIPAL,
      direccion: datos.sede.direccion,
      telefono: datos.sede.telefono,
    })
    .returning({ sedeId: sede.id });

  await tx.insert(recurso).values({
    negocioId,
    sedeId,
    nombre: NOMBRE_RECURSO_INICIAL,
    tipo: "consultorio",
    capacidad: 1,
  });

  await tx.insert(politicaDatos).values({ negocioId, version: 1, contenido: datos.politica });

  await tx.insert(miembroNegocio).values({ negocioId, correo: datos.correoDueno, rol: "dueno" });
}
