import { describe, expect, test } from "vitest";
import { esCronAutorizado } from "@/servidor/auth/cron";

// Autorización de la ruta interna del cron (ARCH §5 y §14.5).

describe("servidor/auth/cron", () => {
  const SECRETO = "s3cr3t0-del-cron";

  test("acepta Authorization: Bearer CRON_SECRET", () => {
    expect(esCronAutorizado(`Bearer ${SECRETO}`, SECRETO)).toBe(true);
  });

  test.each([
    ["sin el encabezado", null],
    ["con otro secreto", "Bearer otro-secreto-cualquier"],
    ["con el secreto sin Bearer", SECRETO],
    ["con otro esquema", `Basic ${SECRETO}`],
    ["con un prefijo del secreto", `Bearer ${SECRETO.slice(0, -1)}`],
  ])("rechaza %s", (_, encabezado) => {
    expect(esCronAutorizado(encabezado, SECRETO)).toBe(false);
  });

  test("sin CRON_SECRET configurado no pasa nadie", () => {
    expect(esCronAutorizado("Bearer ", "")).toBe(false);
    expect(esCronAutorizado("Bearer undefined", undefined)).toBe(false);
  });
});
