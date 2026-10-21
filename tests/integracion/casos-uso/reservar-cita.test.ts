import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Azar } from "@/dominio/codigo-reserva";
import { publicarPolitica } from "@/servidor/casos-uso/politica-datos";
import { prepararReserva, reservarCita, type EntradaReserva } from "@/servidor/casos-uso/reservar-cita";
import { db, enTransaccion } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearCliente, crearRecurso, crearSede, datosDeCita, fijarLimite, negocioConAgenda } from "../fixtures";

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
      expect(await prepararReserva(entrada, AHORA), JSON.stringify(entrada)).toMatchObject({
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
  test("una reserva válida responde { citaId, codigo, inicio, fin } y deja la cita confirmada, con fin = inicio + duración y ocupado_hasta = fin + buffer", async () => {
    const n = await negocioConAgenda({ servicio: { duracionMinutos: 30, bufferMinutos: 10 } });

    const resultado = await reservarCita(reserva(n), AHORA);

    expect(resultado).toEqual({
      ok: true,
      valor: { citaId: expect.any(String), codigo: expect.any(String), inicio: LUNES_9AM, fin: "2030-03-04T14:30:00.000Z" },
    });
    const [cita] = await citasDe(n.negocioId);
    expect(cita).toMatchObject({
      id: resultado.ok ? resultado.valor.citaId : "",
      codigo: resultado.ok ? resultado.valor.codigo : "",
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

  test("la cita queda con un código de reserva con el prefijo del nombre de su negocio, y la respuesta lo devuelve (D-28; Q-41)", async () => {
    const n = await negocioConAgenda();
    await db().update(esquema.negocio).set({ nombre: "Ébano Spa" }).where(eq(esquema.negocio.id, n.negocioId));

    const resultado = await reservarCita(reserva(n), AHORA);

    const [cita] = await citasDe(n.negocioId);
    expect(cita.codigo).toMatch(/^ES-[0-9]{4}$/);
    expect(resultado).toEqual({ ok: true, valor: expect.objectContaining({ citaId: cita.id, codigo: cita.codigo }) });
  });

  /** Una cita del panel con ese código, para que el primer código de la reserva choque. */
  async function citaConCodigo(n: Negocio, codigo: string) {
    const clienteId = await crearCliente(n.negocioId);
    await db()
      .insert(esquema.cita)
      .values({ ...datosDeCita({ ...n, clienteId }), codigo, inicio: new Date("2030-03-05T14:00:00Z"), fin: new Date("2030-03-05T14:30:00Z"), ocupadoHasta: new Date("2030-03-05T14:30:00Z") });
  }

  /** Un azar que devuelve los valores en orden y repite el último. */
  const secuencia = (...valores: number[]): Azar => {
    let i = 0;
    return () => valores[Math.min(i++, valores.length - 1)];
  };

  test("si el primer código ya existe en el negocio, la reserva sale con otro y no falla (Q-41)", async () => {
    const n = await negocioConAgenda(); // "Óptica Visión": OV
    await citaConCodigo(n, "OV-0042");

    const resultado = await reservarCita(reserva(n), AHORA, secuencia(42, 43));

    expect(resultado).toEqual({ ok: true, valor: expect.objectContaining({ codigo: "OV-0043" }) });
    const codigos = (await citasDe(n.negocioId)).map((c) => c.codigo).sort();
    expect(codigos).toEqual(["OV-0042", "OV-0043"]);
  });

  test("después de 5 choques usa 6 dígitos (Q-41)", async () => {
    const n = await negocioConAgenda();
    await citaConCodigo(n, "OV-0042");

    const resultado = await reservarCita(reserva(n), AHORA, secuencia(42));

    expect(resultado).toEqual({ ok: true, valor: expect.objectContaining({ codigo: "OV-000042" }) });
  });

  test("si otra reserva toma el mismo código entre la comprobación y el INSERT, choca con el UNIQUE, reintenta la transacción y sale con otro (Q-41; ARCH §11.4)", async () => {
    const n = await negocioConAgenda(); // "Óptica Visión": OV
    // La otra cita va en una segunda sede, con su recurso: no comparte el bloqueo del recurso
    // de la reserva, así que la reserva solo puede esperar por el UNIQUE del código.
    const sedeB = await crearSede(n.negocioId);
    const recursoB = await crearRecurso(n.negocioId, sedeB);
    await db().insert(esquema.servicioSede).values({ negocioId: n.negocioId, servicioId: n.servicioId, sedeId: sedeB });
    const clienteB = await crearCliente(n.negocioId);

    // 1. Una transacción inserta OV-0042 y queda abierta: la reserva no ve esa fila.
    let confirmar!: () => void;
    let pidOtra!: number;
    const insertada = Promise.withResolvers<void>();
    const otra = enTransaccion(async (tx) => {
      const filas = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
      pidOtra = filas.rows[0].pid;
      await tx.insert(esquema.cita).values({
        ...datosDeCita({ negocioId: n.negocioId, sedeId: sedeB, servicioId: n.servicioId, recursoId: recursoB, clienteId: clienteB }),
        codigo: "OV-0042",
      });
      insertada.resolve();
      await new Promise<void>((r) => (confirmar = r));
    });
    await insertada.promise;

    // 2. La reserva comprueba OV-0042 libre e inserta: espera por el UNIQUE.
    const reservada = reservarCita(reserva(n), AHORA, secuencia(42, 43));
    await vi.waitFor(
      async () => {
        const [{ esperando }] = await db().execute<{ esperando: number }>(
          sql`SELECT count(*)::int AS esperando FROM pg_stat_activity WHERE ${pidOtra}::int = ANY (pg_blocking_pids(pid))`,
        ).then((r) => r.rows);
        expect(esperando).toBe(1);
      },
      { timeout: 20_000, interval: 200 },
    );

    // 3. La otra confirma: la reserva choca, reintenta y elige OV-0043.
    confirmar();
    await otra;
    expect(await reservada).toEqual({ ok: true, valor: expect.objectContaining({ codigo: "OV-0043" }) });
    const codigos = (await citasDe(n.negocioId)).map((c) => c.codigo).sort();
    expect(codigos).toEqual(["OV-0042", "OV-0043"]);
  });

  test("el mismo código en otro negocio no choca (UNIQUE por negocio; D-28)", async () => {
    const a = await negocioConAgenda();
    const b = await negocioConAgenda();
    await citaConCodigo(a, "OV-0042");

    expect(await reservarCita(reserva(b), AHORA, secuencia(42))).toEqual({
      ok: true,
      valor: expect.objectContaining({ codigo: "OV-0042" }),
    });
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

describe("reservarCita: notificaciones (C-01, C-02, C-05; ARCH §14.1; Q-28)", () => {
  const notificacionesDe = (negocioId: string) =>
    db()
      .select({
        citaId: esquema.notificacion.citaId,
        tipo: esquema.notificacion.tipo,
        canal: esquema.notificacion.canal,
        destinatario: esquema.notificacion.destinatario,
        clave: esquema.notificacion.claveIdempotencia,
        programadaPara: esquema.notificacion.programadaPara,
        estado: esquema.notificacion.estado,
        datos: esquema.notificacion.datos,
      })
      .from(esquema.notificacion)
      .where(eq(esquema.notificacion.negocioId, negocioId))
      .orderBy(esquema.notificacion.claveIdempotencia);

  test("una reserva crea tres notificaciones pendientes: confirmación y recordatorio al correo de la cita, y el aviso al dueño", async () => {
    const n = await negocioConAgenda(); // recordatorio 24 horas antes (D-09)

    const resultado = await reservarCita(reserva(n), AHORA);
    if (!resultado.ok) throw new Error(resultado.error);
    const { citaId } = resultado.valor;

    expect(await notificacionesDe(n.negocioId)).toEqual([
      {
        citaId,
        tipo: "confirmacion",
        canal: "correo",
        destinatario: "ana@mail.com",
        clave: `confirmacion:${citaId}`,
        programadaPara: AHORA,
        estado: "pendiente",
        datos: {},
      },
      {
        citaId,
        tipo: "dueno_cita_nueva",
        canal: "correo",
        destinatario: n.correoDueno,
        clave: `dueno_cita_nueva:${citaId}`,
        programadaPara: AHORA,
        estado: "pendiente",
        datos: {},
      },
      {
        citaId,
        tipo: "recordatorio",
        canal: "correo",
        destinatario: "ana@mail.com",
        clave: `recordatorio:${citaId}:v1`,
        programadaPara: new Date("2030-03-03T14:00:00Z"), // inicio − 24 h
        estado: "pendiente",
        datos: { version: 1 },
      },
    ]);
  });

  test("sin recordatorio configurado no se crea el recordatorio", async () => {
    const n = await negocioConAgenda({ reglas: { recordatorioHorasAntes: null } });
    expect((await reservarCita(reserva(n), AHORA)).ok).toBe(true);
    expect((await notificacionesDe(n.negocioId)).map((x) => x.tipo).sort()).toEqual(["confirmacion", "dueno_cita_nueva"]);
  });

  test("si inicio − horas ya pasó, no se crea el recordatorio (S-12)", async () => {
    // Recordatorio 72 h antes del lunes 4 a las 9:00 = viernes 1 a las 9:00, antes de ahora (10:00).
    const n = await negocioConAgenda({ reglas: { recordatorioHorasAntes: 72 } });
    expect((await reservarCita(reserva(n), AHORA)).ok).toBe(true);
    expect((await notificacionesDe(n.negocioId)).map((x) => x.tipo).sort()).toEqual(["confirmacion", "dueno_cita_nueva"]);
  });

  test("una reserva rechazada no deja notificaciones", async () => {
    const n = await negocioConAgenda();
    expect(await reservarCita(reserva(n, { inicio: "2030-03-09T14:00:00.000Z" }), AHORA)).toEqual({
      ok: false,
      error: "HORARIO_NO_DISPONIBLE",
    });
    expect(await notificacionesDe(n.negocioId)).toEqual([]);
  });
});
