import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { tokenDeCalendario } from "@/servidor/calendario/firma";
import { generarEnlaceCalendario, leerEnlaceCalendario } from "@/servidor/casos-uso/enlace-calendario";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { errorDePostgres, negocioConAgenda } from "../fixtures";

// El enlace de calendario del dueño (PAN-20; RN-35, D-14; ARCH §14.7 y §18.3; Q-72).

const AHORA = new Date("2030-03-01T15:00:00Z");
const DUENO = "user_dueno_prueba";

beforeEach(() => {
  vi.stubEnv("CALENDARIO_SECRET", "secreto-del-calendario-de-prueba");
  vi.stubEnv("APP_URL", "https://agenda.example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const ctx = (negocioId: string, estado: "al_dia" | "suspendida" = "al_dia") => ({
  negocioId,
  clerkUserId: DUENO,
  suscripcion: { estado } as const,
});

const enlacesDe = (negocioId: string) =>
  db().select().from(esquema.enlaceCalendario).where(eq(esquema.enlaceCalendario.negocioId, negocioId));

describe("leerEnlaceCalendario y generarEnlaceCalendario (PAN-20)", () => {
  test("sin enlace, leer no devuelve ninguno y no escribe (Q-72)", async () => {
    const n = await negocioConAgenda();
    expect(await leerEnlaceCalendario(ctx(n.negocioId))).toBeNull();
    expect(await enlacesDe(n.negocioId)).toEqual([]);
  });

  test("generar crea el enlace con creado_por del dueño, y leer devuelve sus dos URL", async () => {
    const n = await negocioConAgenda();

    const r = await generarEnlaceCalendario(ctx(n.negocioId), AHORA);

    const [enlace] = await enlacesDe(n.negocioId);
    expect(enlace).toMatchObject({ creadoPor: DUENO, revocadoEn: null, sedeId: null, recursoId: null });
    const https = `https://agenda.example.com/api/calendario/${enlace.id}/${await tokenDeCalendario(enlace.id)}`;
    expect(r).toEqual({ ok: true, valor: { https, webcal: https.replace(/^https:/, "webcal:") } });
    expect(await leerEnlaceCalendario(ctx(n.negocioId))).toEqual({ https, webcal: https.replace(/^https:/, "webcal:") });
  });

  test("generar dos veces deja un solo enlace vigente y el primero con revocado_en (ARCH §14.7)", async () => {
    const n = await negocioConAgenda();

    const primero = await generarEnlaceCalendario(ctx(n.negocioId), AHORA);
    const segundo = await generarEnlaceCalendario(ctx(n.negocioId), new Date(AHORA.getTime() + 1000));

    expect(primero.ok && segundo.ok && primero.valor.https !== segundo.valor.https).toBe(true);
    const filas = await enlacesDe(n.negocioId);
    expect(filas).toHaveLength(2);
    expect(filas.filter((f) => f.revocadoEn === null)).toHaveLength(1);
    expect(filas.find((f) => f.revocadoEn !== null)?.revocadoEn).toEqual(new Date(AHORA.getTime() + 1000));
    expect(await leerEnlaceCalendario(ctx(n.negocioId))).toEqual(segundo.ok && segundo.valor);
  });

  test("dos generaciones simultáneas también dejan uno solo vigente", async () => {
    const n = await negocioConAgenda();

    const resultados = await Promise.all([generarEnlaceCalendario(ctx(n.negocioId), AHORA), generarEnlaceCalendario(ctx(n.negocioId), AHORA)]);

    expect(resultados.every((r) => r.ok)).toBe(true);
    expect((await enlacesDe(n.negocioId)).filter((f) => f.revocadoEn === null)).toHaveLength(1);
  });

  test("el índice enlace_calendario_vigente_uq impide dos vigentes (ARCH §18.3)", async () => {
    const n = await negocioConAgenda();
    await generarEnlaceCalendario(ctx(n.negocioId), AHORA);

    const error = await errorDePostgres(db().insert(esquema.enlaceCalendario).values({ negocioId: n.negocioId, creadoPor: DUENO }));

    expect(error).toMatchObject({ constraint: "enlace_calendario_vigente_uq" });
  });

  test("con el negocio suspendido, generar devuelve NEGOCIO_SUSPENDIDO y leer sigue funcionando (D-14)", async () => {
    const n = await negocioConAgenda();
    const vigente = await generarEnlaceCalendario(ctx(n.negocioId), AHORA);
    const antes = await enlacesDe(n.negocioId);

    expect(await generarEnlaceCalendario(ctx(n.negocioId, "suspendida"), AHORA)).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });

    expect(await enlacesDe(n.negocioId)).toEqual(antes);
    expect(await leerEnlaceCalendario(ctx(n.negocioId, "suspendida"))).toEqual(vigente.ok && vigente.valor);
  });
});
