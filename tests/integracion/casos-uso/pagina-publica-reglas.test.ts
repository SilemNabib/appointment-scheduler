import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { guardarContactos } from "@/servidor/casos-uso/contactos";
import { guardarNegocio } from "@/servidor/casos-uso/guardar-negocio";
import { leerPaginaPublica, leerPoliticaPublica } from "@/servidor/casos-uso/pagina-publica";
import { publicarPolitica } from "@/servidor/casos-uso/politica-datos";
import { desactivarServicio, guardarServicio } from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearRecurso, crearSede, negocioConAgenda } from "../fixtures";

// Reglas de negocio que toca la página pública (ARCH §20), con leerPaginaPublica. Cada
// caso cita su origen. "Ahora" es el viernes 1-mar-2030 a las 10:00 a. m. de Bogotá.

const AHORA = new Date("2030-03-01T15:00:00Z");
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** La página en un estado distinto de suspendida, para comparar sus datos. */
async function abierta(slug: string) {
  const r = await leerPaginaPublica(slug, AHORA);
  if (!r.ok || r.valor.estado === "suspendida") throw new Error(`Se esperaba la página abierta: ${JSON.stringify(r)}`);
  return r.valor;
}

describe("suscripción (RN-04, RN-31)", () => {
  test('con el negocio suspendido, la página queda en "Reservas no disponibles" (RN-04)', async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "suspendida" } });
    expect(await leerPaginaPublica(n.slug, AHORA)).toMatchObject({ ok: true, valor: { estado: "suspendida" } });
  });

  test("pasada la gracia, la columna dice prueba pero el estado efectivo es suspendida (RN-04, RN-31)", async () => {
    // Vencido hace 4 días: la gracia es de 3.
    const n = await negocioConAgenda({ suscripcion: { finPrueba: new Date(AHORA.getTime() - 4 * MS_POR_DIA) } });
    expect(await leerPaginaPublica(n.slug, AHORA)).toMatchObject({ ok: true, valor: { estado: "suspendida" } });
  });

  test("en gracia funciona igual que al día: los mismos datos y el mismo estado (RN-31)", async () => {
    const n = await negocioConAgenda();
    const alDia = await abierta(n.slug);
    await db()
      .update(esquema.negocio)
      .set({ estadoSuscripcion: "activa", pagadoHasta: new Date(AHORA.getTime() - MS_POR_DIA) })
      .where(eq(esquema.negocio.id, n.negocioId));

    const enGracia = await abierta(n.slug);
    expect(enGracia).toEqual(alDia);
    expect(enGracia.estado).toBe("abierta");
  });
});

describe("servicios y horario (RN-05, F-05)", () => {
  test("un servicio inactivo no aparece en la página pública (RN-05)", async () => {
    const n = await negocioConAgenda();
    const otro = await guardarServicio({ negocioId: n.negocioId }, { nombre: "Adaptación de lentes", duracionMinutos: "30" });
    if (!otro.ok) throw new Error(otro.error);
    await desactivarServicio({ negocioId: n.negocioId }, otro.valor.id);

    const pagina = await abierta(n.slug);
    expect(pagina.servicios.map((s) => s.id)).toEqual([n.servicioId]);
  });

  test('sin un servicio activo, la página queda en "Aún no hay horarios disponibles" (F-05, paso 4)', async () => {
    const n = await negocioConAgenda();
    await desactivarServicio({ negocioId: n.negocioId }, n.servicioId);
    expect(await leerPaginaPublica(n.slug, AHORA)).toMatchObject({ ok: true, valor: { estado: "sin_horarios" } });
  });

  test("sin horario, también (F-05, paso 4)", async () => {
    const n = await negocioConAgenda({ franjas: [] });
    expect(await leerPaginaPublica(n.slug, AHORA)).toMatchObject({ ok: true, valor: { estado: "sin_horarios" } });
  });
});

describe("sedes (RN-32, D-16)", () => {
  test('con una segunda sede activa creada por SQL, la página sigue mostrando solo la sede principal y sus datos (RN-32: "con una sola sede activa…")', async () => {
    const n = await negocioConAgenda();
    await guardarNegocio({ negocioId: n.negocioId }, { nombre: "Óptica Visión", colorPrimario: "#2b3fd6", direccion: "Calle principal 1" });
    await guardarContactos({ negocioId: n.negocioId }, { contactos: [{ tipo: "telefono", valor: "601 234 5678" }] });
    const antes = await abierta(n.slug);

    // Segunda sede, con su recurso, su dirección, un contacto, un horario y la oferta del servicio.
    const sedeB = await crearSede(n.negocioId);
    const recursoB = await crearRecurso(n.negocioId, sedeB);
    await db().update(esquema.sede).set({ direccion: "Calle de la otra sede 2" }).where(eq(esquema.sede.id, sedeB));
    await db().insert(esquema.contactoSede).values({ negocioId: n.negocioId, sedeId: sedeB, tipo: "telefono", valor: "+576019998877" });
    await db().insert(esquema.horarioSemanal).values({ negocioId: n.negocioId, sedeId: sedeB, diaSemana: 6, horaInicio: "08:00", horaFin: "12:00" });
    await db().insert(esquema.servicioSede).values({ negocioId: n.negocioId, servicioId: n.servicioId, sedeId: sedeB, duracionMinutos: 90 });
    await db()
      .insert(esquema.servicioSedeRecurso)
      .values({ negocioId: n.negocioId, servicioId: n.servicioId, sedeId: sedeB, recursoId: recursoB });

    const despues = await abierta(n.slug);
    expect(despues).toEqual(antes);
    expect(despues.sede).toMatchObject({ id: n.sedeId, direccion: "Calle principal 1" });
    expect(JSON.stringify(despues)).not.toMatch(/otra sede|6019998877|"duracionMinutos":90/);
  });
});

describe("multi-negocio (RN-01)", () => {
  test("con el slug de A, pedir la política de B por su versión devuelve NO_ENCONTRADO, y la página de A no trae datos de B", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);
    await guardarNegocio({ negocioId: b.negocioId }, { nombre: "Negocio B", colorPrimario: "#b4321e", rubro: "Rubro de B", direccion: "Dirección de B" });
    await guardarContactos({ negocioId: b.negocioId }, { contactos: [{ tipo: "correo", valor: "b@negocio-b.com" }] });
    const deB = await guardarServicio({ negocioId: b.negocioId }, { nombre: "Servicio de B", duracionMinutos: "30" });
    if (!deB.ok) throw new Error(deB.error);
    const v2DeB = await publicarPolitica({ negocioId: b.negocioId }, { contenido: "Política de B, versión 2." });
    if (!v2DeB.ok) throw new Error(v2DeB.error);

    // A solo tiene la versión 1; B tiene la 2.
    expect(await leerPoliticaPublica(a.slug, "2")).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await leerPoliticaPublica(b.slug, "2")).toMatchObject({ ok: true, valor: { contenido: "Política de B, versión 2." } });

    const paginaA = JSON.stringify(await leerPaginaPublica(a.slug, AHORA));
    for (const deOtro of [b.negocioId, b.sedeId, b.servicioId, deB.valor.id, b.politicaId, "Negocio B", "Rubro de B", "Dirección de B", "negocio-b.com", "Servicio de B"]) {
      expect(paginaA, deOtro).not.toContain(deOtro);
    }
  });
});
