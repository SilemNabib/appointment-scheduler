import { asc, eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import { buscarCodigoPanel } from "@/app/(panel)/panel/agenda/acciones";
import { eliminarBloqueoPanel } from "@/app/(panel)/panel/bloqueos/acciones";
import { generarEnlaceCalendarioPanel } from "@/app/(panel)/panel/calendario/acciones";
import {
  cancelarCitaPanel,
  horasParaMoverPanel,
  marcarAsistenciaPanel,
  moverCitaPanel,
} from "@/app/(panel)/panel/citas/[id]/acciones";
import { buscarClientesPanel } from "@/app/(panel)/panel/citas/nueva/acciones";
import { guardarContactosNegocio } from "@/app/(panel)/panel/configuracion/negocio/acciones";
import {
  activarServicioPanel,
  desactivarServicioPanel,
  guardarServicioPanel,
} from "@/app/(panel)/panel/configuracion/servicios/acciones";
import { GET as calendario } from "@/app/api/calendario/[enlaceId]/[token]/route";
import { diaSemana, fechaLocal, localAUtc, sumarDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { requireMiembro } from "@/servidor/auth/sesion";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { buscarCitaPorCodigo, detalleCita } from "@/servidor/casos-uso/detalle-cita";
import { buscarClientes } from "@/servidor/casos-uso/clientes";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearBloqueo } from "@/servidor/casos-uso/bloqueos";
import { generarEnlaceCalendario } from "@/servidor/casos-uso/enlace-calendario";
import { guardarHorarioSemanal } from "@/servidor/casos-uso/horario";
import { desactivarServicio, guardarServicio } from "@/servidor/casos-uso/servicios";
import { HORARIO_LABORAL, negocioConAgenda, sesionDeDueno } from "../../fixtures";

// Un dueño no alcanza datos de otro negocio por las Server Actions de la fase que
// reciben identificadores del cliente (RN-01; ARCH §6 y §20, Multi-negocio). Clerk se
// simula: la sesión es la del dueño de A, y los datos son de B.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** Negocio B con un servicio activo, uno inactivo y un bloqueo; después, la sesión de A. */
async function negocioBYSesionDeA() {
  const { negocioId: negocioB } = await sesionDeDueno();
  const crear = async (nombre: string) => {
    const r = await guardarServicio({ negocioId: negocioB }, { nombre, duracionMinutos: "30" });
    if (!r.ok) throw new Error(r.error);
    return r.valor.id;
  };
  const activo = await crear("Examen visual");
  const inactivo = await crear("Lentes de contacto");
  await desactivarServicio({ negocioId: negocioB }, inactivo);
  const bloqueo = await crearBloqueo({ negocioId: negocioB }, { tipo: "dia", fecha: "2030-03-05" });
  if (!bloqueo.ok) throw new Error(bloqueo.error);

  const { negocioId: negocioA } = await sesionDeDueno(); // la sesión queda en el dueño de A
  return { negocioA, negocioB, activo, inactivo, bloqueoId: bloqueo.valor.id };
}

/** Ordenados por id: sin `ORDER BY`, Postgres puede devolverlos en otro orden después de un `UPDATE`. */
const serviciosDe = (negocioId: string) =>
  db().select().from(esquema.servicio).where(eq(esquema.servicio.negocioId, negocioId)).orderBy(asc(esquema.servicio.id));

describe("multi-negocio en las Server Actions del panel", () => {
  test("desde la sesión del dueño de A, editar, activar o desactivar un servicio de B devuelve NO_ENCONTRADO, y B no cambia (RN-01)", async () => {
    const { negocioA, negocioB, activo, inactivo } = await negocioBYSesionDeA();
    const antes = await serviciosDe(negocioB);

    const edicion = new FormData();
    for (const [campo, valor] of Object.entries({ id: activo, nombre: "Cambiado", duracionMinutos: "60", bufferMinutos: "0" })) {
      edicion.set(campo, valor);
    }
    expect(await guardarServicioPanel(edicion)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await activarServicioPanel(inactivo)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await desactivarServicioPanel(activo)).toEqual({ ok: false, error: "NO_ENCONTRADO" });

    expect(await serviciosDe(negocioB)).toEqual(antes);
    expect(await serviciosDe(negocioA)).toEqual([]);
  });

  test("desde la sesión de A, eliminar un bloqueo de B devuelve NO_ENCONTRADO, y el bloqueo sigue (RN-01)", async () => {
    const { bloqueoId } = await negocioBYSesionDeA();

    expect(await eliminarBloqueoPanel(bloqueoId)).toEqual({ ok: false, error: "NO_ENCONTRADO" });

    const quedan = await db().select().from(esquema.bloqueo).where(eq(esquema.bloqueo.id, bloqueoId));
    expect(quedan).toHaveLength(1);
  });

  test("desde la sesión de A, guardar contactos cambia los de A y no los de B (RN-01; D-29)", async () => {
    const { negocioA, negocioB } = await negocioBYSesionDeA();
    const contactosDe = (negocioId: string) =>
      db().select().from(esquema.contactoSede).where(eq(esquema.contactoSede.negocioId, negocioId));
    const antesB = await contactosDe(negocioB);
    expect(antesB).toHaveLength(1); // el teléfono del alta

    expect(await guardarContactosNegocio({ contactos: [{ tipo: "correo", valor: "a@negocio-a.com" }] })).toEqual({
      ok: true,
      valor: undefined,
    });

    expect(await contactosDe(negocioB)).toEqual(antesB);
    expect(await contactosDe(negocioA)).toEqual([expect.objectContaining({ tipo: "correo", valor: "a@negocio-a.com" })]);
  });

  test("desde la sesión de A, ver, mover, cancelar o marcar una cita de B devuelve NO_ENCONTRADO, y la cita de B no cambia (RN-01)", async () => {
    const { b, citaId } = await citaDeBYSesionDeA();
    const citaDeB = () => db().select().from(esquema.cita).where(eq(esquema.cita.id, citaId));
    const eventosDeB = () => db().select().from(esquema.eventoCita).where(eq(esquema.eventoCita.citaId, citaId));
    const antes = { cita: await citaDeB(), eventos: await eventosDeB() };
    const ctx = await requireMiembro();
    expect(ctx.negocioId).not.toBe(b.negocioId);

    expect(await detalleCita(ctx, citaId, new Date())).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await moverCitaPanel({ citaId, inicio: localAUtc("2030-03-05", "10:00", "America/Bogota").toISOString(), version: 1 })).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
    expect(await cancelarCitaPanel(citaId)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await marcarAsistenciaPanel({ citaId, estado: "completada", estadoEsperado: "confirmada" })).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
    // Las horas para mover usan el servicio de la sesión: el de B no se ofrece en A.
    expect(await horasParaMoverPanel({ servicioId: b.servicioId, fecha: "2030-03-04", citaExcluida: citaId })).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });

    expect({ cita: await citaDeB(), eventos: await eventosDeB() }).toEqual(antes);
  });

  test("desde la sesión de A, buscarClientes y la búsqueda por código no devuelven datos de B (RN-01)", async () => {
    const { codigo } = await citaDeBYSesionDeA();
    const ctx = await requireMiembro();

    expect(await buscarClientesPanel("300 123 4567")).toEqual([]);
    expect(await buscarClientesPanel("Pérez")).toEqual([]);
    expect(await buscarClientes(ctx, "Ana")).toEqual([]);
    expect(await buscarCodigoPanel(codigo)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await buscarCitaPorCodigo(ctx, codigo)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
  });

  test("el enlace de calendario de A no trae citas de B, y su token no sirve con el id del enlace de B (RN-01; ARCH §14.7)", async () => {
    vi.stubEnv("CALENDARIO_SECRET", "secreto-del-calendario-de-prueba");
    vi.stubEnv("APP_URL", "https://agenda.example.com");
    // B, con una cita y su propio enlace.
    const b = await negocioConAgenda();
    const citaDeB = await citaCercana(b.negocioId, b.servicioId, "user_dueno_b");
    const enlaceB = await generarEnlaceCalendario({ negocioId: b.negocioId, clerkUserId: "user_dueno_b", suscripcion: { estado: "al_dia" } }, new Date());
    if (!enlaceB.ok) throw new Error(enlaceB.error);
    // A, con la sesión de su dueño, su cita y el enlace que crea desde "Mi calendario".
    const { negocioId: negocioA, clerkUserId } = await sesionDeDueno();
    const servicioA = await guardarServicio({ negocioId: negocioA }, { nombre: "Examen visual", duracionMinutos: "30" });
    if (!servicioA.ok) throw new Error(servicioA.error);
    await guardarHorarioSemanal({ negocioId: negocioA }, { franjas: HORARIO_LABORAL });
    const citaDeA = await citaCercana(negocioA, servicioA.valor.id, clerkUserId);
    const enlaceA = await generarEnlaceCalendarioPanel();
    if (!enlaceA.ok) throw new Error(enlaceA.error);
    const [a, deB] = [partesDelEnlace(enlaceA.valor.https), partesDelEnlace(enlaceB.valor.https)];

    const r = await pedirCalendario(a);

    expect(r.status).toBe(200);
    const ics = (await r.text()).replace(/\r\n /g, "");
    expect(ics).toContain(`UID:${citaDeA}@agenda-citas`);
    expect(ics).not.toContain(citaDeB);
    for (const mezcla of [
      { enlaceId: deB.enlaceId, token: a.token },
      { enlaceId: a.enlaceId, token: deB.token },
    ]) {
      expect((await pedirCalendario(mezcla)).status).toBe(404);
    }
    // Con su propio token, el de B sí responde, y trae solo su cita.
    const propio = await (await pedirCalendario(deB)).text();
    expect(propio).toContain(citaDeB);
    expect(propio).not.toContain(citaDeA);
    vi.unstubAllEnvs();
  });
});

/** Una cita manual del próximo día hábil después de mañana a las 9:00: el enlace sirve las citas cercanas a la hora real (ARCH §14.7). */
async function citaCercana(negocioId: string, servicioId: string, clerkUserId: string) {
  let fecha = sumarDias(fechaLocal(new Date(), ZONA_HORARIA_POR_DEFECTO), 2);
  while (diaSemana(fecha) > 5) fecha = sumarDias(fecha, 1);
  const creada = await crearCitaManual(
    { negocioId, clerkUserId },
    {
      nombre: "Luis",
      apellido: "Gómez",
      telefono: "311 555 0100",
      correo: "",
      servicioId,
      inicio: localAUtc(fecha, "09:00", ZONA_HORARIA_POR_DEFECTO).toISOString(),
    },
    new Date(),
  );
  if (!creada.ok) throw new Error(creada.error);
  return creada.valor.citaId;
}

/** El id y el token de un enlace, desde su URL `https://…/api/calendario/{id}/{token}`. */
function partesDelEnlace(url: string) {
  const [, enlaceId, token] = /\/api\/calendario\/([^/]+)\/([^/]+)$/.exec(url)!;
  return { enlaceId, token };
}

const pedirCalendario = (enlace: { enlaceId: string; token: string }) =>
  calendario(new Request(`http://localhost/api/calendario/${enlace.enlaceId}/${enlace.token}`), { params: Promise.resolve(enlace) });

/** Negocio B con una cita manual de Ana Pérez el lunes 4-mar-2030 a las 9:00; después, la sesión de A. */
async function citaDeBYSesionDeA() {
  const b = await negocioConAgenda();
  const creada = await crearCitaManual(
    { negocioId: b.negocioId, clerkUserId: "user_dueno_b" },
    {
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "300 123 4567",
      correo: "ana@mail.com",
      servicioId: b.servicioId,
      inicio: localAUtc("2030-03-04", "09:00", "America/Bogota").toISOString(),
    },
    localAUtc("2030-03-01", "10:00", "America/Bogota"),
  );
  if (!creada.ok) throw new Error(creada.error);
  await sesionDeDueno(); // la sesión queda en el dueño de A
  return { b, citaId: creada.valor.citaId, codigo: creada.valor.codigo };
}
