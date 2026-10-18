import { describe, expect, test } from "vitest";
import { decidirIdentidad, normalizarCorreo, normalizarTelefono } from "@/dominio/identidad-cliente";

// Identidad del cliente (RN-18, RN-19; ARCH §12 y §20, suite `dominio/identidad-cliente`).

/** El `CHECK` de `cliente.telefono_e164` (ARCH §18.2). */
const CHECK_TELEFONO = /^\+[1-9][0-9]{6,14}$/;

describe("normalizarTelefono (RN-18.1)", () => {
  test.each(["300 123 4567", "+57 300-123-4567", "3001234567", "+573001234567", "(300) 123-4567", "  300.123.4567  "])(
    '"%s" da +573001234567 (ARCH §20)',
    (telefono) => {
      expect(normalizarTelefono(telefono)).toBe("+573001234567");
    },
  );

  test("un fijo de Colombia y un número de otro país con su prefijo también se normalizan", () => {
    expect(normalizarTelefono("601 234 5678")).toBe("+576012345678");
    expect(normalizarTelefono("+1 202 555 0143")).toBe("+12025550143");
    expect(normalizarTelefono("+34 612 34 56 78")).toBe("+34612345678");
  });

  test.each(["", "   ", "123", "300 123", "abc", "300 123 4567 890", "+57", "+999 123 4567"])(
    'rechaza "%s": no es un número válido',
    (telefono) => {
      expect(normalizarTelefono(telefono)).toBeNull();
    },
  );

  test("todo teléfono normalizado cumple el CHECK de cliente.telefono_e164", () => {
    const telefonos = [
      "300 123 4567",
      "310-555-0000",
      "+57 320 987 6543",
      "601 234 5678",
      "604 444 1234",
      "+1 202 555 0143",
      "+34 612 34 56 78",
      "+52 55 1234 5678",
      "+593 99 123 4567",
      "+58 412 123 4567",
    ];
    for (const telefono of telefonos) {
      const normalizado = normalizarTelefono(telefono);
      expect(normalizado, telefono).not.toBeNull();
      expect(normalizado).toMatch(CHECK_TELEFONO);
    }
  });
});

describe("normalizarCorreo (RN-18.2)", () => {
  test('" Ana@Mail.com " da "ana@mail.com" (ARCH §20)', () => {
    expect(normalizarCorreo(" Ana@Mail.com ")).toBe("ana@mail.com");
  });

  test("un correo ya normalizado no cambia", () => {
    expect(normalizarCorreo("ana@mail.com")).toBe("ana@mail.com");
  });
});

describe("decidirIdentidad (RN-18, RN-19; ARCH §12)", () => {
  const datos = { nombre: "Ana", apellido: "Pérez", telefonoE164: "+573001234567", correo: "ana@mail.com" };
  const cliente = (id: string, telefonoE164: string | null, correo: string | null) => ({ id, telefonoE164, correo });

  test("si coincide por teléfono, se usa ese cliente y se actualizan nombre y apellido (RN-18.1, RN-18.3)", () => {
    const porTelefono = cliente("c-tel", "+573001234567", "otro@mail.com");
    expect(decidirIdentidad(datos, porTelefono, null)).toEqual({
      tipo: "existente",
      clienteId: "c-tel",
      cambios: { nombre: "Ana", apellido: "Pérez" },
    });
  });

  test("si coincide por teléfono, el correo guardado no se sobrescribe: solo se completa si estaba vacío (S-15)", () => {
    const sinCorreo = cliente("c-tel", "+573001234567", null);
    expect(decidirIdentidad(datos, sinCorreo, null)).toEqual({
      tipo: "existente",
      clienteId: "c-tel",
      cambios: { nombre: "Ana", apellido: "Pérez", correo: "ana@mail.com" },
    });
  });

  test("si teléfono y correo coinciden con el mismo cliente, se usa ese y no cambia el contacto", () => {
    const mismo = cliente("c-1", "+573001234567", "ana@mail.com");
    expect(decidirIdentidad(datos, mismo, mismo)).toEqual({
      tipo: "existente",
      clienteId: "c-1",
      cambios: { nombre: "Ana", apellido: "Pérez" },
    });
  });

  test("si coincide solo por correo, se usa ese cliente y el teléfono se completa si estaba vacío (RN-18.2)", () => {
    expect(decidirIdentidad(datos, null, cliente("c-correo", null, "ana@mail.com"))).toEqual({
      tipo: "existente",
      clienteId: "c-correo",
      cambios: { nombre: "Ana", apellido: "Pérez", telefonoE164: "+573001234567" },
    });
  });

  test("si coincide solo por correo y ese cliente ya tiene otro teléfono, su teléfono no cambia (RN-18.2)", () => {
    expect(decidirIdentidad(datos, null, cliente("c-correo", "+573109876543", "ana@mail.com"))).toEqual({
      tipo: "existente",
      clienteId: "c-correo",
      cambios: { nombre: "Ana", apellido: "Pérez" },
    });
  });

  test("si no coincide ninguno, se crea un cliente nuevo con los datos de la reserva (RN-18.4)", () => {
    expect(decidirIdentidad(datos, null, null)).toEqual({ tipo: "nuevo", datos });
  });

  test("si el teléfono es de un cliente y el correo de otro, gana el del teléfono, el otro no cambia y no se crea nada más (RN-18.5, D-22; ARCH §20)", () => {
    const porTelefono = cliente("c-tel", "+573001234567", null);
    const porCorreo = cliente("c-correo", "+573109876543", "ana@mail.com");
    // El correo es del otro cliente: no se completa en el del teléfono, para no repetirlo.
    expect(decidirIdentidad(datos, porTelefono, porCorreo)).toEqual({
      tipo: "existente",
      clienteId: "c-tel",
      cambios: { nombre: "Ana", apellido: "Pérez" },
    });
  });

  test("con un teléfono compartido, la reserva queda en el mismo cliente con el nombre más reciente (RN-19)", () => {
    const familia = cliente("c-familia", "+573001234567", "ana@mail.com");
    const deLuis = { ...datos, nombre: "Luis", correo: "luis@mail.com" };
    expect(decidirIdentidad(deLuis, familia, null)).toEqual({
      tipo: "existente",
      clienteId: "c-familia",
      cambios: { nombre: "Luis", apellido: "Pérez" },
    });
  });

  test("sin correo (cita manual, S-05), no se completa ningún correo", () => {
    const sinCorreo = { ...datos, correo: null };
    expect(decidirIdentidad(sinCorreo, cliente("c-tel", "+573001234567", null), null)).toEqual({
      tipo: "existente",
      clienteId: "c-tel",
      cambios: { nombre: "Ana", apellido: "Pérez" },
    });
  });
});
