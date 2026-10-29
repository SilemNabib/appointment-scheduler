import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { reprogramarCita } from "@/servidor/casos-uso/reprogramar-cita";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { tokenDeGestion } from "@/servidor/gestion-cita/firma";
import { negocioConAgenda } from "../fixtures";

// Concurrencia de la reprogramación por link (RN-11, RN-34, ADR-04; ARCH §11.3, §18.3 y
// §20, Concurrencia; T6.39), el caso que quedó pendiente en T3.22 y T5.29. Operaciones
// reales en paralelo contra Neon: cada una abre su transacción y espera en el `FOR UPDATE`
// del recurso. Cada prueba repite la carrera varias veces en el mismo negocio, cada vez por
// otra hora. "Ahora" es el viernes 1-mar-2030 a las 10:00 a. m. de Bogotá; las citas son el
// lunes 4, en un consultorio de capacidad 1.

const BOGOTA = "America/Bogota";
const AHORA = localAUtc("2030-03-01", "10:00", BOGOTA);
const lunes = (hora: string) => localAUtc("2030-03-04", hora, BOGOTA).toISOString();

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

beforeEach(() => {
  vi.stubEnv("GESTION_CITA_SECRET", "secreto-de-gestion-de-prueba");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** La reserva pública del cliente `i`, cada uno con su teléfono y su correo. */
async function reservar(n: Negocio, i: number, inicio: string) {
  return reservarCita(
    {
      slug: n.slug,
      sedeId: n.sedeId,
      servicioId: n.servicioId,
      recursoId: null,
      inicio,
      nombre: `Cliente ${i}`,
      apellido: "Público",
      telefono: `310 000 ${String(4000 + i)}`,
      correo: `publico${i}@mail.com`,
      politicaDatosId: n.politicaId,
      aceptaPolitica: true,
      sitioWeb: "",
    },
    AHORA,
  );
}

/** Una cita reservada por el cliente `i`, con el link de su correo. */
async function conLink(n: Negocio, i: number, inicio: string) {
  const r = await reservar(n, i, inicio);
  if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
  const { citaId } = r.valor;
  return { slug: n.slug, citaId, token: await tokenDeGestion({ id: citaId, tokenVersion: 1 }) };
}

const confirmadasA = (negocioId: string, inicio: string) =>
  db()
    .select({ id: esquema.cita.id })
    .from(esquema.cita)
    .where(and(eq(esquema.cita.negocioId, negocioId), eq(esquema.cita.inicio, new Date(inicio)), eq(esquema.cita.estado, "confirmada")));

const citaPorId = async (id: string) => (await db().select().from(esquema.cita).where(eq(esquema.cita.id, id)))[0];

describe("la reprogramación por link en paralelo (RN-11, RN-34)", () => {
  test(
    "una reprogramación y una reserva lanzadas a la vez por el último cupo de un recurso de capacidad 1: entra solo una (ARCH §20)",
    async () => {
      const n = await negocioConAgenda({ capacidad: 1 });
      // Cuatro carreras: la cita de la tarde se mueve a una hora de la mañana que otro
      // cliente intenta reservar al mismo tiempo.
      const carreras = [
        { desde: "14:00", hacia: "08:00" },
        { desde: "14:30", hacia: "08:30" },
        { desde: "15:00", hacia: "09:00" },
        { desde: "15:30", hacia: "09:30" },
      ];

      for (const [i, { desde, hacia }] of carreras.entries()) {
        const link = await conLink(n, i, lunes(desde));

        const [reprogramada, reservada] = await Promise.all([
          reprogramarCita({ ...link, inicio: lunes(hacia) }, AHORA),
          reservar(n, 100 + i, lunes(hacia)),
        ]);

        // Exactamente una entra; la otra recibe HORARIO_NO_DISPONIBLE.
        expect([reprogramada.ok, reservada.ok].filter(Boolean)).toHaveLength(1);
        const perdedora = reprogramada.ok ? reservada : reprogramada;
        expect(perdedora).toMatchObject({ ok: false, error: "HORARIO_NO_DISPONIBLE" });
        expect(await confirmadasA(n.negocioId, lunes(hacia))).toHaveLength(1);
        // Si perdió la reprogramación, la cita sigue en su hora, sin gastar un intento.
        const cita = await citaPorId(link.citaId);
        expect(cita).toMatchObject(
          reprogramada.ok
            ? { inicio: new Date(lunes(hacia)), version: 2, reprogramacionesCliente: 1 }
            : { inicio: new Date(lunes(desde)), version: 1, reprogramacionesCliente: 0 },
        );
      }
    },
    180_000,
  );

  test(
    "con el límite en 1, dos reprogramaciones simultáneas de la misma cita: entra una y la otra recibe LIMITE_REPROGRAMACIONES (ARCH §18.3)",
    async () => {
      const n = await negocioConAgenda({ capacidad: 1, reglas: { maxReprogramacionesCliente: 1 } });
      // Tres carreras, cada una con su cita y dos horas libres distintas: lo que rechaza a
      // la segunda es el límite, no la hora.
      const carreras = [
        { desde: "08:00", horas: ["10:00", "10:30"] },
        { desde: "08:30", horas: ["11:00", "11:30"] },
        { desde: "09:00", horas: ["14:00", "14:30"] },
      ];

      for (const [i, { desde, horas }] of carreras.entries()) {
        const link = await conLink(n, i, lunes(desde));

        const resultados = await Promise.all(horas.map((hora) => reprogramarCita({ ...link, inicio: lunes(hora) }, AHORA)));

        expect(resultados.filter((r) => r.ok)).toHaveLength(1);
        expect(resultados.find((r) => !r.ok)).toEqual({ ok: false, error: "LIMITE_REPROGRAMACIONES", limite: 1 });
        const ganadora = resultados.find((r) => r.ok);
        if (!ganadora?.ok) throw new Error("Ninguna reprogramación entró.");
        expect(ganadora.valor.reprogramacionesRestantes).toBe(0);
        expect(await citaPorId(link.citaId)).toMatchObject({ inicio: new Date(ganadora.valor.inicio), version: 2, reprogramacionesCliente: 1 });
        // Un solo C-04 y un solo C-06: la que perdió no encoló nada.
        const avisos = await db()
          .select({ tipo: esquema.notificacion.tipo })
          .from(esquema.notificacion)
          .where(eq(esquema.notificacion.citaId, link.citaId));
        expect(avisos.filter((a) => a.tipo === "reprogramacion")).toHaveLength(1);
        expect(avisos.filter((a) => a.tipo === "dueno_cambio")).toHaveLength(1);
      }
    },
    180_000,
  );
});
