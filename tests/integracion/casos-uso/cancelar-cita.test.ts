import { asc, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { cancelarCita, cancelarCitaDelCliente } from "@/servidor/casos-uso/cancelar-cita";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { tokenDeGestion } from "@/servidor/gestion-cita/firma";
import { negocioConAgenda } from "../fixtures";

// Cancelar una cita, rama del dueño (PAN-06, F-07; RN-10, RN-15, S-06, S-08; Q-55,
// Q-60). "Ahora" es el lunes 4-mar-2030 a las 8:35 a. m. de Bogotá; el negocio tiene el
// recordatorio de D-09, 24 horas antes.

const BOGOTA = "America/Bogota";
const AHORA = localAUtc("2030-03-04", "08:35", BOGOTA);
const DUENO = "user_dueno_prueba";

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const ctx = (n: Negocio) => ({ negocioId: n.negocioId, clerkUserId: DUENO });

/** Una cita manual con correo, a esa hora local, creada `creadaEn`. */
async function cita(n: Negocio, fecha: string, hora: string, creadaEn = AHORA, correo = "ana@mail.com") {
  const creada = await crearCitaManual(
    ctx(n),
    { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", correo, servicioId: n.servicioId, inicio: localAUtc(fecha, hora, BOGOTA).toISOString() },
    creadaEn,
  );
  if (!creada.ok) throw new Error(`La cita de prueba falló: ${creada.error}`);
  return creada.valor.citaId;
}

const citaPorId = async (id: string) => (await db().select().from(esquema.cita).where(eq(esquema.cita.id, id)))[0];
const eventosDe = (citaId: string) =>
  db().select().from(esquema.eventoCita).where(eq(esquema.eventoCita.citaId, citaId)).orderBy(asc(esquema.eventoCita.id));
const notificacionesDe = (citaId: string) =>
  db().select().from(esquema.notificacion).where(eq(esquema.notificacion.citaId, citaId));

describe("cancelarCita del dueño (PAN-06)", () => {
  test("el dueño cancela una cita que empieza en una hora (RN-15): queda cancelada por el dueño, el recordatorio pasa a cancelada y C-03 queda encolado con la clave cancelacion:{citaId}", async () => {
    const n = await negocioConAgenda();
    // Creada el viernes, con su recordatorio para el domingo; ahora es el lunes a las 8:35 y empieza a las 9:30.
    const citaId = await cita(n, "2030-03-04", "09:30", localAUtc("2030-03-01", "10:00", BOGOTA));

    expect(await cancelarCita(ctx(n), { citaId }, AHORA)).toEqual({ ok: true, valor: { citaId } });

    expect(await citaPorId(citaId)).toMatchObject({ estado: "cancelada", canceladaEn: AHORA, canceladaPor: "dueno" });
    expect((await eventosDe(citaId)).map((e) => [e.tipo, e.actor, e.actorId, e.datos])).toEqual([
      ["creada", "dueno", DUENO, {}],
      ["cancelada", "dueno", DUENO, {}],
    ]);
    const filas = await notificacionesDe(citaId);
    expect(filas.find((f) => f.tipo === "recordatorio")).toMatchObject({ estado: "cancelada" });
    expect(filas.find((f) => f.tipo === "cancelacion")).toMatchObject({
      destinatario: "ana@mail.com",
      claveIdempotencia: `cancelacion:${citaId}`,
      programadaPara: AHORA,
      estado: "pendiente",
    });
    // Sin avisos al dueño (S-06).
    const delNegocio = await db().select().from(esquema.notificacion).where(eq(esquema.notificacion.negocioId, n.negocioId));
    expect(delNegocio.filter((f) => f.tipo.startsWith("dueno_"))).toEqual([]);
  });

  test("también cancela una cita que ya empezó (Q-55)", async () => {
    const n = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-04", "09:00");

    expect((await cancelarCita(ctx(n), { citaId }, localAUtc("2030-03-04", "09:10", BOGOTA))).ok).toBe(true);
  });

  test("cancelarla otra vez devuelve ESTADO_INVALIDO y no crea otro evento ni otra notificación (ARCH §18.4: dobles clics)", async () => {
    const n = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-06", "09:00");
    await cancelarCita(ctx(n), { citaId }, AHORA);
    const antes = { cita: await citaPorId(citaId), eventos: await eventosDe(citaId), notificaciones: await notificacionesDe(citaId) };

    expect(await cancelarCita(ctx(n), { citaId }, new Date(AHORA.getTime() + 1000))).toEqual({ ok: false, error: "ESTADO_INVALIDO" });

    expect({ cita: await citaPorId(citaId), eventos: await eventosDe(citaId), notificaciones: await notificacionesDe(citaId) }).toEqual(antes);
  });

  test("una cita completada no se cancela (Q-55)", async () => {
    const n = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-04", "09:00");
    await db().update(esquema.cita).set({ estado: "completada" }).where(eq(esquema.cita.id, citaId));

    expect(await cancelarCita(ctx(n), { citaId }, AHORA)).toEqual({ ok: false, error: "ESTADO_INVALIDO" });
    expect(await citaPorId(citaId)).toMatchObject({ estado: "completada", canceladaEn: null });
  });

  test("sin correo no encola C-03 (S-05)", async () => {
    const n = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-06", "09:00", AHORA, "");

    await cancelarCita(ctx(n), { citaId }, AHORA);

    expect(await notificacionesDe(citaId)).toEqual([]);
  });

  test("una cita de otro negocio o un id que no es un uuid devuelven NO_ENCONTRADO, y la cita no cambia (RN-01)", async () => {
    const n = await negocioConAgenda();
    const otro = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-06", "09:00");

    expect(await cancelarCita(ctx(otro), { citaId }, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await cancelarCita(ctx(n), { citaId: "x" }, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await cancelarCita(ctx(n), {}, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await citaPorId(citaId)).toMatchObject({ estado: "confirmada" });
  });
});

// ─── Rama del cliente, desde el link (GES-02, F-02; RN-10, RN-13, RN-22, D-14, S-08; Q-68) ───

describe("cancelarCitaDelCliente (GES-02)", () => {
  // Reservada el viernes 1 a las 10:00 a. m.; ahora es el lunes 4 a las 8:35 a. m.
  const RESERVADA_EN = localAUtc("2030-03-01", "10:00", BOGOTA);
  const secreto = () => vi.stubEnv("GESTION_CITA_SECRET", "secreto-de-gestion-de-prueba");

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Una reserva pública del cliente a esa hora local, y su link. */
  async function reservaConLink(n: Negocio, fecha: string, hora: string) {
    const r = await reservarCita(
      {
        slug: n.slug,
        sedeId: n.sedeId,
        servicioId: n.servicioId,
        recursoId: null,
        inicio: localAUtc(fecha, hora, BOGOTA).toISOString(),
        nombre: "Ana",
        apellido: "Pérez",
        telefono: "310 555 0199",
        correo: "ana.cliente@mail.com",
        politicaDatosId: n.politicaId,
        aceptaPolitica: true,
        sitioWeb: "",
      },
      RESERVADA_EN,
    );
    if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
    const citaId = r.valor.citaId;
    return { slug: n.slug, citaId, token: await tokenDeGestion({ id: citaId, tokenVersion: 1 }) };
  }

  /** Todo lo que un rechazo no debe cambiar: la cita, su historial y su bandeja de salida. */
  const foto = async (citaId: string) => ({
    cita: await citaPorId(citaId),
    eventos: await eventosDe(citaId),
    notificaciones: (await notificacionesDe(citaId)).map((f) => [f.tipo, f.estado]).sort(),
  });

  test("dentro del plazo, queda cancelada por el cliente, su cupo se libera y quedan encolados C-03 y un solo C-06 (RN-10, RN-22)", async () => {
    secreto();
    const n = await negocioConAgenda();
    // El miércoles 6 a las 9:00: faltan 48 horas, con un plazo de 24.
    const link = await reservaConLink(n, "2030-03-06", "09:00");

    const r = await cancelarCitaDelCliente(link, AHORA);

    expect(r).toEqual({
      ok: true,
      valor: {
        citaId: link.citaId,
        estado: "cancelada",
        inicio: localAUtc("2030-03-06", "09:00", BOGOTA).toISOString(),
        fin: localAUtc("2030-03-06", "09:30", BOGOTA).toISOString(),
        reprogramacionesRestantes: 3,
      },
    });
    expect(await citaPorId(link.citaId)).toMatchObject({ estado: "cancelada", canceladaEn: AHORA, canceladaPor: "cliente" });
    const eventos = await eventosDe(link.citaId);
    expect(eventos.map((e) => [e.tipo, e.actor, e.actorId])).toEqual([
      ["creada", "cliente", null],
      ["cancelada", "cliente", null],
    ]);
    const filas = await notificacionesDe(link.citaId);
    expect(filas.find((f) => f.tipo === "recordatorio")).toMatchObject({ estado: "cancelada" });
    expect(filas.find((f) => f.tipo === "cancelacion")).toMatchObject({
      destinatario: "ana.cliente@mail.com",
      claveIdempotencia: `cancelacion:${link.citaId}`,
      estado: "pendiente",
    });
    const avisos = filas.filter((f) => f.tipo === "dueno_cambio");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({
      destinatario: n.correoDueno,
      claveIdempotencia: `dueno_cambio:${link.citaId}:${eventos[1].id}`,
      datos: { cambio: "cancelada" },
    });

    // El cupo quedó libre: otra reserva entra a la misma hora (RN-10).
    const otra = await reservaConLink(n, "2030-03-06", "09:00");
    expect(otra.citaId).not.toBe(link.citaId);
  });

  test("fuera del plazo devuelve FUERA_DE_PLAZO y no cambia nada (RN-13)", async () => {
    secreto();
    const n = await negocioConAgenda();
    // El lunes 4 a las 2:00 p. m.: faltan 5 horas y media, con un plazo de 24.
    const link = await reservaConLink(n, "2030-03-04", "14:00");
    const antes = await foto(link.citaId);

    expect(await cancelarCitaDelCliente(link, AHORA)).toEqual({ ok: false, error: "FUERA_DE_PLAZO" });
    expect(await foto(link.citaId)).toEqual(antes);
  });

  test("con el negocio suspendido devuelve NEGOCIO_SUSPENDIDO y no cambia nada (D-14)", async () => {
    secreto();
    const n = await negocioConAgenda();
    const link = await reservaConLink(n, "2030-03-06", "09:00");
    await db().update(esquema.negocio).set({ estadoSuscripcion: "suspendida" }).where(eq(esquema.negocio.id, n.negocioId));
    const antes = await foto(link.citaId);

    expect(await cancelarCitaDelCliente(link, AHORA)).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });
    expect(await foto(link.citaId)).toEqual(antes);
  });

  test("cancelada otra vez devuelve ESTADO_INVALIDO y no cambia nada (S-08)", async () => {
    secreto();
    const n = await negocioConAgenda();
    const link = await reservaConLink(n, "2030-03-06", "09:00");
    expect((await cancelarCitaDelCliente(link, AHORA)).ok).toBe(true);
    const antes = await foto(link.citaId);

    expect(await cancelarCitaDelCliente(link, new Date(AHORA.getTime() + 1000))).toEqual({ ok: false, error: "ESTADO_INVALIDO" });
    expect(await foto(link.citaId)).toEqual(antes);
  });

  test("con un token alterado devuelve NO_ENCONTRADO y no cambia nada (RN-13)", async () => {
    secreto();
    const n = await negocioConAgenda();
    const link = await reservaConLink(n, "2030-03-06", "09:00");
    const antes = await foto(link.citaId);
    const alterado = (link.token[0] === "A" ? "B" : "A") + link.token.slice(1);

    expect(await cancelarCitaDelCliente({ ...link, token: alterado }, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await foto(link.citaId)).toEqual(antes);
  });
});
