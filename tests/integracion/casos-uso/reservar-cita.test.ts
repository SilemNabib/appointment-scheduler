import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { publicarPolitica } from "@/servidor/casos-uso/politica-datos";
import { prepararReserva, type EntradaReserva } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { fijarLimite, negocioConAgenda } from "../fixtures";

// Reserva pública (PUB-05, F-01; RN-04, RN-17, RN-25; ARCH §15, §18.4 y §18.5; Q-29,
// Q-30). "Ahora" es el viernes 1-mar-2030 a las 10:00 a. m. de Bogotá; la reserva es
// el lunes 4-mar-2030 a las 9:00 a. m. (14:00 UTC).

const AHORA = new Date("2030-03-01T15:00:00Z");
const LUNES_9AM = "2030-03-04T14:00:00.000Z";

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const reserva = (n: Negocio, cambios: Partial<EntradaReserva> = {}): EntradaReserva => ({
  slug: n.slug,
  sedeId: n.sedeId,
  servicioId: n.servicioId,
  recursoId: null,
  inicio: LUNES_9AM,
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "300 123 4567",
  correo: "Ana@Mail.com",
  politicaDatosId: n.politicaId,
  aceptaPolitica: true,
  sitioWeb: "",
  ...cambios,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prepararReserva: entrada (RN-17; ARCH §15 y §18.5)", () => {
  test("si falta un dato, el teléfono no se puede normalizar, la casilla no está marcada o sitioWeb llega lleno, devuelve DATOS_INVALIDOS sin tocar la base", async () => {
    const n = await negocioConAgenda();
    const sin = (clave: keyof EntradaReserva) =>
      Object.fromEntries(Object.entries(reserva(n)).filter(([nombre]) => nombre !== clave));
    const casos: unknown[] = [
      sin("nombre"),
      sin("apellido"),
      sin("telefono"),
      sin("correo"),
      sin("aceptaPolitica"),
      sin("politicaDatosId"),
      sin("inicio"),
      reserva(n, { nombre: "   " }),
      reserva(n, { telefono: "123" }),
      reserva(n, { telefono: "no es un teléfono" }),
      reserva(n, { correo: "ana-sin-arroba" }),
      { ...reserva(n), aceptaPolitica: false },
      { ...reserva(n), sitioWeb: "https://spam.example" },
      { ...reserva(n), sitioWeb: " " },
      { ...reserva(n), inicio: "4 de marzo a las 9" },
      { ...reserva(n), inicio: "2030-03-04T09:00:00-05:00" }, // con desfase: se espera UTC (ARCH §9)
      null,
    ];

    // Con una base inalcanzable, cualquier consulta lanzaría un error.
    vi.stubEnv("DATABASE_URL", "postgresql://nadie:nada@base-inexistente.invalid/nada");
    for (const entrada of casos) {
      expect(await prepararReserva(entrada, AHORA), JSON.stringify(entrada)).toEqual({
        ok: false,
        error: "DATOS_INVALIDOS",
      });
    }
  });

  test("con datos válidos devuelve la reserva preparada, con el teléfono y el correo normalizados (RN-18)", async () => {
    const n = await negocioConAgenda();

    expect(await prepararReserva(reserva(n, { telefono: "+57 300-123-4567", correo: " Ana@Mail.com " }), AHORA)).toEqual({
      ok: true,
      valor: {
        negocio: expect.objectContaining({ id: n.negocioId, zonaHoraria: "America/Bogota" }),
        sedeId: n.sedeId,
        servicioId: n.servicioId,
        recursoId: n.recursoId,
        inicio: new Date(LUNES_9AM),
        cliente: { nombre: "Ana", apellido: "Pérez", telefonoE164: "+573001234567", correo: "ana@mail.com" },
        politicaDatosId: n.politicaId,
      },
    });
  });

  test("sin sitioWeb en el cuerpo también se acepta: la trampa solo rechaza un valor", async () => {
    const n = await negocioConAgenda();
    const sinTrampa = Object.fromEntries(Object.entries(reserva(n)).filter(([nombre]) => nombre !== "sitioWeb"));
    expect((await prepararReserva(sinTrampa, AHORA)).ok).toBe(true);
  });
});

describe("prepararReserva: negocio, oferta y política (ARCH §6 y §18.4)", () => {
  test("una política de otro negocio devuelve NO_ENCONTRADO (ARCH §6)", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);
    expect(await prepararReserva(reserva(a, { politicaDatosId: b.politicaId }), AHORA)).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
  });

  test("cualquier versión de la política del negocio se acepta, porque se guarda la que vio el cliente (F-01)", async () => {
    const n = await negocioConAgenda();
    const publicada = await publicarPolitica({ negocioId: n.negocioId }, { contenido: "Política v2" });
    if (!publicada.ok) throw new Error(publicada.error);
    const [v2] = await db()
      .select({ id: esquema.politicaDatos.id })
      .from(esquema.politicaDatos)
      .where(and(eq(esquema.politicaDatos.negocioId, n.negocioId), eq(esquema.politicaDatos.version, 2)));

    const conV1 = await prepararReserva(reserva(n, { politicaDatosId: n.politicaId }), AHORA);
    const conV2 = await prepararReserva(reserva(n, { politicaDatosId: v2.id }), AHORA);
    expect(conV1.ok && conV1.valor.politicaDatosId).toBe(n.politicaId);
    expect(conV2.ok && conV2.valor.politicaDatosId).toBe(v2.id);
  });

  test("un slug, una sede, un servicio o una política inexistentes o de otro negocio devuelven NO_ENCONTRADO", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);
    const casos: Partial<EntradaReserva>[] = [
      { slug: "no-existe-este-negocio" },
      { sedeId: b.sedeId },
      { sedeId: "no-es-un-uuid" },
      { servicioId: b.servicioId },
      { servicioId: randomUUID() },
      { politicaDatosId: randomUUID() },
    ];
    for (const cambios of casos) {
      expect(await prepararReserva(reserva(a, cambios), AHORA), JSON.stringify(cambios)).toEqual({
        ok: false,
        error: "NO_ENCONTRADO",
      });
    }
  });

  test("con cualquier recursoId devuelve NO_ENCONTRADO, aunque sea el recurso del servicio (Q-30)", async () => {
    const n = await negocioConAgenda();
    expect(await prepararReserva(reserva(n, { recursoId: n.recursoId }), AHORA)).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
  });

  test("un negocio suspendido devuelve NEGOCIO_SUSPENDIDO (RN-04)", async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "suspendida" } });
    expect(await prepararReserva(reserva(n), AHORA)).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });
  });

  test("sin cupo de max_appointments_per_month devuelve LIMITE_PLAN (RN-25; Q-29)", async () => {
    const n = await negocioConAgenda();
    await fijarLimite(n.negocioId, "max_appointments_per_month", 0);
    expect(await prepararReserva(reserva(n), AHORA)).toEqual({ ok: false, error: "LIMITE_PLAN" });
  });
});
