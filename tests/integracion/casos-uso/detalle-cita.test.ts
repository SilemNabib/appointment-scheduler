import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import type { EstadoEfectivo } from "@/dominio/suscripcion";
import { localAUtc } from "@/dominio/tiempo";
import { cancelarCita } from "@/servidor/casos-uso/cancelar-cita";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { detalleCita } from "@/servidor/casos-uso/detalle-cita";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../fixtures";

// Detalle de la cita (PAN-03, PAN-05 a PAN-07; RN-01, RN-16, D-14, S-08; Q-55). La cita
// es del lunes 4-mar-2030 a las 9:00 a. m. de Bogotá.

const BOGOTA = "America/Bogota";
const INICIO = localAUtc("2030-03-04", "09:00", BOGOTA);
const ANTES = localAUtc("2030-03-04", "08:35", BOGOTA);
const DUENO = "user_dueno_prueba";
const AL_DIA: EstadoEfectivo = { estado: "al_dia" };

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const ctx = (n: Negocio, suscripcion: EstadoEfectivo = AL_DIA) => ({ negocioId: n.negocioId, clerkUserId: DUENO, suscripcion });

async function conCita() {
  const n = await negocioConAgenda();
  const creada = await crearCitaManual(
    ctx(n),
    { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", correo: "ana@mail.com", servicioId: n.servicioId, inicio: INICIO.toISOString() },
    ANTES,
  );
  if (!creada.ok) throw new Error(`La cita de prueba falló: ${creada.error}`);
  return { n, citaId: creada.valor.citaId, codigo: creada.valor.codigo };
}

describe("detalleCita (PAN-03)", () => {
  test("trae la cita con su código, servicio, horas, estado, version, la instantánea del cliente y el historial", async () => {
    const { n, citaId, codigo } = await conCita();
    // El cliente cambia después: el detalle muestra lo de la reserva (RN-18.3).
    await db().update(esquema.cliente).set({ nombre: "Otra" }).where(eq(esquema.cliente.negocioId, n.negocioId));

    const resultado = await detalleCita(ctx(n), citaId, ANTES);

    expect(resultado).toEqual({
      ok: true,
      valor: {
        id: citaId,
        codigo,
        servicioId: n.servicioId,
        servicio: "Examen visual",
        inicio: INICIO,
        fin: new Date(INICIO.getTime() + 30 * 60 * 1000),
        estado: "confirmada",
        version: 1,
        origen: "panel",
        cliente: { nombre: "Ana", apellido: "Pérez", telefono: "+573001234567", correo: "ana@mail.com" },
        zonaHoraria: BOGOTA,
        historial: [expect.objectContaining({ texto: "Creada por ti", autor: "tu" })],
        acciones: { mover: true, cancelar: true, marcar: false },
      },
    });
  });

  test("una reserva pública dice en el historial que la reservó el cliente", async () => {
    const n = await negocioConAgenda();
    const reservada = await reservarCita(
      {
        slug: n.slug,
        sedeId: n.sedeId,
        servicioId: n.servicioId,
        inicio: localAUtc("2030-03-05", "09:00", BOGOTA).toISOString(),
        nombre: "Ana",
        apellido: "Pérez",
        telefono: "300 123 4567",
        correo: "ana@mail.com",
        politicaDatosId: n.politicaId,
        aceptaPolitica: true,
      },
      localAUtc("2030-03-01", "10:00", BOGOTA),
    );
    if (!reservada.ok) throw new Error(reservada.error);

    const resultado = await detalleCita(ctx(n), reservada.valor.citaId, ANTES);

    expect(resultado.ok && resultado.valor.historial.map((l) => l.texto)).toEqual(["Reservada por el cliente"]);
    expect(resultado.ok && resultado.valor.origen).toBe("publico");
  });

  test("una cita de otro negocio o un id que no es un uuid devuelven NO_ENCONTRADO (RN-01; ARCH §6, defensa 3)", async () => {
    const { citaId } = await conCita();
    const otro = await negocioConAgenda();

    expect(await detalleCita(ctx(otro), citaId, ANTES)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await detalleCita(ctx(otro), "no-es-un-uuid", ANTES)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await detalleCita(ctx(otro), crypto.randomUUID(), ANTES)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
  });

  test("antes del inicio, las acciones no incluyen la asistencia; desde el inicio, sí (RN-16)", async () => {
    const { n, citaId } = await conCita();

    const antes = await detalleCita(ctx(n), citaId, new Date(INICIO.getTime() - 1));
    const desde = await detalleCita(ctx(n), citaId, INICIO);

    expect(antes.ok && antes.valor.acciones).toEqual({ mover: true, cancelar: true, marcar: false });
    expect(desde.ok && desde.valor.acciones).toEqual({ mover: true, cancelar: true, marcar: true });
  });

  test("una cita completada solo se corrige (S-09); una cancelada no tiene acciones (S-08)", async () => {
    const { n, citaId } = await conCita();
    await db().update(esquema.cita).set({ estado: "completada" }).where(eq(esquema.cita.id, citaId));
    const completada = await detalleCita(ctx(n), citaId, INICIO);
    expect(completada.ok && completada.valor.acciones).toEqual({ mover: false, cancelar: false, marcar: true });

    const otra = await conCita();
    await cancelarCita(ctx(otra.n), { citaId: otra.citaId }, ANTES);
    const cancelada = await detalleCita(ctx(otra.n), otra.citaId, INICIO);
    expect(cancelada.ok && cancelada.valor).toMatchObject({
      estado: "cancelada",
      acciones: { mover: false, cancelar: false, marcar: false },
      historial: [expect.objectContaining({ texto: "Creada por ti" }), expect.objectContaining({ texto: "Cancelada por ti" })],
    });
  });

  test("con el negocio suspendido, el detalle se lee y no tiene acciones (D-14)", async () => {
    const { n, citaId } = await conCita();

    const resultado = await detalleCita(ctx(n, { estado: "suspendida" }), citaId, INICIO);

    expect(resultado.ok && resultado.valor).toMatchObject({ id: citaId, acciones: { mover: false, cancelar: false, marcar: false } });
  });
});
