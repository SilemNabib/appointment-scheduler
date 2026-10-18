import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { publicarPolitica } from "@/servidor/casos-uso/politica-datos";
import { prepararReserva, reservarCita, type EntradaReserva } from "@/servidor/casos-uso/reservar-cita";
import { db, enTransaccion } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { fijarLimite, negocioConAgenda } from "../fixtures";

// Reserva pública (PUB-05, F-01; RN-04, RN-17, RN-25; ARCH §15, §18.4 y §18.5; Q-29,
// Q-30). "Ahora" es el viernes 1-mar-2030 a las 10:00 a. m. de Bogotá; la reserva es
// el lunes 4-mar-2030 a las 9:00 a. m. (14:00 UTC).

const AHORA = new Date("2030-03-01T15:00:00Z");
const LUNES_9AM = "2030-03-04T14:00:00.000Z";

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const reserva = (n: Negocio, cambios: Partial<EntradaReserva> = {}): EntradaReserva => ({
  slug: n.slug,
  sedeId: n.sedeId,
  servicioId: n.servicioId,
  recursoId: null,
  inicio: LUNES_9AM,
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "300 123 4567",
  correo: "Ana@Mail.com",
  politicaDatosId: n.politicaId,
  aceptaPolitica: true,
  sitioWeb: "",
  ...cambios,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prepararReserva: entrada (RN-17; ARCH §15 y §18.5)", () => {
  test("si falta un dato, el teléfono no se puede normalizar, la casilla no está marcada o sitioWeb llega lleno, devuelve DATOS_INVALIDOS sin tocar la base", async () => {
    const n = await negocioConAgenda();
    const sin = (clave: keyof EntradaReserva) =>
      Object.fromEntries(Object.entries(reserva(n)).filter(([nombre]) => nombre !== clave));
    const casos: unknown[] = [
      sin("nombre"),
      sin("apellido"),
      sin("telefono"),
      sin("correo"),
      sin("aceptaPolitica"),
      sin("politicaDatosId"),
      sin("inicio"),
      reserva(n, { nombre: "   " }),
      reserva(n, { telefono: "123" }),
      reserva(n, { telefono: "no es un teléfono" }),
      reserva(n, { correo: "ana-sin-arroba" }),
      { ...reserva(n), aceptaPolitica: false },
      { ...reserva(n), sitioWeb: "https://spam.example" },
      { ...reserva(n), sitioWeb: " " },
      { ...reserva(n), inicio: "4 de marzo a las 9" },
      { ...reserva(n), inicio: "2030-03-04T09:00:00-05:00" }, // con desfase: se espera UTC (ARCH §9)
      null,
    ];

    // Con una base inalcanzable, cualquier consulta lanzaría un error.
    vi.stubEnv("DATABASE_URL", "postgresql://nadie:nada@base-inexistente.invalid/nada");
    for (const entrada of casos) {
      expect(await prepararReserva(entrada, AHORA), JSON.stringify(entrada)).toEqual({
        ok: false,
        error: "DATOS_INVALIDOS",
      });
    }
  });

  test("con datos válidos devuelve la reserva preparada, con el teléfono y el correo normalizados (RN-18)", async () => {
    const n = await negocioConAgenda();

    expect(await prepararReserva(reserva(n, { telefono: "+57 300-123-4567", correo: " Ana@Mail.com " }), AHORA)).toEqual({
      ok: true,
      valor: {
        negocio: expect.objectContaining({ id: n.negocioId, zonaHoraria: "America/Bogota" }),
        sedeId: n.sedeId,
        servicioId: n.servicioId,
        recursoId: n.recursoId,
        inicio: new Date(LUNES_9AM),
        cliente: { nombre: "Ana", apellido: "Pérez", telefonoE164: "+573001234567", correo: "ana@mail.com" },
        politicaDatosId: n.politicaId,
      },
    });
  });

  test("sin sitioWeb en el cuerpo también se acepta: la trampa solo rechaza un valor", async () => {
    const n = await negocioConAgenda();
    const sinTrampa = Object.fromEntries(Object.entries(reserva(n)).filter(([nombre]) => nombre !== "sitioWeb"));
    expect((await prepararReserva(sinTrampa, AHORA)).ok).toBe(true);
  });
});

describe("prepararReserva: negocio, oferta y política (ARCH §6 y §18.4)", () => {
  test("una política de otro negocio devuelve NO_ENCONTRADO (ARCH §6)", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);
    expect(await prepararReserva(reserva(a, { politicaDatosId: b.politicaId }), AHORA)).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
  });

  test("cualquier versión de la política del negocio se acepta, porque se guarda la que vio el cliente (F-01)", async () => {
    const n = await negocioConAgenda();
    const publicada = await publicarPolitica({ negocioId: n.negocioId }, { contenido: "Política v2" });
    if (!publicada.ok) throw new Error(publicada.error);
    const [v2] = await db()
      .select({ id: esquema.politicaDatos.id })
      .from(esquema.politicaDatos)
      .where(and(eq(esquema.politicaDatos.negocioId, n.negocioId), eq(esquema.politicaDatos.version, 2)));

    const conV1 = await prepararReserva(reserva(n, { politicaDatosId: n.politicaId }), AHORA);
    const conV2 = await prepararReserva(reserva(n, { politicaDatosId: v2.id }), AHORA);
    expect(conV1.ok && conV1.valor.politicaDatosId).toBe(n.politicaId);
    expect(conV2.ok && conV2.valor.politicaDatosId).toBe(v2.id);
  });

  test("un slug, una sede, un servicio o una política inexistentes o de otro negocio devuelven NO_ENCONTRADO", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);
    const casos: Partial<EntradaReserva>[] = [
      { slug: "no-existe-este-negocio" },
      { sedeId: b.sedeId },
      { sedeId: "no-es-un-uuid" },
      { servicioId: b.servicioId },
      { servicioId: randomUUID() },
      { politicaDatosId: randomUUID() },
    ];
    for (const cambios of casos) {
      expect(await prepararReserva(reserva(a, cambios), AHORA), JSON.stringify(cambios)).toEqual({
        ok: false,
        error: "NO_ENCONTRADO",
      });
    }
  });

  test("con cualquier recursoId devuelve NO_ENCONTRADO, aunque sea el recurso del servicio (Q-30)", async () => {
    const n = await negocioConAgenda();
    expect(await prepararReserva(reserva(n, { recursoId: n.recursoId }), AHORA)).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
  });

  test("un negocio suspendido devuelve NEGOCIO_SUSPENDIDO (RN-04)", async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "suspendida" } });
    expect(await prepararReserva(reserva(n), AHORA)).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });
  });

  test("sin cupo de max_appointments_per_month devuelve LIMITE_PLAN (RN-25; Q-29)", async () => {
    const n = await negocioConAgenda();
    await fijarLimite(n.negocioId, "max_appointments_per_month", 0);
    expect(await prepararReserva(reserva(n), AHORA)).toEqual({ ok: false, error: "LIMITE_PLAN" });
  });
});

const citasDe = (negocioId: string) => db().select().from(esquema.cita).where(eq(esquema.cita.negocioId, negocioId));
const clientesDe = (negocioId: string) =>
  db().select().from(esquema.cliente).where(eq(esquema.cliente.negocioId, negocioId));

describe("reservarCita: transacción (RN-09 a RN-12, RN-17; ARCH §11)", () => {
  test("una reserva válida responde { citaId, inicio, fin } y deja la cita confirmada, con fin = inicio + duración y ocupado_hasta = fin + buffer", async () => {
    const n = await negocioConAgenda({ servicio: { duracionMinutos: 30, bufferMinutos: 10 } });

    const resultado = await reservarCita(reserva(n), AHORA);

    expect(resultado).toEqual({
      ok: true,
      valor: { citaId: expect.any(String), inicio: LUNES_9AM, fin: "2030-03-04T14:30:00.000Z" },
    });
    const [cita] = await citasDe(n.negocioId);
    expect(cita).toMatchObject({
      id: resultado.ok ? resultado.valor.citaId : "",
      sedeId: n.sedeId,
      servicioId: n.servicioId,
      recursoId: n.recursoId,
      recursoElegido: false,
      inicio: new Date(LUNES_9AM),
      fin: new Date("2030-03-04T14:30:00Z"),
      ocupadoHasta: new Date("2030-03-04T14:40:00Z"),
      estado: "confirmada",
      origen: "publico",
      servicioNombre: "Examen visual",
      clienteNombre: "Ana",
      clienteApellido: "Pérez",
      clienteTelefono: "+573001234567",
      clienteCorreo: "ana@mail.com",
      politicaDatosId: n.politicaId,
      politicaAceptadaEn: AHORA,
      creadoEn: AHORA,
    });
    const [cliente] = await clientesDe(n.negocioId);
    expect(cita.clienteId).toBe(cliente.id);
    // El evento `creada`, con el cliente como actor y sin datos personales.
    const eventos = await db().select().from(esquema.eventoCita).where(eq(esquema.eventoCita.citaId, cita.id));
    expect(eventos).toEqual([expect.objectContaining({ tipo: "creada", actor: "cliente", actorId: null, datos: {} })]);
  });

  test("la duración y el buffer salen de la oferta: con la sobrescritura de la sede, los de la sede (RN-32)", async () => {
    const n = await negocioConAgenda({ servicio: { duracionMinutos: 30, bufferMinutos: 10 } });
    await db()
      .update(esquema.servicioSede)
      .set({ duracionMinutos: 45, bufferMinutos: 15 })
      .where(and(eq(esquema.servicioSede.servicioId, n.servicioId), eq(esquema.servicioSede.sedeId, n.sedeId)));

    const resultado = await reservarCita(reserva(n), AHORA);

    expect(resultado.ok && resultado.valor.fin).toBe("2030-03-04T14:45:00.000Z");
    const [cita] = await citasDe(n.negocioId);
    expect(cita.ocupadoHasta).toEqual(new Date("2030-03-04T15:00:00Z"));
  });

  test("una hora que no pasa evaluarInicio devuelve HORARIO_NO_DISPONIBLE y no deja ninguna fila, ni de cliente ni de cita", async () => {
    const n = await negocioConAgenda();
    const noReservables = [
      "2030-03-04T17:30:00.000Z", // 12:30 p. m., en la pausa: fuera de horario
      "2030-03-09T14:00:00.000Z", // sábado
      "2030-03-04T14:15:00.000Z", // desalineada
      "2030-03-01T16:00:00.000Z", // hoy a las 11:00: dentro de la anticipación mínima
      "2030-06-03T14:00:00.000Z", // más allá de la anticipación máxima
    ];
    for (const inicio of noReservables) {
      expect(await reservarCita(reserva(n, { inicio }), AHORA), inicio).toEqual({
        ok: false,
        error: "HORARIO_NO_DISPONIBLE",
      });
    }
    expect(await citasDe(n.negocioId)).toEqual([]);
    expect(await clientesDe(n.negocioId)).toEqual([]);
  });

  test("con capacidad 1, la misma hora pedida otra vez devuelve HORARIO_NO_DISPONIBLE y no crea el cliente nuevo (RN-11)", async () => {
    const n = await negocioConAgenda();
    expect((await reservarCita(reserva(n), AHORA)).ok).toBe(true);

    const otra = reserva(n, { telefono: "310 555 0000", correo: "luis@mail.com", nombre: "Luis" });
    expect(await reservarCita(otra, AHORA)).toEqual({ ok: false, error: "HORARIO_NO_DISPONIBLE" });
    expect(await citasDe(n.negocioId)).toHaveLength(1);
    expect(await clientesDe(n.negocioId)).toHaveLength(1);
  });

  test("si el correo choca con un cliente creado al mismo tiempo, reintenta y asocia la cita a ese cliente (ARCH §12)", async () => {
    const n = await negocioConAgenda();
    let avisar!: () => void;
    const insertado = new Promise<void>((r) => (avisar = r));

    // Otra transacción crea un cliente con el mismo correo y otro teléfono, y tarda en
    // confirmar. La reserva no lo ve al buscar, choca en cliente_correo_uq al insertar
    // y, al reintentar, lo encuentra por correo (RN-18.2).
    const otra = enTransaccion(async (tx) => {
      const [fila] = await tx
        .insert(esquema.cliente)
        .values({ negocioId: n.negocioId, nombre: "Ana", apellido: "Pérez", telefonoE164: "+573109998877", correo: "ana@mail.com" })
        .returning({ id: esquema.cliente.id });
      avisar();
      // Más que las precondiciones de la reserva, que van por HTTP antes de su transacción.
      await new Promise((r) => setTimeout(r, 6000));
      return fila.id;
    });
    await insertado;
    const resultado = await reservarCita(reserva(n), AHORA);
    const clienteDeLaOtra = await otra;

    expect(resultado.ok).toBe(true);
    const [cita] = await citasDe(n.negocioId);
    expect(cita.clienteId).toBe(clienteDeLaOtra);
    expect(await clientesDe(n.negocioId)).toHaveLength(1);
  });
});
