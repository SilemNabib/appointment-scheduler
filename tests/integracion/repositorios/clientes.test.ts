import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { normalizarCorreo, normalizarTelefono, type DatosIdentidad } from "@/dominio/identidad-cliente";
import { db, enTransaccion } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import * as clientes from "@/servidor/db/repositorios/clientes";
import { crearNegocio } from "../fixtures";

// Repositorio de clientes: búsqueda por teléfono y por correo, y la decisión de RN-18
// (ARCH §12). Los casos de aceptación de RN-18 y RN-19 se prueban a través de la
// reserva (T3.28 y T3.29).

/** Teléfono colombiano aleatorio, en formato nacional con espacios. */
const telefonoAleatorio = () => `310 ${Math.floor(100 + Math.random() * 900)} ${Math.floor(1000 + Math.random() * 9000)}`;

function datos(telefono: string, correo: string | null, nombre = "Ana", apellido = "Pérez"): DatosIdentidad {
  const telefonoE164 = normalizarTelefono(telefono);
  if (!telefonoE164) throw new Error(`Teléfono de prueba inválido: ${telefono}`);
  return { nombre, apellido, telefonoE164, correo: correo === null ? null : normalizarCorreo(correo) };
}

const resolver = (negocioId: string, d: DatosIdentidad) => enTransaccion((tx) => clientes.resolver(negocioId, d, tx));

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
    .where(eq(esquema.cliente.negocioId, negocioId));

describe("repositorios/clientes.resolver (RN-18, RN-19; ARCH §12)", () => {
  test("dos llamadas con el mismo teléfono en formatos distintos dejan un solo cliente, con el nombre de la segunda", async () => {
    const negocioId = await crearNegocio();
    const telefono = telefonoAleatorio(); // "310 123 4567"
    const conPrefijo = `+57 ${telefono.replaceAll(" ", "-")}`; // "+57 310-123-4567"

    const primero = await resolver(negocioId, datos(telefono, "ana@mail.com", "Ana", "Pérez"));
    const segundo = await resolver(negocioId, datos(conPrefijo, "ana@mail.com", "Luis", "Gómez"));

    expect(segundo).toBe(primero);
    expect(await clientesDe(negocioId)).toEqual([
      {
        id: primero,
        nombre: "Luis",
        apellido: "Gómez",
        telefonoE164: normalizarTelefono(telefono),
        correo: "ana@mail.com",
      },
    ]);
  });

  test("las búsquedas filtran por negocioId: el mismo teléfono en otro negocio crea otro cliente (ARCH §6)", async () => {
    const [a, b] = await Promise.all([crearNegocio(), crearNegocio()]);
    const d = datos(telefonoAleatorio(), "ana@mail.com");

    const enA = await resolver(a, d);
    const enB = await resolver(b, d);

    expect(enB).not.toBe(enA);
    expect(await clientesDe(a)).toHaveLength(1);
    expect(await clientesDe(b)).toEqual([expect.objectContaining({ id: enB, telefonoE164: d.telefonoE164, correo: "ana@mail.com" })]);
  });

  test("coincide por correo, en otro formato, y completa el teléfono que faltaba (RN-18.2)", async () => {
    const negocioId = await crearNegocio();
    const [sinTelefono] = await db()
      .insert(esquema.cliente)
      .values({ negocioId, nombre: "Ana", apellido: "Pérez", correo: "ana@mail.com" })
      .returning({ id: esquema.cliente.id });
    const d = datos(telefonoAleatorio(), " Ana@Mail.com ", "Ana María", "Pérez");

    expect(await resolver(negocioId, d)).toBe(sinTelefono.id);
    expect(await clientesDe(negocioId)).toEqual([
      { id: sinTelefono.id, nombre: "Ana María", apellido: "Pérez", telefonoE164: d.telefonoE164, correo: "ana@mail.com" },
    ]);
  });

  test("si el teléfono es de un cliente y el correo de otro, usa el del teléfono y no toca al otro (RN-18.5, D-22)", async () => {
    const negocioId = await crearNegocio();
    const delTelefono = await resolver(negocioId, datos(telefonoAleatorio(), null, "Ana"));
    const delCorreo = await resolver(negocioId, datos(telefonoAleatorio(), "luis@mail.com", "Luis"));
    const [antes] = (await clientesDe(negocioId)).filter((c) => c.id === delTelefono);

    const d = { nombre: "Ana Lucía", apellido: "Pérez", telefonoE164: antes.telefonoE164!, correo: "luis@mail.com" };
    expect(await resolver(negocioId, d)).toBe(delTelefono);

    const despues = await clientesDe(negocioId);
    expect(despues).toHaveLength(2);
    // El del teléfono cambia de nombre y su correo sigue vacío: el correo es del otro.
    expect(despues.find((c) => c.id === delTelefono)).toMatchObject({ nombre: "Ana Lucía", correo: null });
    expect(despues.find((c) => c.id === delCorreo)).toMatchObject({ nombre: "Luis", correo: "luis@mail.com" });
  });

  test("dos resoluciones simultáneas del mismo teléfono nuevo dejan un solo cliente (ON CONFLICT)", async () => {
    const negocioId = await crearNegocio();
    const telefono = telefonoAleatorio();
    let avisar!: () => void;
    const primeraInsertó = new Promise<void>((r) => (avisar = r));

    // La primera inserta y espera antes de confirmar; la segunda no ve esa fila en su
    // búsqueda, inserta y queda esperando en el índice único hasta el COMMIT, que la
    // convierte en la actualización de ON CONFLICT.
    const primera = enTransaccion(async (tx) => {
      const id = await clientes.resolver(negocioId, datos(telefono, "ana@mail.com", "Ana"), tx);
      avisar();
      await new Promise((r) => setTimeout(r, 1500));
      return id;
    });
    await primeraInsertó;
    const segunda = resolver(negocioId, datos(telefono, null, "Luis"));

    const [idPrimera, idSegunda] = await Promise.all([primera, segunda]);
    expect(idSegunda).toBe(idPrimera);
    expect(await clientesDe(negocioId)).toEqual([
      expect.objectContaining({ id: idPrimera, nombre: "Luis", correo: "ana@mail.com" }),
    ]);
  });
});
