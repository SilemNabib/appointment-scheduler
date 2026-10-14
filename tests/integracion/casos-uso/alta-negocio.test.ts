import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { altaNegocio, type EntradaAltaNegocio } from "@/servidor/casos-uso/alta-negocio";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { politicaInicial } from "@/servidor/politica-datos/plantilla";
import { correoAleatorio, idPlanIlimitado } from "../fixtures";

// Caso de uso altaNegocio (ADM-02, F-11; ARCH §7.6 y §18.4). Las reglas del slug y
// los efectos según sedes, planes y auditoría se prueban en T1.52 y T1.53.

const ADMIN = { clerkUserId: "user_admin_prueba" };

const entradaValida = (cambios: Partial<EntradaAltaNegocio> = {}): EntradaAltaNegocio => ({
  slug: `alta-${randomUUID().slice(0, 8)}`,
  nombre: "Óptica Visión",
  plan: "ilimitado",
  estadoSuscripcion: "prueba",
  vencimiento: "2026-11-30",
  correoDueno: correoAleatorio(),
  direccionSede: "Calle 10 # 20-30",
  telefonoSede: "+57 300 123 4567",
  ...cambios,
});

/** Las seis filas del alta; cada tabla debe tener exactamente una del negocio. */
async function negocioCreado(negocioId: string) {
  const unoDe = async <F>(filas: Promise<F[]>) => {
    const lista = await filas;
    expect(lista).toHaveLength(1);
    return lista[0];
  };
  return {
    negocio: await unoDe(db().select().from(esquema.negocio).where(eq(esquema.negocio.id, negocioId))),
    configuracion: await unoDe(
      db().select().from(esquema.configuracionNegocio).where(eq(esquema.configuracionNegocio.negocioId, negocioId)),
    ),
    sede: await unoDe(db().select().from(esquema.sede).where(eq(esquema.sede.negocioId, negocioId))),
    recurso: await unoDe(db().select().from(esquema.recurso).where(eq(esquema.recurso.negocioId, negocioId))),
    politica: await unoDe(
      db().select().from(esquema.politicaDatos).where(eq(esquema.politicaDatos.negocioId, negocioId)),
    ),
    miembro: await unoDe(
      db().select().from(esquema.miembroNegocio).where(eq(esquema.miembroNegocio.negocioId, negocioId)),
    ),
  };
}

async function negociosConSlug(slug: string) {
  const [{ total }] = await db().select({ total: count() }).from(esquema.negocio).where(eq(esquema.negocio.slug, slug));
  return total;
}

describe("altaNegocio", () => {
  test("un alta válida crea las seis filas de ARCH §18.4", async () => {
    const entrada = entradaValida();
    const resultado = await altaNegocio(entrada, ADMIN);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const { negocio, configuracion, sede, recurso, politica, miembro } = await negocioCreado(
      resultado.valor.negocioId,
    );
    expect(negocio).toMatchObject({
      slug: entrada.slug,
      nombre: "Óptica Visión",
      planId: await idPlanIlimitado(),
      estadoSuscripcion: "prueba",
      // "Hasta el 30 de noviembre" = 1-dic a las 00:00 de Bogotá (ARCH §7.6).
      finPrueba: new Date("2026-12-01T05:00:00Z"),
      pagadoHasta: null,
      zonaHoraria: "America/Bogota",
      correoContacto: null, // Q-11
    });
    // D-09 (y D-20, D-21): los valores por defecto de la configuración.
    expect(configuracion).toEqual({
      negocioId: negocio.id,
      granularidadMinutos: 30,
      anticipacionMinimaMinutos: 120,
      anticipacionMaximaDias: 60,
      plazoCancelacionHoras: 24,
      recordatorioHorasAntes: 24,
      maxReprogramacionesCliente: 3,
      asistenciaPorDefecto: "completada",
    });
    expect(sede).toMatchObject({
      nombre: "Sede principal",
      direccion: "Calle 10 # 20-30",
      telefono: "+57 300 123 4567",
      activa: true,
    });
    expect(recurso).toMatchObject({
      sedeId: sede.id,
      nombre: "Consultorio",
      tipo: "consultorio",
      capacidad: 1,
      activo: true,
    });
    expect(politica).toMatchObject({ version: 1, contenido: politicaInicial("Óptica Visión") });
    expect(miembro).toMatchObject({
      correo: entrada.correoDueno,
      rol: "dueno",
      clerkUserId: null,
      vinculadoEn: null,
    });
  });

  test('"pagado hasta 2026-10-09" en activa se guarda como pagado_hasta = 2026-10-10T05:00:00Z (ARCH §7.6)', async () => {
    const resultado = await altaNegocio(
      entradaValida({ estadoSuscripcion: "activa", vencimiento: "2026-10-09" }),
      ADMIN,
    );
    if (!resultado.ok) throw new Error(resultado.error);

    const { negocio } = await negocioCreado(resultado.valor.negocioId);
    expect(negocio).toMatchObject({
      estadoSuscripcion: "activa",
      pagadoHasta: new Date("2026-10-10T05:00:00Z"),
      finPrueba: null,
    });
  });

  test("guarda el correo del dueño en minúsculas y sin espacios, y la sede sin dirección ni teléfono si vienen vacíos (Q-12)", async () => {
    const correo = correoAleatorio();
    const resultado = await altaNegocio(
      entradaValida({ correoDueno: `  ${correo.toUpperCase()} `, direccionSede: "", telefonoSede: undefined }),
      ADMIN,
    );
    if (!resultado.ok) throw new Error(resultado.error);

    const { sede, miembro } = await negocioCreado(resultado.valor.negocioId);
    expect(miembro.correo).toBe(correo);
    expect(sede).toMatchObject({ direccion: null, telefono: null });
  });

  test("con el correo del dueño ya usado no crea nada: todo va en una transacción (Q-09)", async () => {
    const correo = correoAleatorio();
    expect((await altaNegocio(entradaValida({ correoDueno: correo }), ADMIN)).ok).toBe(true);

    const segunda = entradaValida({ correoDueno: correo });
    expect(await altaNegocio(segunda, ADMIN)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect(await negociosConSlug(segunda.slug)).toBe(0);
  });

  test.each([
    ["un plan inexistente", { plan: "no-existe" }],
    ["un estado distinto de prueba o activa", { estadoSuscripcion: "suspendida" as never }],
    ["un vencimiento que no es una fecha", { vencimiento: "30/11/2026" }],
    ["un vencimiento inexistente", { vencimiento: "2026-02-30" }],
    ["un correo inválido", { correoDueno: "no-es-correo" }],
    ["el nombre vacío", { nombre: "   " }],
  ])("con %s devuelve DATOS_INVALIDOS y no crea nada (Q-09)", async (_, cambios) => {
    const entrada = entradaValida(cambios);

    expect(await altaNegocio(entrada, ADMIN)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect(await negociosConSlug(entrada.slug)).toBe(0);
  });
});
