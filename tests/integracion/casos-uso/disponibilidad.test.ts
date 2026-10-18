import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { intervaloDeDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { consultarDisponibilidad, type EntradaConsulta } from "@/servidor/casos-uso/disponibilidad";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearSede, negocioConAgenda } from "../fixtures";

// Consulta pública de disponibilidad (PUB-03, PUB-04, PUB-07; RN-04, RN-09; ARCH §18.5;
// Q-30, Q-32, Q-33). "Ahora" es el viernes 1-mar-2030 a las 10:00 a. m. de Bogotá; el
// negocio atiende de lunes a viernes de 8:00 a 12:00 y de 14:00 a 18:00, con un
// servicio de 30 minutos y las reglas de D-09 (anticipación de 2 horas a 60 días).

const AHORA = new Date("2030-03-01T15:00:00Z");

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const consulta = (n: Negocio, cambios: Partial<EntradaConsulta> = {}): EntradaConsulta => ({
  slug: n.slug,
  sedeId: n.sedeId,
  servicioId: n.servicioId,
  desde: "2030-03-04",
  hasta: "2030-03-10",
  ...cambios,
});

/** Las 16 horas de un día laboral: de 8:00 a 11:30 y de 14:00 a 17:30, en UTC (UTC−5). */
const diaLaboral = (fecha: string) =>
  ["13", "14", "15", "16", "19", "20", "21", "22"].flatMap((h) => [`${fecha}T${h}:00:00.000Z`, `${fecha}T${h}:30:00.000Z`]);

describe("consultarDisponibilidad (PUB-03, PUB-04)", () => {
  test("devuelve un día por fecha local, con los inicios en ISO UTC; un día sin cupo trae inicios vacíos", async () => {
    const n = await negocioConAgenda();
    // El miércoles 6 queda bloqueado todo el día: sin cupo, como el fin de semana.
    await db().insert(esquema.bloqueo).values({ negocioId: n.negocioId, sedeId: n.sedeId, ...intervaloDeDias("2030-03-06", "2030-03-06", ZONA_HORARIA_POR_DEFECTO) });

    const resultado = await consultarDisponibilidad(consulta(n), AHORA);

    expect(resultado).toEqual({
      ok: true,
      valor: {
        zonaHoraria: "America/Bogota",
        dias: [
          { fecha: "2030-03-04", inicios: diaLaboral("2030-03-04") },
          { fecha: "2030-03-05", inicios: diaLaboral("2030-03-05") },
          { fecha: "2030-03-06", inicios: [] },
          { fecha: "2030-03-07", inicios: diaLaboral("2030-03-07") },
          { fecha: "2030-03-08", inicios: diaLaboral("2030-03-08") },
          { fecha: "2030-03-09", inicios: [] },
          { fecha: "2030-03-10", inicios: [] },
        ],
      },
    });
  });

  test("los días anteriores a hoy se omiten y hoy respeta la anticipación mínima (Q-32)", async () => {
    const n = await negocioConAgenda();

    const resultado = await consultarDisponibilidad(consulta(n, { desde: "2030-02-25", hasta: "2030-03-04" }), AHORA);

    // Hoy (viernes 1) a las 10:00 con 2 horas de anticipación: desde las 14:00.
    expect(resultado.ok && resultado.valor.dias).toEqual([
      { fecha: "2030-03-01", inicios: diaLaboral("2030-03-01").slice(8) },
      { fecha: "2030-03-02", inicios: [] },
      { fecha: "2030-03-03", inicios: [] },
      { fecha: "2030-03-04", inicios: diaLaboral("2030-03-04") },
    ]);
  });

  test("los días después de la anticipación máxima se omiten (Q-32)", async () => {
    const n = await negocioConAgenda();

    // Ahora + 60 días = martes 30-abr-2030 a las 10:00: ese día ofrece hasta las 10:00.
    const resultado = await consultarDisponibilidad(consulta(n, { desde: "2030-04-29", hasta: "2030-05-05" }), AHORA);

    expect(resultado.ok && resultado.valor.dias).toEqual([
      { fecha: "2030-04-29", inicios: diaLaboral("2030-04-29") },
      { fecha: "2030-04-30", inicios: diaLaboral("2030-04-30").slice(0, 5) },
    ]);
  });

  test("un rango del todo pasado, o del todo después de la anticipación máxima, no trae días", async () => {
    const n = await negocioConAgenda();
    expect(await consultarDisponibilidad(consulta(n, { desde: "2030-02-01", hasta: "2030-02-07" }), AHORA)).toEqual({
      ok: true,
      valor: { zonaHoraria: "America/Bogota", dias: [] },
    });
    expect(await consultarDisponibilidad(consulta(n, { desde: "2030-06-03", hasta: "2030-06-09" }), AHORA)).toEqual({
      ok: true,
      valor: { zonaHoraria: "America/Bogota", dias: [] },
    });
  });

  test("en el período de gracia, la consulta funciona (RN-31)", async () => {
    // Venció el 27-feb: hoy, 1-mar, está en gracia hasta el 2-mar.
    const n = await negocioConAgenda({ suscripcion: { finPrueba: new Date("2030-02-27T05:00:00Z") } });
    const resultado = await consultarDisponibilidad(consulta(n), AHORA);
    expect(resultado.ok).toBe(true);
  });
});

describe("consultarDisponibilidad: errores (ARCH §18.5)", () => {
  test("un negocio suspendido devuelve NEGOCIO_SUSPENDIDO (PUB-07, RN-04)", async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "suspendida" } });
    expect(await consultarDisponibilidad(consulta(n), AHORA)).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });
  });

  test("un negocio cuya gracia ya terminó también, aunque el cron no lo haya suspendido (RN-31)", async () => {
    const n = await negocioConAgenda({ suscripcion: { finPrueba: new Date("2030-02-20T05:00:00Z") } });
    expect(await consultarDisponibilidad(consulta(n), AHORA)).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });
  });

  test("un slug, una sede o un servicio inexistentes, de otro negocio o no ofrecidos devuelven NO_ENCONTRADO", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);
    const sinOferta = await crearSede(a.negocioId);
    const casos: Partial<EntradaConsulta>[] = [
      { slug: "no-existe-este-negocio" },
      { sedeId: randomUUID() },
      { sedeId: "no-es-un-uuid" },
      { sedeId: b.sedeId },
      { sedeId: sinOferta },
      { servicioId: randomUUID() },
      { servicioId: b.servicioId },
    ];
    for (const cambios of casos) {
      expect(await consultarDisponibilidad(consulta(a, cambios), AHORA), JSON.stringify(cambios)).toEqual({
        ok: false,
        error: "NO_ENCONTRADO",
      });
    }
  });

  test("un servicio inactivo no se ofrece: NO_ENCONTRADO (RN-05)", async () => {
    const n = await negocioConAgenda();
    await db().update(esquema.servicio).set({ activo: false }).where(eq(esquema.servicio.id, n.servicioId));
    expect(await consultarDisponibilidad(consulta(n), AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
  });

  test("con cualquier recursoId devuelve NO_ENCONTRADO, aunque sea el recurso del servicio (Q-30)", async () => {
    const n = await negocioConAgenda();
    for (const recursoId of [n.recursoId, randomUUID()]) {
      expect(await consultarDisponibilidad(consulta(n, { recursoId }), AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    }
    // Vacío equivale a omitido.
    expect((await consultarDisponibilidad(consulta(n, { recursoId: "" }), AHORA)).ok).toBe(true);
  });

  test("un rango de más de 31 días, o que termina antes de empezar, devuelve DATOS_INVALIDOS (Q-33)", async () => {
    const n = await negocioConAgenda();
    expect(await consultarDisponibilidad(consulta(n, { desde: "2030-03-01", hasta: "2030-04-01" }), AHORA)).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
    });
    expect(await consultarDisponibilidad(consulta(n, { desde: "2030-03-10", hasta: "2030-03-04" }), AHORA)).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
    });
    // 31 días exactos sí se aceptan.
    expect((await consultarDisponibilidad(consulta(n, { desde: "2030-03-01", hasta: "2030-03-31" }), AHORA)).ok).toBe(true);
  });

  test("sin sedeId o servicioId, o con fechas mal formadas, devuelve DATOS_INVALIDOS", async () => {
    const n = await negocioConAgenda();
    const sin = (clave: string) => Object.fromEntries(Object.entries(consulta(n)).filter(([k]) => k !== clave));
    for (const entrada of [sin("sedeId"), sin("servicioId"), consulta(n, { desde: "2030-3-4" }), consulta(n, { hasta: "2030-02-30" }), null]) {
      expect(await consultarDisponibilidad(entrada, AHORA)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    }
  });
});
