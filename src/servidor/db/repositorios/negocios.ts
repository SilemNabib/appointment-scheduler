import "server-only";
import { and, asc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { DatosSuscripcion } from "@/dominio/suscripcion";
import { db, type Transaccion } from "../cliente";
import {
  configuracionNegocio,
  miembroNegocio,
  negocio,
  notificacion,
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

export type NegocioPublico = DatosSuscripcion & {
  id: string;
  /** Para el prefijo del código de reserva (D-28). */
  nombre: string;
  zonaHoraria: string;
};

/**
 * El negocio de la página y la API públicas, por su slug (ARCH §6: el slug de la URL
 * resuelve el `negocioId`), con lo necesario para su estado efectivo (ARCH §7.6). Es
 * la puerta de entrada al negocio y por eso no recibe `negocioId`. `null` si no existe.
 */
export async function porSlug(slug: string): Promise<NegocioPublico | null> {
  const [fila] = await db()
    .select({
      id: negocio.id,
      nombre: negocio.nombre,
      zonaHoraria: negocio.zonaHoraria,
      estadoSuscripcion: negocio.estadoSuscripcion,
      finPrueba: negocio.finPrueba,
      pagadoHasta: negocio.pagadoHasta,
    })
    .from(negocio)
    .where(eq(negocio.slug, slug));
  return fila ?? null;
}

/**
 * Toma la fila del negocio hasta el fin de la transacción, para que dos operaciones
 * que cuentan y luego crean (como el cupo de un límite del plan) no se crucen.
 * `NO KEY UPDATE` no bloquea las filas nuevas que referencian al negocio por FK.
 * Devuelve si el negocio existe.
 */
export async function bloquear(negocioId: string, tx: Transaccion): Promise<boolean> {
  const filas = await tx.select({ id: negocio.id }).from(negocio).where(eq(negocio.id, negocioId)).for("no key update");
  return filas.length > 0;
}

export type ResumenNegocio = { nombre: string; slug: string; zonaHoraria: string };

/** Nombre, slug y zona horaria, para el encabezado y los avisos del panel. */
export async function resumen(negocioId: string): Promise<ResumenNegocio | null> {
  const [fila] = await db()
    .select({ nombre: negocio.nombre, slug: negocio.slug, zonaHoraria: negocio.zonaHoraria })
    .from(negocio)
    .where(eq(negocio.id, negocioId));
  return fila ?? null;
}

export type MarcaNegocio = {
  nombre: string;
  colorPrimario: string;
  colorSecundario: string | null;
};

/** Nombre, logo y colores, para la configuración del negocio (PAN-11). */
export async function marca(negocioId: string): Promise<(MarcaNegocio & { logoUrl: string | null }) | null> {
  const [fila] = await db()
    .select({
      nombre: negocio.nombre,
      logoUrl: negocio.logoUrl,
      colorPrimario: negocio.colorPrimario,
      colorSecundario: negocio.colorSecundario,
    })
    .from(negocio)
    .where(eq(negocio.id, negocioId));
  return fila ?? null;
}

/** Cambia el nombre y los colores (PAN-11). Devuelve si el negocio existe. */
export async function actualizarMarca(negocioId: string, datos: MarcaNegocio, tx: Transaccion): Promise<boolean> {
  const filas = await tx
    .update(negocio)
    .set(datos)
    .where(eq(negocio.id, negocioId))
    .returning({ id: negocio.id });
  return filas.length > 0;
}

/**
 * Cambia `logo_url` (una ruta de `/api/media/…` o `NULL`) y devuelve la anterior, o
 * `null` si el negocio no existe. La fila queda tomada hasta el fin de la transacción,
 * así dos cambios simultáneos no se quedan con la misma anterior (Q-21).
 */
export async function reemplazarLogo(
  negocioId: string,
  logoUrl: string | null,
  tx: Transaccion,
): Promise<{ anterior: string | null } | null> {
  const [actual] = await tx
    .select({ logoUrl: negocio.logoUrl })
    .from(negocio)
    .where(eq(negocio.id, negocioId))
    .for("update");
  if (!actual) return null;
  await tx.update(negocio).set({ logoUrl }).where(eq(negocio.id, negocioId));
  return { anterior: actual.logoUrl };
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
const columnasAdmin = {
  id: negocio.id,
  slug: negocio.slug,
  nombre: negocio.nombre,
  planId: negocio.planId,
  zonaHoraria: negocio.zonaHoraria,
  estadoSuscripcion: negocio.estadoSuscripcion,
  finPrueba: negocio.finPrueba,
  pagadoHasta: negocio.pagadoHasta,
};

export async function listarParaAdmin(): Promise<FilaNegocioAdmin[]> {
  return db().select(columnasAdmin).from(negocio).orderBy(asc(negocio.nombre), asc(negocio.slug));
}

/** Un negocio, para el detalle del admin (ADM-03). El admin elige el negocio (ARCH §6). */
export async function detalleParaAdmin(negocioId: string): Promise<FilaNegocioAdmin | null> {
  const [fila] = await db().select(columnasAdmin).from(negocio).where(eq(negocio.id, negocioId));
  return fila ?? null;
}

// ─── Suscripción desde el admin (ADM-03; ARCH §7.6 y §18.4) ──────────────────
// Solo se llaman detrás de `requireSuperadmin`. Van dentro de una transacción con
// `app.actor` = el admin, para que los triggers los auditen con su autor (RN-30).

/** La suscripción y la zona del negocio, para las acciones del admin. */
export async function suscripcionParaAdmin(
  negocioId: string,
): Promise<(DatosSuscripcion & { zonaHoraria: string }) | null> {
  const [fila] = await db()
    .select({
      zonaHoraria: negocio.zonaHoraria,
      estadoSuscripcion: negocio.estadoSuscripcion,
      finPrueba: negocio.finPrueba,
      pagadoHasta: negocio.pagadoHasta,
    })
    .from(negocio)
    .where(eq(negocio.id, negocioId));
  return fila ?? null;
}

/**
 * Registra un pago en una sola sentencia: `estado_suscripcion = 'activa'` y el nuevo
 * `pagado_hasta`, solo si supera el actual (RN-31; ARCH §7.6). Devuelve si cambió.
 */
export async function registrarPago(negocioId: string, pagadoHasta: Date, tx: Transaccion): Promise<boolean> {
  const filas = await tx
    .update(negocio)
    .set({ estadoSuscripcion: "activa", pagadoHasta })
    .where(and(eq(negocio.id, negocioId), or(isNull(negocio.pagadoHasta), lt(negocio.pagadoHasta, pagadoHasta))))
    .returning({ id: negocio.id });
  return filas.length > 0;
}

/**
 * Suspende el negocio y, en la misma transacción, encola C-08 (`dueno_suspension`, sin
 * cita) para cada dueño, con la clave de ARCH §14.1. Solo si no estaba suspendido: así
 * no se crea otro aviso. Devuelve si lo suspendió. El envío llega en la Fase 6.
 */
export async function suspender(negocioId: string, tx: Transaccion): Promise<boolean> {
  const filas = await tx
    .update(negocio)
    .set({ estadoSuscripcion: "suspendida" })
    .where(and(eq(negocio.id, negocioId), ne(negocio.estadoSuscripcion, "suspendida")))
    .returning({ id: negocio.id });
  if (filas.length === 0) return false;

  // Igual que la suspensión del cron (ARCH §7.6): una fila por dueño.
  await tx.execute(sql`
    INSERT INTO ${notificacion} (negocio_id, tipo, destinatario, clave_idempotencia)
    SELECT m.negocio_id, 'dueno_suspension', m.correo,
           'dueno_suspension:' || m.id || ':' || extract(epoch FROM now())::bigint
      FROM ${miembroNegocio} m
     WHERE m.negocio_id = ${negocioId} AND m.rol = 'dueno'`);
  return true;
}

/** Cambia `fin_prueba`, solo con el negocio en `prueba` (Q-25). Devuelve si lo cambió. */
export async function cambiarFinPrueba(negocioId: string, finPrueba: Date, tx: Transaccion): Promise<boolean> {
  const filas = await tx
    .update(negocio)
    .set({ finPrueba })
    .where(and(eq(negocio.id, negocioId), eq(negocio.estadoSuscripcion, "prueba")))
    .returning({ id: negocio.id });
  return filas.length > 0;
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
