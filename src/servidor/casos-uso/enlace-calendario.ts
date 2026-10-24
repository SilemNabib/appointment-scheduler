import "server-only";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { urlsDeCalendario, type UrlsDeCalendario } from "@/servidor/calendario/firma";
import { enTransaccion } from "@/servidor/db/cliente";
import * as enlaces from "@/servidor/db/repositorios/enlaces-calendario";
import * as negocios from "@/servidor/db/repositorios/negocios";

// El enlace de calendario del dueño (PAN-20; RN-35, D-14; ARCH §6, §14.7, §17.3, §18.3 y
// §18.4; Q-72). Leer no escribe: sin enlace, la pantalla ofrece crearlo. Generar revoca el
// vigente y crea otro en una transacción; la URL anterior deja de servir. El token se
// deriva del id, así que el enlace se puede volver a mostrar cuando se quiera.

type Ctx = Pick<ContextoMiembro, "negocioId" | "clerkUserId" | "suscripcion">;

/** Las URL `https://` y `webcal://` del enlace vigente del negocio, o `null`. Funciona con el negocio suspendido (D-14). */
export async function leerEnlaceCalendario(ctx: Pick<Ctx, "negocioId">): Promise<UrlsDeCalendario | null> {
  const id = await enlaces.vigente(ctx.negocioId);
  return id ? urlsDeCalendario(id) : null;
}

/**
 * Revoca el enlace vigente del negocio y crea otro, con `creado_por` igual al
 * `clerk_user_id` del dueño (ARCH §14.7). La Server Action ya llamó a `requireEscritura`;
 * aquí se vuelve a comprobar la suscripción del contexto: con el negocio suspendido,
 * `NEGOCIO_SUSPENDIDO` sin cambiar nada (D-14). La fila del negocio se toma primero, así
 * dos regeneraciones a la vez no chocan en el índice de vigentes.
 */
export async function generarEnlaceCalendario(ctx: Ctx, ahora: Date): Promise<Resultado<UrlsDeCalendario, "NEGOCIO_SUSPENDIDO">> {
  if (ctx.suscripcion.estado === "suspendida") return fallo("NEGOCIO_SUSPENDIDO");
  const id = await enTransaccion(async (tx) => {
    if (!(await negocios.bloquear(ctx.negocioId, tx))) throw new Error(`No existe el negocio ${ctx.negocioId} del contexto.`);
    await enlaces.revocarVigente(ctx.negocioId, ahora, tx);
    return enlaces.crear(ctx.negocioId, ctx.clerkUserId, ahora, tx);
  });
  return exito(await urlsDeCalendario(id));
}
