import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { verCitaPorLink } from "@/servidor/casos-uso/gestion-cita";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { tokenDeGestion } from "@/servidor/gestion-cita/firma";
import { negocioConAgenda } from "../fixtures";

// Gestión de la cita por el link (GES-01, GES-04, GES-05; RN-01, RN-13, RN-24; ARCH §6 y
// §13; Q-69). "Ahora" es el viernes 1-mar-2030 a las 10:00 a. m. de Bogotá; la cita, el
// lunes 4 a las 9:00 a. m. (14:00 UTC), con el plazo de 24 horas de D-09.

const AHORA = new Date("2030-03-01T15:00:00Z");
const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

beforeEach(() => {
  vi.stubEnv("GESTION_CITA_SECRET", "secreto-de-gestion-de-prueba");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Una reserva pública y su link (slug, citaId y token). */
async function conLink(n: Negocio) {
  const r = await reservarCita(
    {
      slug: n.slug,
      sedeId: n.sedeId,
      servicioId: n.servicioId,
      recursoId: null,
      inicio: "2030-03-04T14:00:00.000Z",
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "310 555 0199",
      correo: "ana.link@mail.com",
      politicaDatosId: n.politicaId,
      aceptaPolitica: true,
      sitioWeb: "",
    },
    AHORA,
  );
  if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
  const { citaId } = r.valor;
  return { slug: n.slug, citaId, token: await tokenDeGestion({ id: citaId, tokenVersion: 1 }), codigo: r.valor.codigo };
}

describe("verCitaPorLink (GES-01)", () => {
  test("con el link de su correo, devuelve la cita, su sede con los contactos y las acciones con sus reprogramaciones", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);

    const r = await verCitaPorLink(link, AHORA);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.cita).toEqual({
      id: link.citaId,
      codigo: link.codigo,
      servicio: "Examen visual",
      inicio: new Date("2030-03-04T14:00:00Z"),
      fin: new Date("2030-03-04T14:30:00Z"),
      estado: "confirmada",
      direccion: expect.any(String),
    });
    expect(r.valor.marca).toEqual(expect.objectContaining({ slug: n.slug, zonaHoraria: "America/Bogota" }));
    expect(r.valor.sede).toEqual(expect.objectContaining({ id: n.sedeId, contactos: expect.any(Array), franjas: expect.any(Array) }));
    expect(r.valor.acciones).toEqual({ cancelar: { permitida: true }, reprogramar: { permitida: true }, reprogramacionesRestantes: 3 });
    expect(r.valor.limiteReprogramaciones).toBe(3);
  });

  test("no devuelve los datos de contacto del cliente (RN-24)", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);

    const texto = JSON.stringify(await verCitaPorLink(link, AHORA));

    expect(texto).not.toContain("ana.link@mail.com");
    expect(texto).not.toContain("3105550199");
    expect(texto).not.toContain("Pérez");
  });

  test("fuera del plazo, las acciones no se ofrecen y dicen por qué (GES-04; RN-13)", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);

    const r = await verCitaPorLink(link, new Date("2030-03-03T14:00:00.001Z"));

    expect(r.ok && r.valor.acciones.cancelar).toEqual({ permitida: false, motivo: "fuera_de_plazo", error: "FUERA_DE_PLAZO" });
  });

  test("con el negocio suspendido, devuelve la cita y los contactos, sin acciones (GES-05, D-14)", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);
    await db().update(esquema.negocio).set({ estadoSuscripcion: "suspendida" }).where(eq(esquema.negocio.id, n.negocioId));

    const r = await verCitaPorLink(link, AHORA);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.cita.codigo).toBe(link.codigo);
    expect(r.valor.sede.contactos).toEqual(expect.any(Array));
    const sinAccion = { permitida: false, motivo: "negocio_suspendido", error: "NEGOCIO_SUSPENDIDO" };
    expect(r.valor.acciones.cancelar).toEqual(sinAccion);
    expect(r.valor.acciones.reprogramar).toEqual(sinAccion);
  });
});

describe("links que no corresponden: NO_ENCONTRADO, como una cita inexistente (RN-13; ARCH §6, defensa 3)", () => {
  test("un token con un carácter cambiado", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);
    const otro = BASE64URL[(BASE64URL.indexOf(link.token[10]) + 1) % BASE64URL.length];
    const alterado = link.token.slice(0, 10) + otro + link.token.slice(11);

    expect(await verCitaPorLink({ ...link, token: alterado }, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
  });

  test("un citaId que no es un uuid, una cita inexistente y un token de otra versión", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);
    const inexistente = crypto.randomUUID();

    for (const entrada of [
      { ...link, citaId: "no-es-un-uuid" },
      { ...link, citaId: inexistente, token: await tokenDeGestion({ id: inexistente, tokenVersion: 1 }) },
      { ...link, token: await tokenDeGestion({ id: link.citaId, tokenVersion: 2 }) },
      { ...link, token: 42 },
      { ...link, slug: null },
    ]) {
      expect(await verCitaPorLink(entrada, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    }
  });

  test("el link de una cita de A con el slug de B (RN-01)", async () => {
    const a = await negocioConAgenda();
    const b = await negocioConAgenda();
    const link = await conLink(a);

    expect(await verCitaPorLink({ ...link, slug: b.slug }, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
  });

  test("después de subir token_version, el link anterior ya no sirve (ARCH §13)", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);
    await db().update(esquema.cita).set({ tokenVersion: 2 }).where(eq(esquema.cita.id, link.citaId));

    expect(await verCitaPorLink(link, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
  });
});
