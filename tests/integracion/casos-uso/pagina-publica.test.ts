import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { guardarContactos } from "@/servidor/casos-uso/contactos";
import { guardarNegocio } from "@/servidor/casos-uso/guardar-negocio";
import { leerPaginaPublica, leerPoliticaPublica } from "@/servidor/casos-uso/pagina-publica";
import { publicarPolitica } from "@/servidor/casos-uso/politica-datos";
import { desactivarServicio, guardarServicio } from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { HORARIO_LABORAL, negocioConAgenda } from "../fixtures";

// leerPaginaPublica (PUB-01, PUB-02, PUB-07, F-05; RN-04, RN-05, RN-31, RN-32; ARCH §6,
// §7.6). "Ahora" es el viernes 1-mar-2030 a las 10:00 a. m. de Bogotá; el negocio de
// prueba está en prueba hasta 2099, con el horario laboral y la anticipación máxima de
// 60 días de D-09.

const AHORA = new Date("2030-03-01T15:00:00Z");

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

async function conMarcaYContactos(n: Negocio) {
  const ctx = { negocioId: n.negocioId };
  await guardarNegocio(ctx, {
    nombre: "Óptica Visión Clara",
    colorPrimario: "#2b3fd6",
    rubro: "Óptica y optometría",
    eslogan: "Ve el mundo con claridad",
    fraseBanner: "Tu examen visual, sin filas",
    descripcion: "Exámenes y lentes.",
    direccion: "Cra. 7 # 12-34, Bogotá",
  });
  await guardarContactos(ctx, {
    contactos: [
      { tipo: "whatsapp", valor: "300 123 4567", etiqueta: "Citas" },
      { tipo: "correo", valor: "hola@optica.com" },
    ],
  });
}

describe("leerPaginaPublica", () => {
  test("devuelve la marca, la sede con sus contactos en orden y sus franjas, los servicios activos con la duración de la sede y la política vigente", async () => {
    const n = await negocioConAgenda();
    await conMarcaYContactos(n);
    const ctx = { negocioId: n.negocioId };
    // Un segundo servicio con categoría, y la duración del primero sobrescrita en la sede.
    const segundo = await guardarServicio(ctx, { nombre: "Adaptación de lentes", categoria: "Lentes", duracionMinutos: "45" });
    if (!segundo.ok) throw new Error(segundo.error);
    await db()
      .update(esquema.servicioSede)
      .set({ duracionMinutos: 50 })
      .where(and(eq(esquema.servicioSede.servicioId, n.servicioId), eq(esquema.servicioSede.sedeId, n.sedeId)));
    const v2 = await publicarPolitica(ctx, { contenido: "# Política\n\nVersión 2." });
    if (!v2.ok) throw new Error(v2.error);

    const resultado = await leerPaginaPublica(n.slug, AHORA);

    expect(resultado).toEqual({
      ok: true,
      valor: {
        estado: "abierta",
        marca: {
          nombre: "Óptica Visión Clara",
          slug: n.slug,
          logoUrl: null,
          colorPrimario: "#2b3fd6",
          colorSecundario: null,
          rubro: "Óptica y optometría",
          eslogan: "Ve el mundo con claridad",
          fraseBanner: "Tu examen visual, sin filas",
          descripcion: "Exámenes y lentes.",
          zonaHoraria: "America/Bogota",
        },
        sede: {
          id: n.sedeId,
          direccion: "Cra. 7 # 12-34, Bogotá",
          contactos: [
            { tipo: "whatsapp", valor: "+573001234567", etiqueta: "Citas" },
            { tipo: "correo", valor: "hola@optica.com", etiqueta: null },
          ],
          franjas: HORARIO_LABORAL,
        },
        servicios: expect.arrayContaining([
          { id: n.servicioId, nombre: "Examen visual", descripcion: null, categoria: null, duracionMinutos: 50 },
          { id: segundo.valor.id, nombre: "Adaptación de lentes", descripcion: null, categoria: "Lentes", duracionMinutos: 45 },
        ]),
        politica: { id: expect.any(String), version: 2 },
        hoy: "2030-03-01",
        ultimoDia: "2030-04-30",
      },
    });
    expect(resultado.ok && resultado.valor.estado !== "suspendida" && resultado.valor.servicios).toHaveLength(2);
  });

  test("no trae datos del dueño", async () => {
    const n = await negocioConAgenda();
    const resultado = await leerPaginaPublica(n.slug, AHORA);
    expect(JSON.stringify(resultado)).not.toContain(n.correoDueno);
  });

  test("un slug inexistente devuelve NO_ENCONTRADO", async () => {
    expect(await leerPaginaPublica("no-existe-este-slug", AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
  });

  test("suspendido, el estado es suspendida, con la marca y los contactos y sin servicios (PUB-07; RN-04)", async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "suspendida" } });
    // guardarNegocio y guardarContactos no miran la suscripción (lo hace la Server Action).
    await conMarcaYContactos(n);
    const resultado = await leerPaginaPublica(n.slug, AHORA);

    expect(resultado.ok && resultado.valor).toMatchObject({
      estado: "suspendida",
      marca: { nombre: "Óptica Visión Clara" },
      sede: { contactos: [expect.objectContaining({ tipo: "whatsapp" }), expect.objectContaining({ tipo: "correo" })] },
    });
    expect(resultado.ok && "servicios" in resultado.valor).toBe(false);
    expect(resultado.ok && "politica" in resultado.valor).toBe(false);
  });

  test("en gracia, la página está abierta (RN-31)", async () => {
    // Vencido ayer: dentro de los 3 días de gracia.
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "prueba", finPrueba: new Date("2030-02-28T05:00:00Z") } });
    expect(await leerPaginaPublica(n.slug, AHORA)).toMatchObject({ ok: true, valor: { estado: "abierta" } });
  });

  test("sin servicios activos, el estado es sin_horarios y la lista va vacía (F-05; RN-05)", async () => {
    const n = await negocioConAgenda();
    await desactivarServicio({ negocioId: n.negocioId }, n.servicioId);

    expect(await leerPaginaPublica(n.slug, AHORA)).toMatchObject({ ok: true, valor: { estado: "sin_horarios", servicios: [] } });
  });

  test("sin franjas, el estado es sin_horarios (F-05)", async () => {
    const n = await negocioConAgenda({ franjas: [] });
    expect(await leerPaginaPublica(n.slug, AHORA)).toMatchObject({ ok: true, valor: { estado: "sin_horarios" } });
  });
});

describe("leerPoliticaPublica (PUB-05, RN-17; Q-45)", () => {
  test("una versión anterior sigue disponible después de publicar otra", async () => {
    const n = await negocioConAgenda();
    const v2 = await publicarPolitica({ negocioId: n.negocioId }, { contenido: "# Política\n\nVersión 2." });
    if (!v2.ok) throw new Error(v2.error);

    const anterior = await leerPoliticaPublica(n.slug, "1");
    const vigente = await leerPoliticaPublica(n.slug, "2");

    expect(anterior).toMatchObject({ ok: true, valor: { version: 1, contenido: expect.stringContaining("Política de tratamiento"), marca: { slug: n.slug } } });
    expect(vigente).toMatchObject({ ok: true, valor: { version: 2, contenido: "# Política\n\nVersión 2.", publicadaEn: expect.any(Date) } });
  });

  test("una versión inexistente, mal escrita o de otro negocio devuelve NO_ENCONTRADO (RN-01)", async () => {
    const a = await negocioConAgenda();
    const b = await negocioConAgenda();
    await publicarPolitica({ negocioId: b.negocioId }, { contenido: "De B, versión 2." });

    for (const version of ["2", "0", "-1", "1.5", "uno", "", "9999999999"]) {
      expect(await leerPoliticaPublica(a.slug, version), version).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    }
    expect(await leerPoliticaPublica("no-existe-este-slug", "1")).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect((await leerPoliticaPublica(b.slug, "2")).ok).toBe(true);
  });

  test("se muestra aunque el negocio esté suspendido", async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "suspendida" } });
    expect(await leerPoliticaPublica(n.slug, "1")).toMatchObject({ ok: true, valor: { version: 1 } });
  });
});
