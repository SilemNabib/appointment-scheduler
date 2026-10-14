import { randomUUID } from "node:crypto";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
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

export async function crearNegocio(planId?: string) {
  const [fila] = await db()
    .insert(esquema.negocio)
    .values({
      slug: `prueba-${sufijo()}`,
      nombre: "Negocio de prueba",
      planId: planId ?? (await crearPlan()),
      finPrueba: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
