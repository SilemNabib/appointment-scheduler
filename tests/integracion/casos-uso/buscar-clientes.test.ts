import { describe, expect, test } from "vitest";
import { buscarClientes } from "@/servidor/casos-uso/clientes";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearNegocio } from "../fixtures";

// Búsqueda de clientes de la cita manual (PAN-04, F-06; Q-53).

type DatosCliente = Partial<typeof esquema.cliente.$inferInsert> & { nombre: string; apellido: string };

async function cliente(negocioId: string, datos: DatosCliente) {
  const [{ id }] = await db()
    .insert(esquema.cliente)
    .values({ negocioId, ...datos })
    .returning({ id: esquema.cliente.id });
  return id;
}

const nombres = (lista: { nombre: string; apellido: string }[]) => lista.map((c) => `${c.nombre} ${c.apellido}`);

describe("buscarClientes (Q-53)", () => {
  test('"300 123 4567" encuentra al cliente +573001234567 por el teléfono exacto, con sus datos', async () => {
    const negocioId = await crearNegocio();
    const id = await cliente(negocioId, {
      nombre: "Ana",
      apellido: "Pérez",
      telefonoE164: "+573001234567",
      correo: "ana@mail.com",
    });
    await cliente(negocioId, { nombre: "Luis", apellido: "Gómez", telefonoE164: "+573001234568" });

    expect(await buscarClientes({ negocioId }, "300 123 4567")).toEqual([
      { id, nombre: "Ana", apellido: "Pérez", telefonoE164: "+573001234567", correo: "ana@mail.com" },
    ]);
    expect(await buscarClientes({ negocioId }, "+57 300-123-4567")).toHaveLength(1);
  });

  test('"pér" y "PÉR" encuentran a "Ana Pérez" (RN-18), sin distinguir mayúsculas', async () => {
    const negocioId = await crearNegocio();
    await cliente(negocioId, { nombre: "Ana", apellido: "Pérez", telefonoE164: "+573001234567" });
    await cliente(negocioId, { nombre: "Luis", apellido: "Gómez", telefonoE164: "+573001234568" });

    expect(nombres(await buscarClientes({ negocioId }, "pér"))).toEqual(["Ana Pérez"]);
    expect(nombres(await buscarClientes({ negocioId }, "PÉR"))).toEqual(["Ana Pérez"]);
    expect(nombres(await buscarClientes({ negocioId }, "  ana "))).toEqual(["Ana Pérez"]);
    expect(nombres(await buscarClientes({ negocioId }, "Ana Pé"))).toEqual(["Ana Pérez"]);
  });

  test("busca por el nombre o por el apellido; no quita tildes (Q-53)", async () => {
    const negocioId = await crearNegocio();
    await cliente(negocioId, { nombre: "María", apellido: "López", correo: "maria@mail.com" });
    await cliente(negocioId, { nombre: "Ramiro", apellido: "Ríos", correo: "ramiro@mail.com" });

    expect(nombres(await buscarClientes({ negocioId }, "lóp"))).toEqual(["María López"]);
    expect(nombres(await buscarClientes({ negocioId }, "ríos"))).toEqual(["Ramiro Ríos"]);
    expect(nombres(await buscarClientes({ negocioId }, "rí"))).toEqual(["María López", "Ramiro Ríos"]);
    expect(nombres(await buscarClientes({ negocioId }, "rios"))).toEqual([]);
  });

  test("no devuelve clientes de otro negocio (RN-01) ni anonimizados (S-14)", async () => {
    const [a, b] = await Promise.all([crearNegocio(), crearNegocio()]);
    await cliente(b, { nombre: "Ana", apellido: "Pérez", telefonoE164: "+573001234567" });
    await cliente(a, { nombre: "Ana", apellido: "Anónima", anonimizadoEn: new Date() });

    expect(await buscarClientes({ negocioId: a }, "Ana")).toEqual([]);
    expect(await buscarClientes({ negocioId: a }, "300 123 4567")).toEqual([]);
  });

  test("un texto de menos de 2 caracteres devuelve una lista vacía", async () => {
    const negocioId = await crearNegocio();
    await cliente(negocioId, { nombre: "A", apellido: "B", telefonoE164: "+573001234567" });

    for (const texto of ["", " ", "A", " a ", null, 3]) {
      expect(await buscarClientes({ negocioId }, texto), JSON.stringify(texto)).toEqual([]);
    }
  });

  test("devuelve hasta 10, por nombre y apellido", async () => {
    const negocioId = await crearNegocio();
    for (let i = 11; i >= 0; i--) {
      await cliente(negocioId, { nombre: `Cliente ${String(i).padStart(2, "0")}`, apellido: "Pérez", correo: `c${i}@mail.com` });
    }

    const encontrados = await buscarClientes({ negocioId }, "cliente");

    expect(nombres(encontrados)).toEqual(Array.from({ length: 10 }, (_, i) => `Cliente ${String(i).padStart(2, "0")} Pérez`));
  });

  test("% y _ se buscan como texto, no como comodines", async () => {
    const negocioId = await crearNegocio();
    await cliente(negocioId, { nombre: "Ana", apellido: "Pérez", telefonoE164: "+573001234567" });

    expect(await buscarClientes({ negocioId }, "%%")).toEqual([]);
    expect(await buscarClientes({ negocioId }, "A_a")).toEqual([]);
  });
});
