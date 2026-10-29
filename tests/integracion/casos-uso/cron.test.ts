import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { correrCron, tareasDelCron } from "@/servidor/casos-uso/cron";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import type { MensajeCorreo, ProveedorCorreo } from "@/servidor/notificaciones/proveedor";
import { negocioConAgenda } from "../fixtures";

// Las tareas del cron (RN-16, RN-21, RN-31; ARCH §14.4; Q-75). Corre en el proyecto
// `integracion-global`, porque las tareas actúan sobre todos los negocios. "Ahora" es de
// 2029, anterior a los datos que dejan los demás archivos de ese proyecto (2030 en
// adelante), así una corrida solo ve lo de esta prueba. Los de suscripcion-cron.test.ts,
// de 2028, no dejan nada pendiente ni por vencer.

const BOGOTA = "America/Bogota";
const VENCE = localAUtc("2029-04-10", "00:00", BOGOTA);
const FIN_DE_GRACIA = new Date(VENCE.getTime() + 3 * 24 * 60 * 60 * 1000);

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://agenda.example.com");
  vi.stubEnv("CORREO_CUENTA", "cuenta@agenda.example.com");
  vi.stubEnv("CORREO_SOPORTE", "soporte@agenda.example.com");
  vi.stubEnv("NOMBRE_PRODUCTO", "Agenda de citas");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function proveedorSimulado() {
  const enviados: MensajeCorreo[] = [];
  const proveedor: ProveedorCorreo = {
    async enviar(m) {
      enviados.push(m);
      return { ok: true, mensajeId: `msg_${enviados.length}` };
    },
  };
  return { proveedor, enviados };
}

describe("correrCron (ARCH §14.4)", () => {
  test("con un negocio cuya gracia terminó, una sola corrida lo suspende y envía su C-08 (aplicarVencimientos va primero)", async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "activa", pagadoHasta: VENCE, finPrueba: null } });
    const { proveedor, enviados } = proveedorSimulado();

    const resultado = await correrCron(FIN_DE_GRACIA, tareasDelCron(() => proveedor));

    expect(resultado).toEqual({
      ok: true,
      tareas: [
        { nombre: "aplicarVencimientos", ok: true },
        { nombre: "aplicarAsistenciaPorDefecto", ok: true },
        { nombre: "procesarNotificaciones", ok: true },
      ],
    });
    const [negocio] = await db().select().from(esquema.negocio).where(eq(esquema.negocio.id, n.negocioId));
    expect(negocio.estadoSuscripcion).toBe("suspendida");
    const [c08] = await db()
      .select()
      .from(esquema.notificacion)
      .where(and(eq(esquema.notificacion.negocioId, n.negocioId), eq(esquema.notificacion.tipo, "dueno_suspension")));
    expect(c08).toMatchObject({ estado: "enviada" });
    expect(enviados.filter((m) => m.destinatario === n.correoDueno).map((m) => m.asunto)).toEqual(["Tu suscripción está suspendida"]);
  });

  test("si aplicarVencimientos falla, las otras dos corren igual y el resultado no es ok (Q-75)", async () => {
    const orden: string[] = [];
    const tarea = (nombre: string, falla = false) => ({
      nombre,
      correr: vi.fn(async () => {
        orden.push(nombre);
        if (falla) throw new TypeError(`falla con datos: ana@mail.com`);
        return { procesadas: 0 };
      }),
    });

    const resultado = await correrCron(FIN_DE_GRACIA, [tarea("aplicarVencimientos", true), tarea("aplicarAsistenciaPorDefecto"), tarea("procesarNotificaciones")]);

    expect(orden).toEqual(["aplicarVencimientos", "aplicarAsistenciaPorDefecto", "procesarNotificaciones"]);
    expect(resultado).toEqual({
      ok: false,
      tareas: [
        { nombre: "aplicarVencimientos", ok: false },
        { nombre: "aplicarAsistenciaPorDefecto", ok: true },
        { nombre: "procesarNotificaciones", ok: true },
      ],
    });
    // El registro dice qué tarea falló, con el nombre del error y sin su mensaje (ARCH §19.2).
    const lineas = [...vi.mocked(console.error).mock.calls, ...vi.mocked(console.log).mock.calls].map(([l]) => String(l));
    expect(lineas.map((l) => JSON.parse(l))).toContainEqual(
      expect.objectContaining({ evento: "cron_tarea", tarea: "aplicarVencimientos", ok: false, error: "TypeError" }),
    );
    expect(lineas.join(" ")).not.toContain("ana@mail.com");
  });

  test("sin RESEND_API_KEY, solo falla la tarea de las notificaciones", async () => {
    vi.stubEnv("RESEND_API_KEY", undefined);

    const resultado = await correrCron(FIN_DE_GRACIA);

    expect(resultado.tareas).toEqual([
      { nombre: "aplicarVencimientos", ok: true },
      { nombre: "aplicarAsistenciaPorDefecto", ok: true },
      { nombre: "procesarNotificaciones", ok: false },
    ]);
  });
});
