import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { crearCitaManual, type EntradaCitaManual } from "@/servidor/casos-uso/cita-manual";
import { moverCita } from "@/servidor/casos-uso/mover-cita";
import { reservarCita, type EntradaReserva } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../fixtures";

// Concurrencia de las operaciones del dueño que toman el bloqueo del recurso (RN-11,
// ADR-04; ARCH §11.3, §18.4 y §20, Concurrencia), con operaciones reales en paralelo
// contra Neon: cada una abre su transacción y espera en el `FOR UPDATE` del recurso. El
// caso con `reprogramarCita` va en la Fase 6. "Ahora" es el viernes 1-mar-2030 a las
// 10:00 a. m. de Bogotá; la hora pedida es el lunes 4-mar-2030 a las 9:00 a. m., con
// capacidad 1: es el último cupo de esa hora.

const BOGOTA = "America/Bogota";
const AHORA = localAUtc("2030-03-01", "10:00", BOGOTA);
const INICIO = localAUtc("2030-03-04", "09:00", BOGOTA).toISOString();
const DUENO = "user_dueno_prueba";

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const ctx = (n: Negocio) => ({ negocioId: n.negocioId, clerkUserId: DUENO });

/** La cita manual del cliente `i`, cada una con su propio teléfono. */
const manual = (n: Negocio, i: number, inicio = INICIO): EntradaCitaManual => ({
  nombre: `Cliente ${i}`,
  apellido: "Prueba",
  telefono: `310 000 ${String(2000 + i)}`,
  correo: "",
  servicioId: n.servicioId,
  inicio,
});

/** La reserva pública del cliente `i`. */
const reserva = (n: Negocio, i: number): EntradaReserva => ({
  slug: n.slug,
  sedeId: n.sedeId,
  servicioId: n.servicioId,
  inicio: INICIO,
  nombre: `Cliente ${i}`,
  apellido: "Público",
  telefono: `310 000 ${String(3000 + i)}`,
  correo: `publico${i}@mail.com`,
  politicaDatosId: n.politicaId,
  aceptaPolitica: true,
  sitioWeb: "",
});

const citasDe = (negocioId: string) =>
  db()
    .select({ id: esquema.cita.id, inicio: esquema.cita.inicio, origen: esquema.cita.origen, version: esquema.cita.version })
    .from(esquema.cita)
    .where(eq(esquema.cita.negocioId, negocioId));

describe("operaciones del dueño en paralelo (RN-11)", () => {
  test(
    "con 10 citas manuales simultáneas por el último cupo de un recurso de capacidad 1, entra exactamente una; las demás reciben HORARIO_NO_DISPONIBLE (RN-11)",
    async () => {
      const n = await negocioConAgenda({ capacidad: 1 });

      const resultados = await Promise.all(Array.from({ length: 10 }, (_, i) => crearCitaManual(ctx(n), manual(n, i), AHORA)));

      expect(resultados.filter((r) => r.ok)).toHaveLength(1);
      expect(resultados.flatMap((r) => (r.ok ? [] : [r.error]))).toEqual(Array(9).fill("HORARIO_NO_DISPONIBLE"));
      expect((await citasDe(n.negocioId)).map((c) => c.inicio)).toEqual([new Date(INICIO)]);
    },
    120_000,
  );

  test(
    "una cita manual y una reserva pública lanzadas a la vez por el último cupo: entra solo una (RN-11)",
    async () => {
      const n = await negocioConAgenda({ capacidad: 1 });

      const [delDueno, delCliente] = await Promise.all([
        crearCitaManual(ctx(n), manual(n, 1), AHORA),
        reservarCita(reserva(n, 1), AHORA),
      ]);

      expect([delDueno.ok, delCliente.ok].filter(Boolean)).toHaveLength(1);
      const perdedor = delDueno.ok ? delCliente : delDueno;
      expect(perdedor).toMatchObject({ ok: false, error: "HORARIO_NO_DISPONIBLE" });
      expect(await citasDe(n.negocioId)).toHaveLength(1);
    },
    120_000,
  );

  test(
    "mover una cita a una hora mientras una reserva pide la misma hora: entra solo una de las dos (ARCH §20, aquí con moverCita)",
    async () => {
      const n = await negocioConAgenda({ capacidad: 1 });
      const creada = await crearCitaManual(ctx(n), manual(n, 1, localAUtc("2030-03-05", "09:00", BOGOTA).toISOString()), AHORA);
      if (!creada.ok) throw new Error(creada.error);
      const { citaId } = creada.valor;

      const [movida, reservada] = await Promise.all([
        moverCita(ctx(n), { citaId, inicio: INICIO, version: 1 }, AHORA),
        reservarCita(reserva(n, 2), AHORA),
      ]);

      expect([movida.ok, reservada.ok].filter(Boolean)).toHaveLength(1);
      expect(movida.ok ? reservada : movida).toMatchObject({ ok: false, error: "HORARIO_NO_DISPONIBLE" });
      const enLaHora = (await citasDe(n.negocioId)).filter((c) => c.inicio.getTime() === new Date(INICIO).getTime());
      expect(enLaHora).toHaveLength(1);
    },
    120_000,
  );

  test(
    "dos movimientos simultáneos de la misma cita con la misma version: uno se aplica y el otro devuelve CONFLICTO_VERSION (ARCH §18.4)",
    async () => {
      const n = await negocioConAgenda({ capacidad: 1 });
      const creada = await crearCitaManual(ctx(n), manual(n, 1), AHORA);
      if (!creada.ok) throw new Error(creada.error);
      const { citaId } = creada.valor;
      const destinos = [localAUtc("2030-03-05", "10:00", BOGOTA), localAUtc("2030-03-06", "15:00", BOGOTA)];

      const resultados = await Promise.all(
        destinos.map((inicio) => moverCita(ctx(n), { citaId, inicio: inicio.toISOString(), version: 1 }, AHORA)),
      );

      expect(resultados.filter((r) => r.ok)).toHaveLength(1);
      expect(resultados.find((r) => !r.ok)).toEqual({ ok: false, error: "CONFLICTO_VERSION" });
      const [cita] = await citasDe(n.negocioId);
      expect(cita.version).toBe(2);
      const ganador = resultados.findIndex((r) => r.ok);
      expect(cita.inicio).toEqual(destinos[ganador]);
    },
    120_000,
  );
});
