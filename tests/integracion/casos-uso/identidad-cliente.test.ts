import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { reservarCita, type EntradaReserva } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../fixtures";

// Identidad del cliente a través de la reserva (RN-18, RN-19, D-22). "Ahora" es el
// viernes 1-mar-2030 a las 10:00 a. m. de Bogotá; cada reserva es a otra media hora del
// lunes 4-mar-2030, para que no choquen por capacidad.

const AHORA = new Date("2030-03-01T15:00:00Z");
const HORAS = ["08:00", "08:30", "09:00", "09:30", "10:00"].map((h) => new Date(`2030-03-04T${h}:00-05:00`).toISOString());

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;
type Cliente = Pick<EntradaReserva, "nombre" | "apellido" | "telefono" | "correo">;

async function reservar(n: Negocio, turno: number, cliente: Cliente) {
  const resultado = await reservarCita(
    {
      slug: n.slug,
      sedeId: n.sedeId,
      servicioId: n.servicioId,
      inicio: HORAS[turno],
      ...cliente,
      politicaDatosId: n.politicaId,
      aceptaPolitica: true,
      sitioWeb: "",
    },
    AHORA,
  );
  if (!resultado.ok) throw new Error(`La reserva ${turno} falló: ${resultado.error}`);
  return resultado.valor.citaId;
}

const clientesDe = (negocioId: string) =>
  db()
    .select({
      id: esquema.cliente.id,
      nombre: esquema.cliente.nombre,
      apellido: esquema.cliente.apellido,
      telefonoE164: esquema.cliente.telefonoE164,
      correo: esquema.cliente.correo,
    })
    .from(esquema.cliente)
    .where(eq(esquema.cliente.negocioId, negocioId))
    .orderBy(asc(esquema.cliente.creadoEn));

const citasDe = (negocioId: string) =>
  db()
    .select({
      id: esquema.cita.id,
      clienteId: esquema.cita.clienteId,
      clienteNombre: esquema.cita.clienteNombre,
      clienteApellido: esquema.cita.clienteApellido,
      clienteTelefono: esquema.cita.clienteTelefono,
      clienteCorreo: esquema.cita.clienteCorreo,
    })
    .from(esquema.cita)
    .where(eq(esquema.cita.negocioId, negocioId))
    .orderBy(asc(esquema.cita.inicio));

describe("identidad del cliente en la reserva: normalización y nombre (RN-18)", () => {
  test('reservas con "300 123 4567" y con "+57 300-123-4567" quedan en el mismo cliente (RN-18)', async () => {
    const n = await negocioConAgenda();
    await reservar(n, 0, { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", correo: "ana@mail.com" });
    await reservar(n, 1, { nombre: "Ana", apellido: "Pérez", telefono: "+57 300-123-4567", correo: "ana@mail.com" });

    const clientes = await clientesDe(n.negocioId);
    expect(clientes).toEqual([expect.objectContaining({ telefonoE164: "+573001234567" })]);
    const citas = await citasDe(n.negocioId);
    expect(citas.map((c) => c.clienteId)).toEqual([clientes[0].id, clientes[0].id]);
  });

  test("y lo mismo con Ana@Mail.com y ana@mail.com (RN-18)", async () => {
    const n = await negocioConAgenda();
    // Teléfonos distintos: la segunda reserva no coincide por teléfono y se busca por correo (RN-18.2).
    await reservar(n, 0, { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", correo: "Ana@Mail.com" });
    await reservar(n, 1, { nombre: "Ana", apellido: "Pérez", telefono: "310 765 4321", correo: "ana@mail.com" });

    const clientes = await clientesDe(n.negocioId);
    expect(clientes).toEqual([expect.objectContaining({ correo: "ana@mail.com", telefonoE164: "+573001234567" })]);
    expect((await citasDe(n.negocioId)).map((c) => c.clienteId)).toEqual([clientes[0].id, clientes[0].id]);
  });

  test("una cita vieja sigue mostrando el nombre con el que se reservó, aunque el cliente reserve después con otro (RN-18)", async () => {
    const n = await negocioConAgenda();
    const vieja = await reservar(n, 0, { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", correo: "ana@mail.com" });
    const nueva = await reservar(n, 1, {
      nombre: "Ana María",
      apellido: "Pérez Gómez",
      telefono: "300 123 4567",
      correo: "ana@mail.com",
    });

    expect(await clientesDe(n.negocioId)).toEqual([
      expect.objectContaining({ nombre: "Ana María", apellido: "Pérez Gómez" }),
    ]);
    expect(await citasDe(n.negocioId)).toEqual([
      expect.objectContaining({ id: vieja, clienteNombre: "Ana", clienteApellido: "Pérez" }),
      expect.objectContaining({ id: nueva, clienteNombre: "Ana María", clienteApellido: "Pérez Gómez" }),
    ]);
  });
});

describe("identidad del cliente en la reserva: teléfono que prevalece y teléfono compartido (RN-18.5, RN-19)", () => {
  test("si el teléfono coincide con un cliente y el correo con otro, la cita queda en el cliente del teléfono y no se crea ninguna revisión (RN-18, caso 5)", async () => {
    const n = await negocioConAgenda();
    await reservar(n, 0, { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", correo: "ana@mail.com" });
    await reservar(n, 1, { nombre: "Luis", apellido: "Gómez", telefono: "310 765 4321", correo: "luis@mail.com" });
    const [ana, luis] = await clientesDe(n.negocioId);

    // El teléfono es el de Ana y el correo, el de Luis.
    const cita = await reservar(n, 2, { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", correo: "luis@mail.com" });

    expect((await citasDe(n.negocioId)).find((c) => c.id === cita)).toMatchObject({
      clienteId: ana.id,
      clienteCorreo: "luis@mail.com", // la cita guarda el correo con que se reservó (S-15)
    });
    // No se crea ningún cliente ni se fusionan: Ana conserva su correo y Luis no cambia (D-22).
    expect(await clientesDe(n.negocioId)).toEqual([ana, luis]);
    // Tampoco hay dónde marcar una revisión: la tabla se eliminó en la v0.7 (D-22).
    expect(Object.keys(esquema)).not.toContain("revisionCliente");
  });

  test("dos reservas con el mismo teléfono y distinto nombre quedan en el mismo cliente, cuyo nombre es el de la última; cada cita muestra el suyo (RN-19)", async () => {
    const n = await negocioConAgenda();
    const deAna = await reservar(n, 0, { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", correo: "ana@mail.com" });
    const deLuis = await reservar(n, 1, { nombre: "Luis", apellido: "Pérez", telefono: "300 123 4567", correo: "luis@mail.com" });

    const clientes = await clientesDe(n.negocioId);
    expect(clientes).toEqual([
      // El nombre es el de la última reserva; el correo guardado no se sobrescribe (S-15).
      expect.objectContaining({ nombre: "Luis", apellido: "Pérez", telefonoE164: "+573001234567", correo: "ana@mail.com" }),
    ]);
    expect(await citasDe(n.negocioId)).toEqual([
      expect.objectContaining({ id: deAna, clienteId: clientes[0].id, clienteNombre: "Ana", clienteCorreo: "ana@mail.com" }),
      expect.objectContaining({ id: deLuis, clienteId: clientes[0].id, clienteNombre: "Luis", clienteCorreo: "luis@mail.com" }),
    ]);
  });
});
