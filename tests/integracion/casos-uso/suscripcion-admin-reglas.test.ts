import { auth } from "@clerk/nextjs/server";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { guardarConsultorioPanel } from "@/app/(panel)/panel/configuracion/consultorio/acciones";
import { ErrorNegocio } from "@/dominio/resultado";
import { fechaLocal, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { requireEscritura, requireMiembro } from "@/servidor/auth/sesion";
import { leerConsultorio } from "@/servidor/casos-uso/consultorio";
import { cambiarFinPrueba, registrarPago, suspenderNegocio } from "@/servidor/casos-uso/suscripcion-admin";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { errorDe } from "../../ayudantes-next";
import { ADMIN_PRUEBA, sesionDeDueno } from "../fixtures";

// Efectos de las acciones de ADM-03 sobre el acceso del dueño y la auditoría (RN-04,
// RN-29, RN-30, RN-31; ARCH §20, Suscripción). Clerk se simula; la sesión es la del
// dueño del negocio, y las acciones las hace el admin de prueba.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

afterEach(() => {
  vi.mocked(auth).mockReset();
});

const DIA = 24 * 60 * 60 * 1000;

/** Fecha local dentro de `dias` días, como la elige el admin. */
const enDias = (dias: number) => fechaLocal(new Date(Date.now() + dias * DIA), ZONA_HORARIA_POR_DEFECTO);

async function codigoDeEscritura() {
  const error = await errorDe(requireEscritura());
  return error instanceof ErrorNegocio ? error.codigo : error;
}

describe("suscripción desde el admin: efectos", () => {
  test("registrarPago reactiva de inmediato: con el negocio suspendido, después del pago requireEscritura deja escribir sin que corra ninguna tarea (RN-31; ARCH §20)", async () => {
    const { negocioId } = await sesionDeDueno({ estadoSuscripcion: "suspendida" });
    expect(await codigoDeEscritura()).toBe("NEGOCIO_SUSPENDIDO");

    expect((await registrarPago({ negocioId, pagadoHasta: enDias(30) }, ADMIN_PRUEBA)).ok).toBe(true);

    expect(await requireEscritura()).toMatchObject({ negocioId, suscripcion: { estado: "al_dia" } });
  });

  test("después de suspenderNegocio, el dueño conserva el acceso al panel, y cualquier cambio devuelve NEGOCIO_SUSPENDIDO (RN-04, RN-29)", async () => {
    const { negocioId } = await sesionDeDueno();
    const consultorio = await leerConsultorio({ negocioId });

    expect((await suspenderNegocio({ negocioId }, ADMIN_PRUEBA)).ok).toBe(true);

    // Conserva el acceso y puede consultar.
    expect(await requireMiembro()).toMatchObject({ negocioId, suscripcion: { estado: "suspendida" } });
    expect(await leerConsultorio({ negocioId })).toEqual(consultorio);
    // Cualquier cambio se rechaza, también por una Server Action real.
    expect(await codigoDeEscritura()).toBe("NEGOCIO_SUSPENDIDO");
    const datos = new FormData();
    datos.set("nombre", "Otro nombre");
    datos.set("capacidad", "3");
    expect(await guardarConsultorioPanel(datos)).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });
    expect(await leerConsultorio({ negocioId })).toEqual(consultorio);
  });

  test("registrarPago, suspenderNegocio y cambiarFinPrueba quedan en auditoria_admin con el admin como autor y con los valores anterior y nuevo (RN-30)", async () => {
    const { negocioId } = await sesionDeDueno(); // en prueba, al día
    const [{ ultima }] = await db()
      .select({ ultima: esquema.auditoriaAdmin.id })
      .from(esquema.auditoriaAdmin)
      .where(eq(esquema.auditoriaAdmin.negocioId, negocioId))
      .orderBy(desc(esquema.auditoriaAdmin.id))
      .limit(1);

    expect((await cambiarFinPrueba({ negocioId, finPrueba: "2027-01-15" }, ADMIN_PRUEBA)).ok).toBe(true);
    expect((await suspenderNegocio({ negocioId }, ADMIN_PRUEBA)).ok).toBe(true);
    expect((await registrarPago({ negocioId, pagadoHasta: "2027-02-28" }, ADMIN_PRUEBA)).ok).toBe(true);

    const auditoria = await db()
      .select()
      .from(esquema.auditoriaAdmin)
      .where(and(eq(esquema.auditoriaAdmin.negocioId, negocioId), gt(esquema.auditoriaAdmin.id, ultima)))
      .orderBy(asc(esquema.auditoriaAdmin.id));
    const resumen = auditoria.map(({ actor, tabla, operacion, antes, despues }) => {
      const [a, d] = [antes as Record<string, unknown>, despues as Record<string, unknown>];
      return {
        actor,
        tabla,
        operacion,
        antes: { estado: a.estado_suscripcion, finPrueba: a.fin_prueba, pagadoHasta: a.pagado_hasta },
        despues: { estado: d.estado_suscripcion, finPrueba: d.fin_prueba, pagadoHasta: d.pagado_hasta },
      };
    });
    const finPruebaNuevo = "2027-01-16T05:00:00+00:00";

    expect(resumen).toEqual([
      {
        actor: ADMIN_PRUEBA.clerkUserId,
        tabla: "negocio",
        operacion: "UPDATE",
        antes: { estado: "prueba", finPrueba: expect.any(String), pagadoHasta: null },
        despues: { estado: "prueba", finPrueba: finPruebaNuevo, pagadoHasta: null },
      },
      {
        actor: ADMIN_PRUEBA.clerkUserId,
        tabla: "negocio",
        operacion: "UPDATE",
        antes: { estado: "prueba", finPrueba: finPruebaNuevo, pagadoHasta: null },
        despues: { estado: "suspendida", finPrueba: finPruebaNuevo, pagadoHasta: null },
      },
      {
        actor: ADMIN_PRUEBA.clerkUserId,
        tabla: "negocio",
        operacion: "UPDATE",
        antes: { estado: "suspendida", finPrueba: finPruebaNuevo, pagadoHasta: null },
        despues: { estado: "activa", finPrueba: finPruebaNuevo, pagadoHasta: "2027-03-01T05:00:00+00:00" },
      },
    ]);
    expect(resumen[0].antes.finPrueba).not.toBe(finPruebaNuevo);
  });
});
