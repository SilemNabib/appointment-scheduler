import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST as cancelar } from "@/app/api/publico/[slug]/citas/[citaId]/cancelar/route";
import { POST as disponibilidad } from "@/app/api/publico/[slug]/citas/[citaId]/disponibilidad/route";
import { POST as reprogramar } from "@/app/api/publico/[slug]/citas/[citaId]/reprogramar/route";
import { diaSemana, fechaLocal, localAUtc, sumarDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { tokenDeGestion } from "@/servidor/gestion-cita/firma";
import { negocioConAgenda } from "../../../fixtures";

// Rutas de la gestión por link (GES-02, GES-03; RN-13, RN-34; ARCH §13, §18.5 y §19.2;
// Q-33, Q-69). Las rutas usan la hora real: la cita es a las 9:00 a. m. del próximo día
// hábil después de mañana, dentro del plazo de 24 horas de D-09.

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;
type Ruta = typeof cancelar;

function proximoDiaHabil() {
  let fecha = sumarDias(fechaLocal(new Date(), ZONA_HORARIA_POR_DEFECTO), 2);
  while (diaSemana(fecha) > 5) fecha = sumarDias(fecha, 1);
  return fecha;
}
const alas = (hora: string) => localAUtc(proximoDiaHabil(), hora, ZONA_HORARIA_POR_DEFECTO).toISOString();

beforeEach(() => {
  vi.stubEnv("GESTION_CITA_SECRET", "secreto-de-gestion-de-prueba");
  // Fuera de una solicitud de Next, `after()` no programa el envío: el despacho solo lo registra.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function conLink(n: Negocio) {
  const r = await reservarCita(
    {
      slug: n.slug,
      sedeId: n.sedeId,
      servicioId: n.servicioId,
      recursoId: null,
      inicio: alas("09:00"),
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "310 555 0199",
      correo: "ana.cliente@mail.com",
      politicaDatosId: n.politicaId,
      aceptaPolitica: true,
      sitioWeb: "",
    },
    new Date(),
  );
  if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
  const { citaId } = r.valor;
  return { slug: n.slug, citaId, token: await tokenDeGestion({ id: citaId, tokenVersion: 1 }) };
}

function llamar(ruta: Ruta, link: { slug: string; citaId: string }, contenido: BodyInit, tipo: string | null = "application/json") {
  const headers = new Headers();
  if (tipo) headers.set("content-type", tipo);
  const solicitud = new Request(`http://localhost/api/publico/${link.slug}/citas/${link.citaId}/x`, { method: "POST", headers, body: contenido });
  return ruta(solicitud, { params: Promise.resolve({ slug: link.slug, citaId: link.citaId }) });
}

const json = (ruta: Ruta, link: { slug: string; citaId: string }, cuerpo: unknown) => llamar(ruta, link, JSON.stringify(cuerpo));

/** El código de error de una respuesta (ARCH §18.5). */
const codigoDe = async (r: Response) => ((await r.json()) as { error: { codigo: string } }).error.codigo;

describe("POST …/cancelar y …/reprogramar (ARCH §18.5; Q-69)", () => {
  test("cancelar responde 200 con { citaId, estado, inicio, fin, reprogramacionesRestantes }, privado y sin caché (ARCH §13)", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);

    const r = await json(cancelar, link, { token: link.token });

    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(await r.json()).toEqual({
      citaId: link.citaId,
      estado: "cancelada",
      inicio: alas("09:00"),
      fin: alas("09:30"),
      reprogramacionesRestantes: 3,
    });
  });

  test("reprogramar responde 200 con la hora nueva y las reprogramaciones que le quedan", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);

    const r = await json(reprogramar, link, { token: link.token, inicio: alas("10:00") });

    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(await r.json()).toEqual({
      citaId: link.citaId,
      estado: "confirmada",
      inicio: alas("10:00"),
      fin: alas("10:30"),
      reprogramacionesRestantes: 2,
    });
  });

  test("un token inválido responde 404 NO_ENCONTRADO en las tres rutas", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);
    const token = (link.token[0] === "A" ? "B" : "A") + link.token.slice(1);
    const fecha = proximoDiaHabil();

    for (const [ruta, cuerpo] of [
      [cancelar, { token }],
      [reprogramar, { token, inicio: alas("10:00") }],
      [disponibilidad, { token, desde: fecha, hasta: fecha }],
    ] as const) {
      const r = await json(ruta, link, cuerpo);
      expect(r.status).toBe(404);
      expect(await codigoDe(r)).toBe("NO_ENCONTRADO");
    }
  });

  test("fuera del plazo, cancelar y reprogramar responden 409 FUERA_DE_PLAZO con el texto de Q-70", async () => {
    // Un plazo de 60 días: la cita de pasado mañana ya está fuera.
    const n = await negocioConAgenda({ reglas: { plazoCancelacionHoras: 60 * 24 } });
    const link = await conLink(n);

    for (const [ruta, cuerpo] of [
      [cancelar, { token: link.token }],
      [reprogramar, { token: link.token, inicio: alas("10:00") }],
    ] as const) {
      const r = await json(ruta, link, cuerpo);
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({
        error: { codigo: "FUERA_DE_PLAZO", mensaje: "Ya no puedes cancelar ni reprogramar por aquí. Para cambios, comunícate con el negocio." },
      });
    }
  });

  test("con el límite en 3, la cuarta reprogramación responde 409 con el texto de RN-34", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);
    for (const hora of ["10:00", "10:30", "11:00"]) {
      expect((await json(reprogramar, link, { token: link.token, inicio: alas(hora) })).status).toBe(200);
    }

    const r = await json(reprogramar, link, { token: link.token, inicio: alas("11:30") });

    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      error: {
        codigo: "LIMITE_REPROGRAMACIONES",
        mensaje: "Ya reprogramaste esta cita 3 veces. Para otro cambio, comunícate con el negocio.",
      },
    });
    // Cancelar sigue disponible dentro del plazo (RN-34).
    expect((await json(cancelar, link, { token: link.token })).status).toBe(200);
  });

  test("con el negocio suspendido responde 403 NEGOCIO_SUSPENDIDO, sin mencionar la suscripción (Q-70)", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);
    await db().update(esquema.negocio).set({ estadoSuscripcion: "suspendida" }).where(eq(esquema.negocio.id, n.negocioId));

    const r = await json(cancelar, link, { token: link.token });

    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({
      error: { codigo: "NEGOCIO_SUSPENDIDO", mensaje: "Por ahora no puedes hacer cambios por aquí. Para cambios, comunícate con el negocio." },
    });
  });
});

describe("POST …/disponibilidad (ARCH §18.5)", () => {
  test("responde 200 con el formato de GET …/disponibilidad, privado y sin caché", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);
    const fecha = proximoDiaHabil();

    const r = await json(disponibilidad, link, { token: link.token, desde: fecha, hasta: fecha });

    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    const cuerpo = (await r.json()) as { dias: { fecha: string; inicios: string[] }[] };
    expect(cuerpo).toEqual({ zonaHoraria: "America/Bogota", dias: [{ fecha, inicios: expect.any(Array) }] });
    // La propia cita no ocupa su cupo (RN-14).
    expect(cuerpo.dias[0].inicios).toContain(alas("09:00"));
  });
});

describe("cuerpos inválidos (Q-33; ARCH §19.2)", () => {
  test("un cuerpo que no es JSON, otro tipo o un JSON que no es un objeto responden 422 DATOS_INVALIDOS", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);

    for (const ruta of [cancelar, reprogramar, disponibilidad]) {
      for (const [contenido, tipo] of [
        ["{token:", "application/json"],
        [`token=${link.token}`, "application/x-www-form-urlencoded"],
        [JSON.stringify({ token: link.token }), null],
        ["[1, 2]", "application/json"],
      ] as const) {
        const r = await llamar(ruta, link, contenido, tipo);
        expect(r.status).toBe(422);
        expect(r.headers.get("cache-control")).toBe("private, no-store");
        expect(await codigoDe(r)).toBe("DATOS_INVALIDOS");
      }
    }
  });

  test("ninguna respuesta repite el token", async () => {
    const n = await negocioConAgenda();
    const link = await conLink(n);
    const fecha = proximoDiaHabil();

    const respuestas = [
      await json(disponibilidad, link, { token: link.token, desde: fecha, hasta: fecha }),
      await json(reprogramar, link, { token: link.token, inicio: "no es una fecha" }),
      await json(reprogramar, link, { token: link.token, inicio: alas("10:00") }),
      await json(cancelar, link, { token: link.token }),
      await json(cancelar, link, { token: link.token }),
    ];
    for (const r of respuestas) expect(await r.text()).not.toContain(link.token);
  });
});
