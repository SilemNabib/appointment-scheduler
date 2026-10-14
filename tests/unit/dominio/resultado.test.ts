import { describe, expect, expectTypeOf, test } from "vitest";
import {
  CODIGOS_ERROR,
  ErrorNegocio,
  exito,
  fallo,
  type CodigoError,
  type Resultado,
} from "@/dominio/resultado";

describe("dominio/resultado", () => {
  test("exito() produce la rama ok con su valor", () => {
    const resultado: Resultado<{ citaId: string }> = exito({ citaId: "c1" });

    expect(resultado).toEqual({ ok: true, valor: { citaId: "c1" } });
    if (resultado.ok) expectTypeOf(resultado.valor).toEqualTypeOf<{ citaId: string }>();
  });

  test("fallo() produce la rama de error con su código", () => {
    const resultado: Resultado<number, "NO_ENCONTRADO"> = fallo("NO_ENCONTRADO");

    expect(resultado).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    if (!resultado.ok) expectTypeOf(resultado.error).toEqualTypeOf<"NO_ENCONTRADO">();
  });

  test("ErrorNegocio expone su código y es un Error", () => {
    const error = new ErrorNegocio("NEGOCIO_SUSPENDIDO");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ErrorNegocio);
    expect(error.codigo).toBe("NEGOCIO_SUSPENDIDO");
    expect(error.name).toBe("ErrorNegocio");
    expect(error.message).toBe("NEGOCIO_SUSPENDIDO");
    expect(new ErrorNegocio("LIMITE_PLAN", "Límite del plan").message).toBe("Límite del plan");
  });

  test("CodigoError tiene los 10 códigos de ARCH §18.5 y los 4 de ARCH §18.4", () => {
    expect([...CODIGOS_ERROR].sort()).toEqual(
      [
        "DATOS_INVALIDOS",
        "NO_ENCONTRADO",
        "NEGOCIO_SUSPENDIDO",
        "BLOQUEO_CON_CITAS",
        "LIMITE_PLAN",
        "HORARIO_NO_DISPONIBLE",
        "FUERA_DE_PLAZO",
        "LIMITE_REPROGRAMACIONES",
        "ESTADO_INVALIDO",
        "DEMASIADAS_SOLICITUDES",
        "SLUG_NO_DISPONIBLE",
        "CONFLICTO_VERSION",
        "ANTES_DEL_INICIO",
        "FRANJAS_SOLAPADAS",
      ].sort(),
    );
    expectTypeOf<"SLUG_NO_DISPONIBLE">().toExtend<CodigoError>();
  });
});
