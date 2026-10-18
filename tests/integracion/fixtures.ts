import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { count, eq } from "drizzle-orm";
import { vi } from "vitest";
import type { DatosSuscripcion } from "@/dominio/suscripcion";
import { fechaLocal, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { altaNegocio, type EntradaAltaNegocio } from "@/servidor/casos-uso/alta-negocio";
import { leerConsultorio } from "@/servidor/casos-uso/consultorio";
import { guardarHorarioSemanal } from "@/servidor/casos-uso/horario";
import { guardarServicio } from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import * as miembros from "@/servidor/db/repositorios/miembros";
import { listarPlanes } from "@/servidor/planes/acceso";
import { PLAN_ILIMITADO } from "@/servidor/planes/semilla";

// Datos mínimos para las pruebas de integración. Cada llamada crea filas nuevas con
// identificadores aleatorios, así las pruebas no dependen unas de otras.

const sufijo = () => randomUUID().slice(0, 8);

/** Plan mínimo, sin filas de funcionalidades ni de límites: todo sale del catálogo. */
export async function crearPlan() {
  const [fila] = await db()
    .insert(esquema.plan)
    .values({ codigo: `prueba-${sufijo()}`, nombre: "Plan de prueba" })
    .returning({ id: esquema.plan.id });
  return fila.id;
}

/** Id del plan `ilimitado`, que la semilla crea en la rama efímera (T1.30). */
export async function idPlanIlimitado() {
  const planes = await listarPlanes();
  return planes.find((p) => p.codigo === PLAN_ILIMITADO.codigo)!.id;
}

/** Negocio en prueba que vence en 30 días, salvo que `campos` diga otra cosa. */
export async function crearNegocio(
  planId?: string,
  campos: Partial<typeof esquema.negocio.$inferInsert> = {},
) {
  const [fila] = await db()
    .insert(esquema.negocio)
    .values({
      slug: `prueba-${sufijo()}`,
      nombre: "Negocio de prueba",
      planId: planId ?? (await crearPlan()),
      finPrueba: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ...campos,
    })
    .returning({ id: esquema.negocio.id });
  return fila.id;
}

/** Correo en minúsculas que no choca con otros miembros (`miembro_negocio.correo` es único). */
export const correoAleatorio = () => `dueno-${sufijo()}@prueba.test`;

/** Miembro pendiente (sin usuario de Clerk), como lo deja el alta (ARCH §7.4). */
export async function crearMiembro(negocioId: string, correo = correoAleatorio()) {
  const [fila] = await db()
    .insert(esquema.miembroNegocio)
    .values({ negocioId, correo })
    .returning({ id: esquema.miembroNegocio.id });
  return { id: fila.id, correo };
}

export async function crearSede(negocioId: string) {
  const [fila] = await db()
    .insert(esquema.sede)
    .values({ negocioId, nombre: `Sede ${sufijo()}` })
    .returning({ id: esquema.sede.id });
  return fila.id;
}

export async function crearRecurso(
  negocioId: string,
  sedeId: string,
  campos: Partial<typeof esquema.recurso.$inferInsert> = {},
) {
  const [fila] = await db()
    .insert(esquema.recurso)
    .values({ negocioId, sedeId, nombre: "Consultorio", ...campos })
    .returning({ id: esquema.recurso.id });
  return fila.id;
}

export async function crearServicio(negocioId: string) {
  const [fila] = await db()
    .insert(esquema.servicio)
    .values({ negocioId, nombre: "Examen visual", duracionMinutos: 30 })
    .returning({ id: esquema.servicio.id });
  return fila.id;
}

/** Ofrece el servicio en la sede (`servicio_sede`). */
export async function ofrecerServicio(negocioId: string, servicioId: string, sedeId: string) {
  await db().insert(esquema.servicioSede).values({ negocioId, servicioId, sedeId });
}

export async function crearCliente(negocioId: string) {
  const [fila] = await db()
    .insert(esquema.cliente)
    .values({
      negocioId,
      nombre: "Ana",
      apellido: "Pérez",
      telefonoE164: `+57300${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
    })
    .returning({ id: esquema.cliente.id });
  return fila.id;
}

/** Valores de una cita creada desde el panel (sin consentimiento, RN-17), de 30 minutos. */
export function datosDeCita(
  ids: Pick<typeof esquema.cita.$inferInsert, "negocioId" | "sedeId" | "servicioId" | "recursoId" | "clienteId">,
): typeof esquema.cita.$inferInsert {
  const inicio = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const fin = new Date(inicio.getTime() + 30 * 60 * 1000);
  return {
    ...ids,
    inicio,
    fin,
    ocupadoHasta: fin,
    origen: "panel",
    servicioNombre: "Examen visual",
    clienteNombre: "Ana",
    clienteApellido: "Pérez",
  };
}

/**
 * Espera que la consulta falle y devuelve el error de Postgres (código SQLSTATE y
 * restricción). Drizzle envuelve el error del driver en `cause`.
 */
export async function errorDePostgres(consulta: PromiseLike<unknown>) {
  try {
    await consulta;
  } catch (error) {
    const causa = error instanceof Error && error.cause ? error.cause : error;
    const { code, constraint } = causa as { code?: string; constraint?: string };
    return { code, constraint };
  }
  throw new Error("Se esperaba que la consulta fallara.");
}

/** Admin que hace las altas en las pruebas (su clerk_user_id es el autor auditado). */
export const ADMIN_PRUEBA = { clerkUserId: "user_admin_prueba" };

/** Entrada válida para altaNegocio, con slug y correo aleatorios. */
export function entradaDeAlta(cambios: Partial<EntradaAltaNegocio> = {}): EntradaAltaNegocio {
  return {
    slug: `alta-${sufijo()}`,
    nombre: "Óptica Visión",
    plan: "ilimitado",
    estadoSuscripcion: "prueba",
    vencimiento: "2026-11-30",
    correoDueno: correoAleatorio(),
    direccionSede: "Calle 10 # 20-30",
    telefonoSede: "+57 300 123 4567",
    ...cambios,
  };
}

/**
 * Negocio dado de alta con `altaNegocio` (con la sede principal, el consultorio y la
 * política v1) y la sesión de Clerk de su dueño, ya vinculado: desde aquí,
 * `requireMiembro` y las Server Actions ven ese negocio (ARCH §7.4 y §7.5).
 *
 * Queda en prueba, al día por 30 días, salvo que `suscripcion` diga otra cosa (por
 * ejemplo, `{ estadoSuscripcion: "suspendida" }`); esas columnas se fijan después
 * del alta.
 *
 * El archivo de pruebas debe simular `@clerk/nextjs/server` con `auth: vi.fn()`.
 * La invitación de Clerk no importa aquí: si el archivo no simula `clerkClient`,
 * falla y el alta sigue igual (Q-08), así que se silencia su registro.
 */
export async function sesionDeDueno(suscripcion: Partial<DatosSuscripcion> = {}) {
  const vencimiento = fechaLocal(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), ZONA_HORARIA_POR_DEFECTO);
  const entrada = entradaDeAlta({ vencimiento });

  const registro = vi.spyOn(console, "error").mockImplementation(() => {});
  const alta = await altaNegocio(entrada, ADMIN_PRUEBA).finally(() => registro.mockRestore());
  if (!alta.ok) throw new Error(`El alta de prueba falló: ${alta.error}`);
  const { negocioId } = alta.valor;

  if (Object.keys(suscripcion).length > 0) {
    await db().update(esquema.negocio).set(suscripcion).where(eq(esquema.negocio.id, negocioId));
  }

  const clerkUserId = `user_${randomUUID().replaceAll("-", "")}`;
  if (!(await miembros.vincular(entrada.correoDueno, clerkUserId))) {
    throw new Error("El dueño del alta de prueba no quedó vinculado.");
  }
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as Awaited<ReturnType<typeof auth>>);
  return { negocioId, clerkUserId };
}

/** Franjas de lunes a viernes, de 8:00 a 12:00 y de 14:00 a 18:00 (hora local). */
export const HORARIO_LABORAL = [1, 2, 3, 4, 5].flatMap((dia) => [
  { dia, inicio: "08:00", fin: "12:00" },
  { dia, inicio: "14:00", fin: "18:00" },
]);

export type OpcionesAgenda = {
  /** Duración y buffer del servicio; por defecto, 30 minutos sin buffer. */
  servicio?: { duracionMinutos?: number; bufferMinutos?: number };
  /** Por defecto, `HORARIO_LABORAL`. */
  franjas?: { dia: number; inicio: string; fin: string }[];
  /** Capacidad del consultorio; por defecto, 1. */
  capacidad?: number;
  /** Reglas de reserva; por defecto, las de D-09 (granularidad 30, anticipación de 2 h a 60 días). */
  reglas?: Partial<typeof esquema.configuracionNegocio.$inferInsert>;
  /** Columnas de la suscripción que se fijan después del alta, por ejemplo `{ estadoSuscripcion: "suspendida" }`. */
  suscripcion?: Partial<DatosSuscripcion>;
};

/**
 * Negocio dado de alta con `altaNegocio` (sede principal, consultorio, política v1 y
 * la configuración de D-09), con un servicio ofrecido en la sede principal y atendido
 * por el consultorio (`guardarServicio`) y el horario de la sede (`guardarHorarioSemanal`).
 * Queda en prueba hasta el 31-dic-2099, así las pruebas con un `ahora` fijo no dependen
 * de la fecha real, salvo que `opciones.suscripcion` diga otra cosa. Devuelve los
 * identificadores que usan la consulta y la reserva públicas.
 */
export async function negocioConAgenda(opciones: OpcionesAgenda = {}) {
  const entrada = entradaDeAlta({ vencimiento: "2099-12-31" });
  const registro = vi.spyOn(console, "error").mockImplementation(() => {});
  const alta = await altaNegocio(entrada, ADMIN_PRUEBA).finally(() => registro.mockRestore());
  if (!alta.ok) throw new Error(`El alta de prueba falló: ${alta.error}`);
  const { negocioId } = alta.valor;
  const ctx = { negocioId };

  const servicio = await guardarServicio(ctx, {
    nombre: "Examen visual",
    duracionMinutos: opciones.servicio?.duracionMinutos ?? 30,
    bufferMinutos: opciones.servicio?.bufferMinutos ?? 0,
  });
  if (!servicio.ok) throw new Error(`El servicio de prueba falló: ${servicio.error}`);
  const horario = await guardarHorarioSemanal(ctx, { franjas: opciones.franjas ?? HORARIO_LABORAL });
  if (!horario.ok) throw new Error(`El horario de prueba falló: ${horario.error}`);

  const consultorio = await leerConsultorio(ctx);
  if (opciones.capacidad !== undefined) {
    await db().update(esquema.recurso).set({ capacidad: opciones.capacidad }).where(eq(esquema.recurso.id, consultorio.id));
  }
  if (opciones.suscripcion) {
    await db().update(esquema.negocio).set(opciones.suscripcion).where(eq(esquema.negocio.id, negocioId));
  }
  if (opciones.reglas) {
    await db()
      .update(esquema.configuracionNegocio)
      .set(opciones.reglas)
      .where(eq(esquema.configuracionNegocio.negocioId, negocioId));
  }
  const [politica] = await db()
    .select({ id: esquema.politicaDatos.id })
    .from(esquema.politicaDatos)
    .where(eq(esquema.politicaDatos.negocioId, negocioId));

  return {
    negocioId,
    slug: entrada.slug,
    correoDueno: entrada.correoDueno,
    sedeId: consultorio.sedeId,
    recursoId: consultorio.id,
    servicioId: servicio.valor.id,
    politicaId: politica.id,
  };
}

/** Excepción de un límite del plan para el negocio (`negocio_limite`; `null` = ilimitado). */
export async function fijarLimite(negocioId: string, limite: "max_services" | "max_resources", valor: number | null) {
  await db()
    .insert(esquema.negocioLimite)
    .values({ negocioId, limite, valor })
    .onConflictDoUpdate({
      target: [esquema.negocioLimite.negocioId, esquema.negocioLimite.limite],
      set: { valor },
    });
}

/** Filas que dejó (o no) un alta: negocios con ese slug y miembros con ese correo. */
export async function filasDelAlta(slug: string, correo: string) {
  const [negocios] = await db().select({ total: count() }).from(esquema.negocio).where(eq(esquema.negocio.slug, slug));
  const [miembros] = await db()
    .select({ total: count() })
    .from(esquema.miembroNegocio)
    .where(eq(esquema.miembroNegocio.correo, correo.trim().toLowerCase()));
  return { negocios: negocios.total, miembros: miembros.total };
}
