import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// La ruta interna del cron con las tareas simuladas (ARCH §14.4 y §14.5; Q-75).

const correrCron = vi.fn();
vi.mock("@/servidor/casos-uso/cron", () => ({ correrCron: (...args: unknown[]) => correrCron(...args) }));

const { POST } = await import("@/app/api/interno/cron/route");

const SECRETO = "s3cr3t0-del-cron";
const solicitud = (authorization?: string) =>
  new Request("http://localhost/api/interno/cron", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRETO);
});

afterEach(() => {
  vi.unstubAllEnvs();
  correrCron.mockReset();
});

describe("POST /api/interno/cron", () => {
  test("corre las tareas y responde 204 si todas salieron bien", async () => {
    correrCron.mockResolvedValue({ ok: true, tareas: [] });
    const r = await POST(solicitud(`Bearer ${SECRETO}`));
    expect(r.status).toBe(204);
    expect(correrCron).toHaveBeenCalledOnce();
    expect(correrCron.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  test("responde 500 si alguna tarea falló", async () => {
    correrCron.mockResolvedValue({ ok: false, tareas: [{ nombre: "aplicarVencimientos", ok: false }] });
    expect((await POST(solicitud(`Bearer ${SECRETO}`))).status).toBe(500);
  });

  test("sin la autorización del cron responde 401 y no corre nada", async () => {
    expect((await POST(solicitud())).status).toBe(401);
    expect((await POST(solicitud("Bearer otro"))).status).toBe(401);
    expect(correrCron).not.toHaveBeenCalled();
  });
});
