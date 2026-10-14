import { notFound, redirect } from "next/navigation";
import { describe, expect, test, vi } from "vitest";
import { ErrorNegocio, exito } from "@/dominio/resultado";
import { accion } from "@/servidor/accion";
import { destinoDeRedireccion, errorDe, esNoEncontrado } from "../../ayudantes-next";

// Envoltorio de las Server Actions (ARCH §7.5, §18.4; D-14, S-17).

describe("servidor/accion", () => {
  test("devuelve { ok: false, error: 'NEGOCIO_SUSPENDIDO' } ante ese ErrorNegocio", async () => {
    const envuelta = accion(async () => {
      throw new ErrorNegocio("NEGOCIO_SUSPENDIDO");
    });

    expect(await envuelta()).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });
  });

  test("convierte cualquier ErrorNegocio en su código", async () => {
    const envuelta = accion(async () => {
      throw new ErrorNegocio("LIMITE_PLAN", "Límite del plan");
    });

    expect(await envuelta()).toEqual({ ok: false, error: "LIMITE_PLAN" });
  });

  test("pasa los argumentos y devuelve el resultado de la acción sin cambios", async () => {
    const fn = vi.fn(async (a: number, b: string) => exito({ suma: a + b.length }));
    const envuelta = accion(fn);

    expect(await envuelta(2, "abc")).toEqual({ ok: true, valor: { suma: 5 } });
    expect(fn).toHaveBeenCalledWith(2, "abc");
  });

  test("relanza cualquier otro error", async () => {
    const original = new Error("fallo de red");
    const envuelta = accion(async () => {
      throw original;
    });

    expect(await errorDe(envuelta())).toBe(original);
  });

  test("relanza redirect() de Next", async () => {
    const envuelta = accion(async () => redirect("/login"));

    expect(destinoDeRedireccion(await errorDe(envuelta()))).toBe("/login");
  });

  test("relanza notFound() de Next", async () => {
    const envuelta = accion(async () => notFound());

    expect(esNoEncontrado(await errorDe(envuelta()))).toBe(true);
  });
});
