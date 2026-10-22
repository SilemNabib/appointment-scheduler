import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { cancelarCita } from "@/servidor/casos-uso/cancelar-cita";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { marcarAsistencia } from "@/servidor/casos-uso/marcar-asistencia";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../fixtures";

// Marcar la asistencia (PAN-07, F-08; RN-16, S-08, S-09; Q-55). La cita es del lunes
// 4-mar-2030 a las 9:00 a. m. de Bogotá, creada a las 8:35 con correo.

const BOGOTA = "America/Bogota";
const CREADA_EN = localAUtc("2030-03-04", "08:35", BOGOTA);
const INICIO = localAUtc("2030-03-04", "09:00", BOGOTA);
const DESPUES = localAUtc("2030-03-04", "09:10", BOGOTA);
const DUENO = "user_dueno_prueba";

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const ctx = (n: Negocio) => ({ negocioId: n.negocioId, clerkUserId: DUENO });

async function conCita() {
  const n = await negocioConAgenda();
  const creada = await crearCitaManual(
    ctx(n),
    { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", correo: "ana@mail.com", servicioId: n.servicioId, inicio: INICIO.toISOString() },
    CREADA_EN,
  );
  if (!creada.ok) throw new Error(`La cita de prueba falló: ${creada.error}`);
  return { n, citaId: creada.valor.citaId };
}

const estadoDe = async (citaId: string) => (await db().select().from(esquema.cita).where(eq(esquema.cita.id, citaId)))[0].estado;
const eventosDe = (citaId: string) =>
  db().select().from(esquema.eventoCita).where(eq(esquema.eventoCita.citaId, citaId)).orderBy(asc(esquema.eventoCita.id));
const notificacionesDe = (citaId: string) =>
  db().select().from(esquema.notificacion).where(eq(esquema.notificacion.citaId, citaId));

describe("marcarAsistencia (PAN-07)", () => {
  test("antes del inicio devuelve ANTES_DEL_INICIO; en el instante del inicio, marca (RN-16)", async () => {
    const { n, citaId } = await conCita();
    const entrada = { citaId, estado: "completada", estadoEsperado: "confirmada" };

    expect(await marcarAsistencia(ctx(n), entrada, new Date(INICIO.getTime() - 1))).toEqual({ ok: false, error: "ANTES_DEL_INICIO" });
    expect(await estadoDe(citaId)).toBe("confirmada");

    expect(await marcarAsistencia(ctx(n), entrada, INICIO)).toEqual({ ok: true, valor: { citaId } });
    expect(await estadoDe(citaId)).toBe("completada");
    expect((await eventosDe(citaId)).at(-1)).toMatchObject({ tipo: "completada", actor: "dueno", actorId: DUENO, datos: {} });
  });

  test("de confirmada a no_asistio deja el evento no_asistio", async () => {
    const { n, citaId } = await conCita();

    await marcarAsistencia(ctx(n), { citaId, estado: "no_asistio", estadoEsperado: "confirmada" }, DESPUES);

    expect(await estadoDe(citaId)).toBe("no_asistio");
    expect((await eventosDe(citaId)).at(-1)).toMatchObject({ tipo: "no_asistio", datos: {} });
  });

  test("pasar de completada a no_asistio deja el evento estado_corregido con { de, a } (S-09)", async () => {
    const { n, citaId } = await conCita();
    await marcarAsistencia(ctx(n), { citaId, estado: "completada", estadoEsperado: "confirmada" }, DESPUES);

    expect(await marcarAsistencia(ctx(n), { citaId, estado: "no_asistio", estadoEsperado: "completada" }, DESPUES)).toEqual({
      ok: true,
      valor: { citaId },
    });

    expect(await estadoDe(citaId)).toBe("no_asistio");
    expect((await eventosDe(citaId)).map((e) => [e.tipo, e.datos])).toEqual([
      ["creada", {}],
      ["completada", {}],
      ["estado_corregido", { de: "completada", a: "no_asistio" }],
    ]);
  });

  test("una cita cancelada devuelve ESTADO_INVALIDO (S-08)", async () => {
    const { n, citaId } = await conCita();
    await cancelarCita(ctx(n), { citaId }, DESPUES);

    expect(await marcarAsistencia(ctx(n), { citaId, estado: "completada", estadoEsperado: "confirmada" }, DESPUES)).toEqual({
      ok: false,
      error: "ESTADO_INVALIDO",
    });
    expect(await estadoDe(citaId)).toBe("cancelada");
  });

  test("un estadoEsperado que ya no es el actual devuelve ESTADO_INVALIDO y no cambia nada (Q-55)", async () => {
    const { n, citaId } = await conCita();
    await marcarAsistencia(ctx(n), { citaId, estado: "completada", estadoEsperado: "confirmada" }, DESPUES);
    const eventos = await eventosDe(citaId);

    // Un doble clic: el segundo todavía cree que está confirmada.
    expect(await marcarAsistencia(ctx(n), { citaId, estado: "no_asistio", estadoEsperado: "confirmada" }, DESPUES)).toEqual({
      ok: false,
      error: "ESTADO_INVALIDO",
    });
    // Marcar lo que ya tiene no es una transición.
    expect(await marcarAsistencia(ctx(n), { citaId, estado: "completada", estadoEsperado: "completada" }, DESPUES)).toEqual({
      ok: false,
      error: "ESTADO_INVALIDO",
    });
    expect(await estadoDe(citaId)).toBe("completada");
    expect(await eventosDe(citaId)).toEqual(eventos);
  });

  test("no encola ninguna notificación (F-08, paso 5)", async () => {
    const { n, citaId } = await conCita();
    const antes = await notificacionesDe(citaId);

    await marcarAsistencia(ctx(n), { citaId, estado: "completada", estadoEsperado: "confirmada" }, DESPUES);
    await marcarAsistencia(ctx(n), { citaId, estado: "no_asistio", estadoEsperado: "completada" }, DESPUES);

    expect(await notificacionesDe(citaId)).toEqual(antes);
  });

  test("una cita de otro negocio o un id que no es un uuid devuelven NO_ENCONTRADO; una entrada mal formada, DATOS_INVALIDOS", async () => {
    const { n, citaId } = await conCita();
    const otro = await negocioConAgenda();

    expect(await marcarAsistencia(ctx(otro), { citaId, estado: "completada", estadoEsperado: "confirmada" }, DESPUES)).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
    expect(await marcarAsistencia(ctx(n), { citaId: "x", estado: "completada", estadoEsperado: "confirmada" }, DESPUES)).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
    for (const estado of ["cancelada", "confirmada", "pendiente_pago", ""]) {
      expect(await marcarAsistencia(ctx(n), { citaId, estado, estadoEsperado: "confirmada" }, DESPUES), estado).toEqual({
        ok: false,
        error: "DATOS_INVALIDOS",
      });
    }
    expect(await estadoDe(citaId)).toBe("confirmada");
  });
});
