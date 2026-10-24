import "server-only";
import { calendarioSuscrito } from "@/dominio/icalendar";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { urlsDeCalendario, verificarTokenDeCalendario, type UrlsDeCalendario } from "@/servidor/calendario/firma";
import { enTransaccion } from "@/servidor/db/cliente";
import * as citas from "@/servidor/db/repositorios/citas";
import * as enlaces from "@/servidor/db/repositorios/enlaces-calendario";
import * as negocios from "@/servidor/db/repositorios/negocios";
import { esId } from "./esquemas";

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

const DIA = 24 * 60 * 60 * 1000;
/** El alcance del calendario: desde hace 30 días hasta dentro de 365 (ARCH §14.7). */
const DIAS_ATRAS = 30;
const DIAS_ADELANTE = 365;

function appUrl(): string {
  const base = process.env.APP_URL;
  if (!base) throw new Error("Falta APP_URL (ver .env.example).");
  return base;
}

/**
 * El calendario del enlace del dueño (PAN-20; RN-35; ARCH §14.7; Q-71): con un enlace que
 * existe, no está revocado y cuya firma coincide, el iCalendar sin `METHOD`, con un
 * `VEVENT` por cita no cancelada del negocio desde hace 30 días hasta dentro de 365, con
 * los `UID` y `SEQUENCE` de las invitaciones. Cada evento lleva el servicio y el nombre del
 * cliente, la dirección y, en la descripción, el código y el enlace a la cita en el panel:
 * nunca teléfonos ni correos (RN-24). Se sirve también con el negocio suspendido (D-14).
 * Anota el acceso como máximo una vez por hora. En otro caso, `NO_ENCONTRADO`.
 */
export async function servirCalendario(enlaceId: unknown, token: unknown, ahora: Date): Promise<Resultado<string, "NO_ENCONTRADO">> {
  if (!esId(enlaceId) || typeof token !== "string") return fallo("NO_ENCONTRADO");
  if (!(await verificarTokenDeCalendario(enlaceId, token))) return fallo("NO_ENCONTRADO");
  const enlace = await enlaces.paraServir(enlaceId);
  if (!enlace || enlace.revocado) return fallo("NO_ENCONTRADO");

  const [negocio, lista] = await Promise.all([
    negocios.resumen(enlace.negocioId),
    citas.delCalendario(enlace.negocioId, {
      inicio: new Date(ahora.getTime() - DIAS_ATRAS * DIA),
      fin: new Date(ahora.getTime() + DIAS_ADELANTE * DIA),
    }),
  ]);
  if (!negocio) return fallo("NO_ENCONTRADO");
  await enlaces.anotarAcceso(enlaceId, ahora);

  return exito(
    calendarioSuscrito(
      negocio.nombre,
      lista.map((c) => ({
        cita: { id: c.id, version: c.version, inicio: c.inicio, fin: c.fin },
        resumen: `${c.servicio} — ${c.clienteNombre} ${c.clienteApellido}`,
        ubicacion: c.direccion,
        descripcion: `Código de reserva: ${c.codigo}. Ver en el panel: ${new URL(`/panel/citas/${c.id}`, appUrl())}`,
      })),
      ahora,
    ),
  );
}
