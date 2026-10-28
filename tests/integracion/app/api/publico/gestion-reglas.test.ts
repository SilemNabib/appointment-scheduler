import { and, eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import PaginaGestion from "@/app/(publico)/[slug]/cita/[citaId]/[token]/page";
import { POST as cancelar } from "@/app/api/publico/[slug]/citas/[citaId]/cancelar/route";
import { POST as disponibilidad } from "@/app/api/publico/[slug]/citas/[citaId]/disponibilidad/route";
import { POST as reprogramar } from "@/app/api/publico/[slug]/citas/[citaId]/reprogramar/route";
import { diaSemana, fechaLocal, localAUtc, sumarDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { verCitaPorLink } from "@/servidor/casos-uso/gestion-cita";
import { moverCita } from "@/servidor/casos-uso/mover-cita";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { tokenDeGestion } from "@/servidor/gestion-cita/firma";
import { crearNegocio, negocioConAgenda, type OpcionesAgenda } from "../../../fixtures";

// Las reglas de la gestión por link, con sus rutas HTTP (RN-13, RN-14, RN-34, D-20; F-02 y
// F-03; T6.34). Las rutas usan la hora real: la cita es a las 9:00 a. m. del próximo día
// hábil después de mañana, dentro del plazo de 24 horas de D-09. Para probar el borde del
// plazo, solo `Date` se simula, en el instante exacto que se quiere.

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;
type Ruta = typeof cancelar;
type Link = { slug: string; citaId: string; token: string };

// La página se dibuja fuera de Next: sin el router de la app, `useRouter` lanza.
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} }),
}));

const HORA = 60 * 60 * 1000;

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Reserva desde la página pública, a la hora local de `alas`, como la hace un cliente. */
function reservar(n: Negocio, hora = "09:00") {
  return reservarCita(
    {
      slug: n.slug,
      sedeId: n.sedeId,
      servicioId: n.servicioId,
      recursoId: null,
      inicio: alas(hora),
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
}

/** Una cita reservada a esa hora y el link de su correo. */
async function citaConLink(n: Negocio, hora: string): Promise<Link> {
  const r = await reservar(n, hora);
  if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
  const { citaId } = r.valor;
  return { slug: n.slug, citaId, token: await tokenDeGestion({ id: citaId, tokenVersion: 1 }) };
}

/** Un negocio con una cita reservada a las 9:00 y el link de su correo. */
async function conLink(opciones: OpcionesAgenda = {}) {
  const n = await negocioConAgenda(opciones);
  return { n, link: await citaConLink(n, "09:00") };
}

/** Fija la hora del servidor, solo para `Date`: las rutas leen `new Date()`. */
function relojEn(instante: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instante));
}

function json(ruta: Ruta, link: Link, cuerpo: Record<string, unknown> = {}) {
  const solicitud = new Request(`http://localhost/api/publico/${link.slug}/citas/${link.citaId}/x`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: link.token, ...cuerpo }),
  });
  return ruta(solicitud, { params: Promise.resolve({ slug: link.slug, citaId: link.citaId }) });
}

const cuerpoDe = async <T>(r: Response) => (await r.json()) as T;
const codigoDe = async (r: Response) => (await cuerpoDe<{ error: { codigo: string } }>(r)).error.codigo;

const filaDe = async (citaId: string) => (await db().select().from(esquema.cita).where(eq(esquema.cita.id, citaId)))[0];

/** El HTML de la página del link, como la ve el cliente (GES-01). */
const paginaDe = async (link: Link) => renderToStaticMarkup(await PaginaGestion({ params: Promise.resolve(link) }));

// ─── RN-13: el plazo y el link ───────────────────────────────────────────────

describe("RN-13: el plazo para actuar por el link", () => {
  test("con un plazo de 24 horas, el link permite cancelar y reprogramar exactamente 24 horas antes del inicio", async () => {
    const { n, link: aLas9 } = await conLink();
    const aLas10 = await citaConLink(n, "10:00");
    // Antes de fijar el reloj: `alas` toma el día de `new Date()`.
    const [nueve, diez, once] = [alas("09:00"), alas("10:00"), alas("11:00")];

    relojEn(Date.parse(nueve) - 24 * HORA);
    const reprogramada = await json(reprogramar, aLas9, { inicio: once });
    relojEn(Date.parse(diez) - 24 * HORA);
    const cancelada = await json(cancelar, aLas10);

    expect(reprogramada.status).toBe(200);
    expect(await cuerpoDe(reprogramada)).toMatchObject({ estado: "confirmada", inicio: once });
    expect(cancelada.status).toBe(200);
    expect(await cuerpoDe(cancelada)).toMatchObject({ estado: "cancelada" });
  });

  test("un segundo después, el servidor rechaza cancelar y reprogramar con FUERA_DE_PLAZO, y la cita no cambia", async () => {
    const { link } = await conLink();
    const antes = await filaDe(link.citaId);
    const [nueve, diez] = [alas("09:00"), alas("10:00")];
    relojEn(Date.parse(nueve) - 24 * HORA + 1000);

    for (const r of [await json(reprogramar, link, { inicio: diez }), await json(cancelar, link)]) {
      expect(r.status).toBe(409);
      expect(await cuerpoDe(r)).toEqual({
        error: { codigo: "FUERA_DE_PLAZO", mensaje: "Ya no puedes cancelar ni reprogramar por aquí. Para cambios, comunícate con el negocio." },
      });
    }
    expect(await filaDe(link.citaId)).toEqual(antes);
  });

  test("un link alterado (token, cita o negocio) devuelve no encontrado y no cambia la cita", async () => {
    const { n, link } = await conLink();
    const otraCita = await citaConLink(n, "10:00");
    const [otroNegocio] = await db()
      .select({ slug: esquema.negocio.slug })
      .from(esquema.negocio)
      .where(eq(esquema.negocio.id, await crearNegocio()));
    const antes = await filaDe(link.citaId);
    const alterados: Link[] = [
      { ...link, token: (link.token[0] === "A" ? "B" : "A") + link.token.slice(1) },
      { ...link, token: link.token.slice(0, -1) },
      { ...link, citaId: otraCita.citaId },
      { ...link, slug: otroNegocio.slug },
    ];

    for (const alterado of alterados) {
      for (const r of [await json(cancelar, alterado), await json(reprogramar, alterado, { inicio: alas("10:00") })]) {
        expect(r.status).toBe(404);
        expect(await codigoDe(r)).toBe("NO_ENCONTRADO");
      }
    }
    expect(await filaDe(link.citaId)).toEqual(antes);
    expect((await filaDe(otraCita.citaId)).estado).toBe("confirmada");
  });
});

// ─── RN-14: reprogramar no crea otra cita ───────────────────────────────────

describe("RN-14: reprogramar conserva la cita", () => {
  test("la cita conserva su id y su código, no aparece otra, y la validación no la cuenta en su propio cupo anterior", async () => {
    // Un servicio de 60 minutos y un consultorio de capacidad 1: de 9:00 a 10:00 pasa a
    // 9:30 a 10:30, que se solapa con su hora anterior. Si se contara, no habría cupo.
    const { n, link } = await conLink({ servicio: { duracionMinutos: 60 } });
    const antes = await filaDe(link.citaId);

    const r = await json(reprogramar, link, { inicio: alas("09:30") });

    expect(r.status).toBe(200);
    expect(await cuerpoDe(r)).toEqual({
      citaId: link.citaId,
      estado: "confirmada",
      inicio: alas("09:30"),
      fin: alas("10:30"),
      reprogramacionesRestantes: 2,
    });
    const citas = await db().select().from(esquema.cita).where(eq(esquema.cita.negocioId, n.negocioId));
    expect(citas.map((c) => c.id)).toEqual([link.citaId]);
    expect(citas[0]).toMatchObject({
      codigo: antes.codigo,
      servicioId: antes.servicioId,
      inicio: new Date(alas("09:30")),
      version: antes.version + 1,
      reprogramacionesCliente: 1,
    });
  });
});

// ─── RN-34 y D-20: el límite de reprogramaciones ────────────────────────────

describe("RN-34: el límite de reprogramaciones del cliente", () => {
  // Cinco transacciones contra Neon: más que el tiempo por defecto de la suite.
  test("con el límite en 3, la cuarta reprogramación se rechaza con el texto de RN-34, y cancelar sigue disponible", { timeout: 60_000 }, async () => {
    const { link } = await conLink();
    const restantes: unknown[] = [];
    for (const hora of ["10:00", "10:30", "11:00"]) {
      const r = await json(reprogramar, link, { inicio: alas(hora) });
      expect(r.status).toBe(200);
      restantes.push((await cuerpoDe<{ reprogramacionesRestantes: number }>(r)).reprogramacionesRestantes);
    }
    expect(restantes).toEqual([2, 1, 0]);

    const cuarta = await json(reprogramar, link, { inicio: alas("11:30") });

    expect(cuarta.status).toBe(409);
    expect(await cuerpoDe(cuarta)).toEqual({
      error: {
        codigo: "LIMITE_REPROGRAMACIONES",
        mensaje: "Ya reprogramaste esta cita 3 veces. Para otro cambio, comunícate con el negocio.",
      },
    });
    expect(await filaDe(link.citaId)).toMatchObject({ inicio: new Date(alas("11:00")), reprogramacionesCliente: 3 });
    // Dentro del plazo, cancelar sigue disponible (RN-34).
    const cancelada = await json(cancelar, link);
    expect(cancelada.status).toBe(200);
    expect(await cuerpoDe(cancelada)).toMatchObject({ estado: "cancelada", reprogramacionesRestantes: 0 });
  });

  test("si el dueño mueve la cita, el cliente conserva las reprogramaciones que le quedan (D-20)", { timeout: 60_000 }, async () => {
    const { n, link } = await conLink();
    expect(await cuerpoDe(await json(reprogramar, link, { inicio: alas("10:00") }))).toMatchObject({ reprogramacionesRestantes: 2 });

    const { version } = await filaDe(link.citaId);
    const movida = await moverCita({ negocioId: n.negocioId, clerkUserId: "user_dueno_prueba" }, { citaId: link.citaId, inicio: alas("11:00"), version }, new Date());
    expect(movida.ok).toBe(true);

    expect(await filaDe(link.citaId)).toMatchObject({ inicio: new Date(alas("11:00")), reprogramacionesCliente: 1 });
    const vista = await verCitaPorLink(link, new Date());
    expect(vista.ok && vista.valor.acciones).toMatchObject({ reprogramar: { permitida: true }, reprogramacionesRestantes: 2 });
    expect(await cuerpoDe(await json(reprogramar, link, { inicio: alas("10:30") }))).toMatchObject({ reprogramacionesRestantes: 1 });
  });

  test("con el límite en 0, el link no ofrece «Reprogramar» y el servidor lo rechaza; cancelar sigue disponible (D-20)", async () => {
    const { link } = await conLink({ reglas: { maxReprogramacionesCliente: 0 } });
    const fecha = proximoDiaHabil();

    const html = await paginaDe(link);

    expect(html).not.toMatch(/>Reprogramar<\/button>/);
    expect(html).not.toContain("Te quedan");
    expect(html).toMatch(/>Cancelar cita<\/button>/);
    for (const r of [
      await json(reprogramar, link, { inicio: alas("10:00") }),
      await json(disponibilidad, link, { desde: fecha, hasta: fecha }),
    ]) {
      expect(r.status).toBe(409);
      expect(await codigoDe(r)).toBe("LIMITE_REPROGRAMACIONES");
    }
    expect((await filaDe(link.citaId)).inicio).toEqual(new Date(alas("09:00")));
  });

  test("con el límite en 3, la página ofrece «Reprogramar» con las que le quedan", async () => {
    const { link } = await conLink();

    const html = await paginaDe(link);

    expect(html).toMatch(/>Reprogramar<\/button>/);
    expect(html).toContain("Te quedan 3 de 3 reprogramaciones.");
  });
});

// ─── F-02, paso 4: cancelar desde el link ───────────────────────────────────

describe("F-02: cancelar desde el link", () => {
  test("libera el cupo, anula el recordatorio y encola C-03 al cliente y C-06 al dueño", async () => {
    const { n, link } = await conLink();
    // Con el consultorio de capacidad 1, la hora está ocupada.
    expect(await reservar(n)).toMatchObject({ ok: false, error: "HORARIO_NO_DISPONIBLE" });
    const notificacionesDe = () =>
      db()
        .select()
        .from(esquema.notificacion)
        .where(and(eq(esquema.notificacion.negocioId, n.negocioId), eq(esquema.notificacion.citaId, link.citaId)));
    expect((await notificacionesDe()).find((x) => x.tipo === "recordatorio")).toMatchObject({ estado: "pendiente" });

    const r = await json(cancelar, link);

    expect(r.status).toBe(200);
    const filas = await notificacionesDe();
    const deTipo = (tipo: string) => filas.filter((x) => x.tipo === tipo);
    expect(deTipo("recordatorio")).toEqual([expect.objectContaining({ estado: "cancelada" })]);
    expect(deTipo("cancelacion")).toEqual([expect.objectContaining({ estado: "pendiente", destinatario: "ana.cliente@mail.com" })]);
    expect(deTipo("dueno_cambio")).toEqual([
      expect.objectContaining({ estado: "pendiente", destinatario: n.correoDueno, datos: { cambio: "cancelada" } }),
    ]);
    // El cupo quedó libre: otro cliente reserva la misma hora.
    expect(await reservar(n)).toMatchObject({ ok: true });
  });
});
