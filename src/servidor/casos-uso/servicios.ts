import "server-only";
import { z } from "zod";
import { ErrorNegocio, exito, fallo, type Fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { enTransaccion, type Transaccion } from "@/servidor/db/cliente";
import * as negocios from "@/servidor/db/repositorios/negocios";
import * as recursos from "@/servidor/db/repositorios/recursos";
import * as servicios from "@/servidor/db/repositorios/servicios";
import { exigirCupo } from "@/servidor/planes/acceso";
import { textoOpcional } from "./esquemas";

// Servicios del catálogo (PAN-12; RN-05, RN-06, RN-25, RN-28, RN-32; ARCH §16.3 y
// §18.4). En el MVP cada servicio se ofrece en la sede principal y lo atiende su
// consultorio (Q-20). El negocio sale del contexto, nunca del cliente (ARCH §6); un
// servicio de otro negocio responde como uno inexistente (`NO_ENCONTRADO`).

type Ctx = Pick<ContextoMiembro, "negocioId">;

export type { Servicio } from "@/servidor/db/repositorios/servicios";

/** Los mismos rangos que los `CHECK` de `servicio` (ARCH §18.2). */
export const esquemaServicio = z.object({
  /** Vacío o ausente = crear; si no, el servicio que se edita. */
  id: z
    .union([z.literal("").transform(() => null), z.uuid()])
    .nullish()
    .transform((id) => id ?? null),
  nombre: z.string().trim().min(1).max(120),
  descripcion: textoOpcional(500),
  duracionMinutos: z.coerce.number().int().min(5).max(720),
  /** Vacío o ausente = 0 (RN-05, D-02). */
  bufferMinutos: z.preprocess(
    (valor) => (valor === undefined || valor === null || valor === "" ? 0 : valor),
    z.coerce.number().int().min(0).max(240),
  ),
});

export type EntradaServicio = z.input<typeof esquemaServicio>;

export async function listarServicios(ctx: Ctx) {
  return servicios.listar(ctx.negocioId);
}

/**
 * Crea o edita un servicio. Al crear exige cupo de `max_services` (RN-25) y, en una
 * transacción, crea el servicio, su oferta en la sede principal y su asociación con
 * el consultorio. Al editar cambia el nombre, la descripción, la duración y el
 * buffer; editar no exige cupo (RN-28).
 */
export async function guardarServicio(
  ctx: Ctx,
  entrada: unknown,
): Promise<Resultado<{ id: string }, "DATOS_INVALIDOS" | "NO_ENCONTRADO" | "LIMITE_PLAN">> {
  const leida = esquemaServicio.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const { id, ...datos } = leida.data;

  if (id) {
    return (await servicios.actualizar(ctx.negocioId, id, datos)) ? exito({ id }) : fallo("NO_ENCONTRADO");
  }

  const consultorio = await recursos.consultorioPrincipal(ctx.negocioId);
  if (!consultorio) throw new Error(`El negocio ${ctx.negocioId} del contexto no tiene consultorio principal.`);
  return conCupo(() =>
    enTransaccion(async (tx) => {
      await exigirCupoDeServicios(ctx.negocioId, tx);
      const nuevo = await servicios.crear(
        ctx.negocioId,
        datos,
        { sedeId: consultorio.sedeId, recursoId: consultorio.id },
        tx,
      );
      return exito({ id: nuevo });
    }),
  );
}

/** Un id que no es un uuid no existe: responde igual que uno de otro negocio (ARCH §6). */
const esId = (id: unknown): id is string => z.uuid().safeParse(id).success;

/**
 * Vuelve a ofrecer un servicio inactivo. Reactivar exige cupo de `max_services`, igual
 * que crear (RN-28; ARCH §16.3). Activar uno que ya está activo no cambia nada.
 */
export async function activarServicio(
  ctx: Ctx,
  id: unknown,
): Promise<Resultado<void, "NO_ENCONTRADO" | "LIMITE_PLAN">> {
  if (!esId(id)) return fallo("NO_ENCONTRADO");
  return conCupo(() =>
    enTransaccion(async (tx): Promise<Resultado<void, "NO_ENCONTRADO">> => {
      const activo = await servicios.activoParaCambiar(ctx.negocioId, id, tx);
      if (activo === null) return fallo("NO_ENCONTRADO");
      if (!activo) {
        await exigirCupoDeServicios(ctx.negocioId, tx);
        await servicios.activar(ctx.negocioId, id, tx);
      }
      return exito(undefined);
    }),
  );
}

/** Deja de ofrecer un servicio. Sus citas existentes se conservan (RN-05). No exige cupo (RN-28). */
export async function desactivarServicio(ctx: Ctx, id: unknown): Promise<Resultado<void, "NO_ENCONTRADO">> {
  if (!esId(id)) return fallo("NO_ENCONTRADO");
  return (await servicios.desactivar(ctx.negocioId, id)) ? exito(undefined) : fallo("NO_ENCONTRADO");
}

/**
 * Cuenta los servicios activos con la fila del negocio tomada, así dos altas
 * simultáneas no pasan juntas del límite. Lanza `LIMITE_PLAN` (ARCH §16.3).
 */
async function exigirCupoDeServicios(negocioId: string, tx: Transaccion) {
  if (!(await negocios.bloquear(negocioId, tx))) throw new Error(`No existe el negocio ${negocioId} del contexto.`);
  await exigirCupo(negocioId, "max_services", await servicios.contarActivos(negocioId, tx));
}

/** `exigirCupo` lanza `LIMITE_PLAN`; aquí se devuelve como resultado (ARCH §18.4). */
async function conCupo<T>(fn: () => Promise<T>): Promise<T | Fallo<"LIMITE_PLAN">> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ErrorNegocio && error.codigo === "LIMITE_PLAN") return fallo("LIMITE_PLAN");
    throw error;
  }
}
