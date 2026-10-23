import { and, desc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { aplicarVencimientos } from "@/servidor/casos-uso/vencimientos";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../fixtures";

// aplicarVencimientos (RN-30, RN-31, D-13, S-16; ARCH §7.6, §14.1 y §18.3; Q-75). Corre en
// el proyecto `integracion-global`, de a un archivo, porque actúa sobre todos los
// negocios. Vencimiento "pagado hasta el 9 de octubre de 2030": las 00:00 locales del 10.

const BOGOTA = "America/Bogota";
const VENCE = localAUtc("2030-10-10", "00:00", BOGOTA);
const DIA = 24 * 60 * 60 * 1000;
const enGracia = new Date(VENCE.getTime() + DIA);
const finDeGracia = new Date(VENCE.getTime() + 3 * DIA);

const negocioPorId = async (id: string) => (await db().select().from(esquema.negocio).where(eq(esquema.negocio.id, id)))[0];
const avisos = (negocioId: string, tipo: "dueno_gracia" | "dueno_suspension") =>
  db()
    .select()
    .from(esquema.notificacion)
    .where(and(eq(esquema.notificacion.negocioId, negocioId), eq(esquema.notificacion.tipo, tipo)));

describe("aplicarVencimientos (ARCH §7.6)", () => {
  test("un negocio activa con la gracia terminada queda suspendida, auditada por el sistema y con un C-08 pendiente (RN-30, RN-31)", async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "activa", pagadoHasta: VENCE, finPrueba: null } });

    // Un milisegundo antes del fin de la gracia, sigue activa.
    await aplicarVencimientos(new Date(finDeGracia.getTime() - 1));
    expect((await negocioPorId(n.negocioId)).estadoSuscripcion).toBe("activa");

    await aplicarVencimientos(finDeGracia);

    expect((await negocioPorId(n.negocioId)).estadoSuscripcion).toBe("suspendida");
    const [auditoria] = await db()
      .select()
      .from(esquema.auditoriaAdmin)
      .where(and(eq(esquema.auditoriaAdmin.negocioId, n.negocioId), eq(esquema.auditoriaAdmin.tabla, "negocio")))
      .orderBy(desc(esquema.auditoriaAdmin.id))
      .limit(1);
    expect(auditoria).toMatchObject({ operacion: "UPDATE", actor: "sistema" });
    expect(auditoria.despues).toMatchObject({ estado_suscripcion: "suspendida" });
    const c08 = await avisos(n.negocioId, "dueno_suspension");
    expect(c08).toHaveLength(1);
    expect(c08[0]).toMatchObject({ estado: "pendiente", destinatario: n.correoDueno, citaId: null, programadaPara: finDeGracia });
  });

  test("lo mismo con un negocio en prueba", async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "prueba", finPrueba: VENCE, pagadoHasta: null } });

    await aplicarVencimientos(finDeGracia);

    expect((await negocioPorId(n.negocioId)).estadoSuscripcion).toBe("suspendida");
    expect(await avisos(n.negocioId, "dueno_suspension")).toHaveLength(1);
  });

  test("correrlo tres veces durante la gracia deja un solo C-07; después de un pago y un nuevo vencimiento, sale otro (ARCH §7.6)", async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "activa", pagadoHasta: VENCE, finPrueba: null } });

    for (const hora of [VENCE, enGracia, new Date(finDeGracia.getTime() - 1)]) await aplicarVencimientos(hora);

    const primeros = await avisos(n.negocioId, "dueno_gracia");
    expect(primeros).toHaveLength(1);
    expect(primeros[0]).toMatchObject({ destinatario: n.correoDueno, citaId: null });
    expect(new Date((primeros[0].datos as { vence: string }).vence)).toEqual(VENCE);
    expect(new Date((primeros[0].datos as { suspende_en: string }).suspende_en)).toEqual(finDeGracia);
    expect((await negocioPorId(n.negocioId)).estadoSuscripcion).toBe("activa");

    // Paga un mes más y vuelve a vencer: otro aviso.
    const nuevo = localAUtc("2030-11-10", "00:00", BOGOTA);
    await db().update(esquema.negocio).set({ pagadoHasta: nuevo }).where(eq(esquema.negocio.id, n.negocioId));
    await aplicarVencimientos(new Date(nuevo.getTime() + DIA));
    await aplicarVencimientos(new Date(nuevo.getTime() + DIA + 1000));

    expect(await avisos(n.negocioId, "dueno_gracia")).toHaveLength(2);
  });

  test("un negocio al día, uno ya suspendido y uno en prueba con el fin en el futuro no cambian", async () => {
    const alDia = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "activa", pagadoHasta: localAUtc("2031-01-01", "00:00", BOGOTA), finPrueba: null } });
    const suspendido = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "suspendida", pagadoHasta: VENCE, finPrueba: null } });
    const enPrueba = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "prueba", finPrueba: localAUtc("2031-01-01", "00:00", BOGOTA), pagadoHasta: null } });
    const antes = await Promise.all([alDia, suspendido, enPrueba].map((n) => negocioPorId(n.negocioId)));

    await aplicarVencimientos(finDeGracia);

    const despues = await Promise.all([alDia, suspendido, enPrueba].map((n) => negocioPorId(n.negocioId)));
    expect(despues.map((n) => n.estadoSuscripcion)).toEqual(antes.map((n) => n.estadoSuscripcion));
    for (const n of [alDia, suspendido, enPrueba]) {
      expect(await avisos(n.negocioId, "dueno_gracia")).toEqual([]);
      expect(await avisos(n.negocioId, "dueno_suspension")).toEqual([]);
    }
  });
});
