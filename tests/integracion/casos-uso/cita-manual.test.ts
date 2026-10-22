import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { crearCitaManual, type EntradaCitaManual } from "@/servidor/casos-uso/cita-manual";
import { desactivarServicio } from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearCliente, datosDeCita, negocioConAgenda } from "../fixtures";

// Cita manual del dueño (PAN-04, F-06; D-01, D-11, D-28, RN-15, RN-18, S-05, S-06; Q-53,
// Q-54). "Ahora" es el lunes 4-mar-2030 a las 8:35 a. m. de Bogotá; el negocio ("Óptica
// Visión") atiende de lunes a viernes de 8:00 a 12:00 y de 14:00 a 18:00, con un
// servicio de 30 minutos y las reglas de D-09 (anticipación mínima de 2 horas,
// recordatorio 24 horas antes).

const BOGOTA = "America/Bogota";
const AHORA = localAUtc("2030-03-04", "08:35", BOGOTA);
const LUNES_9AM = localAUtc("2030-03-04", "09:00", BOGOTA).toISOString();
const MIERCOLES_9AM = localAUtc("2030-03-06", "09:00", BOGOTA).toISOString();
const DUENO = "user_dueno_prueba";

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const ctx = (n: Negocio) => ({ negocioId: n.negocioId, clerkUserId: DUENO });

const entrada = (n: Negocio, cambios: Partial<EntradaCitaManual> = {}): EntradaCitaManual => ({
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "300 123 4567",
  correo: "",
  servicioId: n.servicioId,
  inicio: LUNES_9AM,
  ...cambios,
});

const citasDe = (negocioId: string) => db().select().from(esquema.cita).where(eq(esquema.cita.negocioId, negocioId));
const clientesDe = (negocioId: string) =>
  db().select().from(esquema.cliente).where(eq(esquema.cliente.negocioId, negocioId));
const notificacionesDe = (negocioId: string) =>
  db().select().from(esquema.notificacion).where(eq(esquema.notificacion.negocioId, negocioId));

describe("crearCitaManual (PAN-04, F-06)", () => {
  test("una cita dentro de la anticipación mínima queda confirmada, con origen panel, un código con el prefijo del negocio y el evento creada del dueño (RN-15, D-11)", async () => {
    const n = await negocioConAgenda({ servicio: { duracionMinutos: 30, bufferMinutos: 10 } });

    const resultado = await crearCitaManual(ctx(n), entrada(n), AHORA);

    expect(resultado).toEqual({
      ok: true,
      valor: {
        citaId: expect.any(String),
        codigo: expect.stringMatching(/^OV-[0-9]{4}$/),
        inicio: LUNES_9AM,
        fin: "2030-03-04T14:30:00.000Z",
      },
    });
    const [cita] = await citasDe(n.negocioId);
    expect(cita).toMatchObject({
      id: resultado.ok ? resultado.valor.citaId : "",
      codigo: resultado.ok ? resultado.valor.codigo : "",
      sedeId: n.sedeId,
      servicioId: n.servicioId,
      recursoId: n.recursoId,
      estado: "confirmada",
      origen: "panel",
      ocupadoHasta: new Date("2030-03-04T14:40:00Z"),
      clienteNombre: "Ana",
      clienteApellido: "Pérez",
      clienteTelefono: "+573001234567",
      clienteCorreo: null,
      politicaDatosId: null,
      politicaAceptadaEn: null,
      creadoEn: AHORA,
    });
    const eventos = await db().select().from(esquema.eventoCita).where(eq(esquema.eventoCita.citaId, cita.id));
    expect(eventos).toEqual([expect.objectContaining({ tipo: "creada", actor: "dueno", actorId: DUENO, datos: {} })]);
  });

  test("una hora fuera del horario, bloqueada, desalineada o sin cupo devuelve HORARIO_NO_DISPONIBLE con sus motivos y no deja ninguna fila (D-01, RN-15)", async () => {
    const n = await negocioConAgenda();
    const bloqueo = { inicio: localAUtc("2030-03-05", "09:00", BOGOTA), fin: localAUtc("2030-03-05", "10:00", BOGOTA) };
    await db().insert(esquema.bloqueo).values({ negocioId: n.negocioId, sedeId: n.sedeId, ...bloqueo });
    // El miércoles a las 9:00 ya está ocupado: con capacidad 1, sin cupo.
    const clienteId = await crearCliente(n.negocioId);
    const ocupada = { inicio: new Date(MIERCOLES_9AM), fin: new Date(Date.parse(MIERCOLES_9AM) + 30 * 60 * 1000) };
    await db()
      .insert(esquema.cita)
      .values({ ...datosDeCita({ ...n, clienteId }), ...ocupada, ocupadoHasta: ocupada.fin });
    const antes = { citas: (await citasDe(n.negocioId)).length, clientes: (await clientesDe(n.negocioId)).length };

    const casos: [string, string[]][] = [
      [localAUtc("2030-03-04", "12:30", BOGOTA).toISOString(), ["FUERA_DE_HORARIO"]], // en la pausa
      [bloqueo.inicio.toISOString(), ["BLOQUEADO"]],
      [localAUtc("2030-03-04", "09:15", BOGOTA).toISOString(), ["NO_ALINEADO"]],
      [MIERCOLES_9AM, ["SIN_CAPACIDAD"]],
      [localAUtc("2030-03-04", "08:00", BOGOTA).toISOString(), ["ANTICIPACION"]], // antes de ahora (D-11)
    ];
    for (const [inicio, motivos] of casos) {
      expect(await crearCitaManual(ctx(n), entrada(n, { inicio, telefono: "310 555 1234" }), AHORA), inicio).toEqual({
        ok: false,
        error: "HORARIO_NO_DISPONIBLE",
        motivos,
      });
    }
    expect({ citas: (await citasDe(n.negocioId)).length, clientes: (await clientesDe(n.negocioId)).length }).toEqual(antes);
    expect(await notificacionesDe(n.negocioId)).toEqual([]);
  });

  test("sin correo no encola nada (S-05); con correo encola C-01 y C-02, y nunca C-05 (S-06)", async () => {
    const n = await negocioConAgenda();

    const sinCorreo = await crearCitaManual(ctx(n), entrada(n, { inicio: MIERCOLES_9AM }), AHORA);
    expect(sinCorreo.ok).toBe(true);
    expect(await notificacionesDe(n.negocioId)).toEqual([]);

    const conCorreo = await crearCitaManual(
      ctx(n),
      entrada(n, { inicio: LUNES_9AM, telefono: "310 555 1234", correo: " Luis@Mail.com " }),
      AHORA,
    );
    const citaId = conCorreo.ok ? conCorreo.valor.citaId : "";
    const filas = await notificacionesDe(n.negocioId);
    expect(filas.map((f) => f.tipo).sort()).toEqual(["confirmacion"]); // dentro de 25 minutos: sin recordatorio (S-12)

    const conRecordatorio = await crearCitaManual(
      ctx(n),
      entrada(n, { inicio: localAUtc("2030-03-07", "09:00", BOGOTA).toISOString(), telefono: "310 555 4321", correo: "eva@mail.com" }),
      AHORA,
    );
    const otraId = conRecordatorio.ok ? conRecordatorio.valor.citaId : "";
    const todas = await notificacionesDe(n.negocioId);
    expect(todas).toHaveLength(3);
    expect(todas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ citaId, tipo: "confirmacion", destinatario: "luis@mail.com", claveIdempotencia: `confirmacion:${citaId}` }),
        expect.objectContaining({ citaId: otraId, tipo: "confirmacion", destinatario: "eva@mail.com" }),
        expect.objectContaining({
          citaId: otraId,
          tipo: "recordatorio",
          destinatario: "eva@mail.com",
          claveIdempotencia: `recordatorio:${otraId}:v1`,
          datos: { version: 1 },
          programadaPara: localAUtc("2030-03-06", "09:00", BOGOTA),
        }),
      ]),
    );
    expect(todas.some((f) => f.tipo === "dueno_cita_nueva")).toBe(false);
  });

  test("el mismo teléfono escrito en otro formato usa el cliente existente (RN-18)", async () => {
    const n = await negocioConAgenda();

    await crearCitaManual(ctx(n), entrada(n, { telefono: "300 123 4567", inicio: LUNES_9AM }), AHORA);
    await crearCitaManual(
      ctx(n),
      entrada(n, { telefono: "+57 300-123-4567", nombre: "Ana María", inicio: MIERCOLES_9AM }),
      AHORA,
    );

    const clientes = await clientesDe(n.negocioId);
    expect(clientes).toEqual([expect.objectContaining({ nombre: "Ana María", telefonoE164: "+573001234567" })]);
    const citas = await citasDe(n.negocioId);
    expect(citas.map((c) => c.clienteId)).toEqual([clientes[0].id, clientes[0].id]);
    expect(citas.map((c) => c.clienteNombre).sort()).toEqual(["Ana", "Ana María"]);
  });

  test("datos que no pasan la validación devuelven DATOS_INVALIDOS con los campos que fallaron, sin tocar la base (S-05; Q-53)", async () => {
    const n = await negocioConAgenda();

    expect(await crearCitaManual(ctx(n), entrada(n, { nombre: " ", telefono: "123", correo: "no-es-correo" }), AHORA)).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
      campos: ["nombre", "telefono", "correo"],
    });
    expect(await crearCitaManual(ctx(n), entrada(n, { telefono: "", inicio: "mañana" }), AHORA)).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
      campos: ["telefono", "inicio"],
    });
    expect(await crearCitaManual(ctx(n), entrada(n, { servicioId: "" }), AHORA)).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
      campos: ["servicioId"],
    });
    expect(await citasDe(n.negocioId)).toEqual([]);
  });

  test("un servicio inactivo, de otro negocio o un id que no es un uuid devuelve NO_ENCONTRADO (RN-05, RN-01)", async () => {
    const a = await negocioConAgenda();
    const b = await negocioConAgenda();

    expect(await crearCitaManual(ctx(a), entrada(a, { servicioId: b.servicioId }), AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await crearCitaManual(ctx(a), entrada(a, { servicioId: "x" }), AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    await desactivarServicio({ negocioId: a.negocioId }, a.servicioId);
    expect(await crearCitaManual(ctx(a), entrada(a), AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await citasDe(a.negocioId)).toEqual([]);
    expect(await citasDe(b.negocioId)).toEqual([]);
  });
});
