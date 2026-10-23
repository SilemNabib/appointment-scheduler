import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { reprogramarCita } from "@/servidor/casos-uso/reprogramar-cita";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { tokenDeGestion } from "@/servidor/gestion-cita/firma";
import { negocioConAgenda } from "../fixtures";

// Reprogramar desde el link (GES-03, F-03; RN-09, RN-13, RN-14, RN-22, RN-34, D-14; ARCH
// §14.1, §18.3 y §18.4; Q-68, Q-69). "Ahora" es el viernes 1-mar-2030 a las 10:00 a. m.
// de Bogotá; la cita, el miércoles 6 a las 9:00 a. m., con las reglas de D-09: plazo de 24
// horas, anticipación mínima de 2 horas y límite de 3 reprogramaciones.

const BOGOTA = "America/Bogota";
const AHORA = localAUtc("2030-03-01", "10:00", BOGOTA);
const local = (fecha: string, hora: string) => localAUtc(fecha, hora, BOGOTA);

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

beforeEach(() => {
  vi.stubEnv("GESTION_CITA_SECRET", "secreto-de-gestion-de-prueba");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function reservaConLink(n: Negocio, fecha = "2030-03-06", hora = "09:00") {
  const r = await reservarCita(
    {
      slug: n.slug,
      sedeId: n.sedeId,
      servicioId: n.servicioId,
      recursoId: null,
      inicio: local(fecha, hora).toISOString(),
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "310 555 0199",
      correo: "ana.cliente@mail.com",
      politicaDatosId: n.politicaId,
      aceptaPolitica: true,
      sitioWeb: "",
    },
    AHORA,
  );
  if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
  const { citaId, codigo } = r.valor;
  return { slug: n.slug, citaId, codigo, token: await tokenDeGestion({ id: citaId, tokenVersion: 1 }) };
}

const citaPorId = async (id: string) => (await db().select().from(esquema.cita).where(eq(esquema.cita.id, id)))[0];
const eventosDe = (citaId: string) =>
  db().select().from(esquema.eventoCita).where(eq(esquema.eventoCita.citaId, citaId)).orderBy(asc(esquema.eventoCita.id));
const notificacionesDe = (citaId: string) => db().select().from(esquema.notificacion).where(eq(esquema.notificacion.citaId, citaId));
const citasDelNegocio = (negocioId: string) => db().select({ id: esquema.cita.id }).from(esquema.cita).where(eq(esquema.cita.negocioId, negocioId));

/** Todo lo que un rechazo no debe cambiar. */
const foto = async (n: Negocio, citaId: string) => ({
  cita: await citaPorId(citaId),
  eventos: await eventosDe(citaId),
  notificaciones: (await notificacionesDe(citaId)).map((f) => [f.tipo, f.estado, f.claveIdempotencia]).sort(),
  citas: (await citasDelNegocio(n.negocioId)).length,
});

describe("reprogramarCita (GES-03, F-03)", () => {
  test("conserva el id, el código y el servicio, y suben version y reprogramaciones_cliente (RN-14, RN-34)", async () => {
    const n = await negocioConAgenda();
    const link = await reservaConLink(n);
    const antes = await citaPorId(link.citaId);
    const nuevo = local("2030-03-07", "10:00");

    const r = await reprogramarCita({ ...link, inicio: nuevo.toISOString() }, AHORA);

    expect(r).toEqual({
      ok: true,
      valor: {
        citaId: link.citaId,
        estado: "confirmada",
        inicio: nuevo.toISOString(),
        fin: local("2030-03-07", "10:30").toISOString(),
        reprogramacionesRestantes: 2,
      },
    });
    const despues = await citaPorId(link.citaId);
    expect(despues).toMatchObject({
      id: link.citaId,
      codigo: link.codigo,
      servicioId: antes.servicioId,
      inicio: nuevo,
      version: antes.version + 1,
      reprogramacionesCliente: antes.reprogramacionesCliente + 1,
    });
    // No aparece ninguna cita nueva (RN-14).
    expect(await citasDelNegocio(n.negocioId)).toHaveLength(1);
  });

  test("rehace el recordatorio y encola C-04 y un solo C-06 con la hora anterior y la nueva (RN-22; Q-68)", async () => {
    const n = await negocioConAgenda();
    const link = await reservaConLink(n);
    const anterior = local("2030-03-06", "09:00");
    const nuevo = local("2030-03-07", "10:00");

    expect((await reprogramarCita({ ...link, inicio: nuevo.toISOString() }, AHORA)).ok).toBe(true);

    const eventos = await eventosDe(link.citaId);
    expect(eventos.map((e) => [e.tipo, e.actor])).toEqual([
      ["creada", "cliente"],
      ["reprogramada", "cliente"],
    ]);
    const filas = await notificacionesDe(link.citaId);
    const porClave = (clave: string) => filas.find((f) => f.claveIdempotencia === clave);
    expect(porClave(`recordatorio:${link.citaId}:v1`)).toMatchObject({ estado: "cancelada" });
    expect(porClave(`recordatorio:${link.citaId}:v2`)).toMatchObject({ estado: "pendiente", datos: { version: 2 } });
    expect(porClave(`reprogramacion:${link.citaId}:v2`)).toMatchObject({
      destinatario: "ana.cliente@mail.com",
      datos: { version: 2, inicio_anterior: anterior.toISOString() },
    });
    const avisos = filas.filter((f) => f.tipo === "dueno_cambio");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({
      destinatario: n.correoDueno,
      claveIdempotencia: `dueno_cambio:${link.citaId}:${eventos[1].id}`,
      datos: { cambio: "reprogramada", inicio_anterior: anterior.toISOString(), inicio_nuevo: nuevo.toISOString() },
    });
  });

  test("con el límite alcanzado devuelve LIMITE_REPROGRAMACIONES y no cambia nada (RN-34)", async () => {
    const n = await negocioConAgenda();
    const link = await reservaConLink(n);
    await db().update(esquema.cita).set({ reprogramacionesCliente: 3 }).where(eq(esquema.cita.id, link.citaId));
    const antes = await foto(n, link.citaId);

    expect(await reprogramarCita({ ...link, inicio: local("2030-03-07", "10:00").toISOString() }, AHORA)).toEqual({
      ok: false,
      error: "LIMITE_REPROGRAMACIONES",
    });
    expect(await foto(n, link.citaId)).toEqual(antes);
  });

  test("fuera del plazo devuelve FUERA_DE_PLAZO y no cambia nada (RN-13)", async () => {
    const n = await negocioConAgenda();
    const link = await reservaConLink(n);
    const antes = await foto(n, link.citaId);
    // Un milisegundo después de inicio − 24 h.
    const tarde = new Date(local("2030-03-05", "09:00").getTime() + 1);

    expect(await reprogramarCita({ ...link, inicio: local("2030-03-07", "10:00").toISOString() }, tarde)).toEqual({
      ok: false,
      error: "FUERA_DE_PLAZO",
    });
    expect(await foto(n, link.citaId)).toEqual(antes);
  });

  test("con una hora dentro de la anticipación mínima devuelve HORARIO_NO_DISPONIBLE y no cambia nada (RN-09)", async () => {
    const n = await negocioConAgenda();
    const link = await reservaConLink(n);
    const antes = await foto(n, link.citaId);

    // El viernes a las 11:00, una hora después de ahora, con una anticipación mínima de 2.
    const r = await reprogramarCita({ ...link, inicio: local("2030-03-01", "11:00").toISOString() }, AHORA);

    expect(r).toEqual(expect.objectContaining({ ok: false, error: "HORARIO_NO_DISPONIBLE" }));
    expect(await foto(n, link.citaId)).toEqual(antes);
  });

  test("con el negocio suspendido devuelve NEGOCIO_SUSPENDIDO y no cambia nada (D-14)", async () => {
    const n = await negocioConAgenda();
    const link = await reservaConLink(n);
    await db().update(esquema.negocio).set({ estadoSuscripcion: "suspendida" }).where(eq(esquema.negocio.id, n.negocioId));
    const antes = await foto(n, link.citaId);

    expect(await reprogramarCita({ ...link, inicio: local("2030-03-07", "10:00").toISOString() }, AHORA)).toEqual({
      ok: false,
      error: "NEGOCIO_SUSPENDIDO",
    });
    expect(await foto(n, link.citaId)).toEqual(antes);
  });

  test("con un link alterado devuelve NO_ENCONTRADO, y con un inicio que no es ISO, DATOS_INVALIDOS", async () => {
    const n = await negocioConAgenda();
    const link = await reservaConLink(n);
    const antes = await foto(n, link.citaId);
    const alterado = (link.token[0] === "A" ? "B" : "A") + link.token.slice(1);

    expect(await reprogramarCita({ ...link, token: alterado, inicio: local("2030-03-07", "10:00").toISOString() }, AHORA)).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
    expect(await reprogramarCita({ ...link, inicio: "el jueves" }, AHORA)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect(await foto(n, link.citaId)).toEqual(antes);
  });
});
