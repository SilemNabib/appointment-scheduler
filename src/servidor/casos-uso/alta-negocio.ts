import "server-only";
import { z } from "zod";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import { validarSlug } from "@/dominio/slug";
import { vencimientoAInstante, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { invitarDueno } from "@/servidor/auth/invitaciones";
import { enTransaccion, fijarActor } from "@/servidor/db/cliente";
import * as negocios from "@/servidor/db/repositorios/negocios";
import { listarPlanes } from "@/servidor/planes/acceso";
import { politicaInicial } from "@/servidor/politica-datos/plantilla";
import { textoOpcional } from "./esquemas";

// Alta de un negocio desde /admin (ADM-02, F-11; ARCH §18.4). El esquema vive aquí y
// el formulario valida solo en el servidor (Q-02).

export const esquemaAltaNegocio = z.object({
  slug: z.string().trim(),
  nombre: z.string().trim().min(1).max(120),
  /** Código del plan (`listarPlanes`), por ahora `ilimitado` (RN-26). */
  plan: z.string().trim().min(1),
  estadoSuscripcion: z.enum(["prueba", "activa"]),
  /** Fin de prueba o pagado hasta, como fecha local inclusiva `YYYY-MM-DD` (ARCH §7.6). */
  vencimiento: z.iso.date(),
  correoDueno: z.string().trim().toLowerCase().pipe(z.email()),
  // Q-12: la dirección y el teléfono de la sede principal son opcionales.
  direccionSede: textoOpcional(200),
  telefonoSede: textoOpcional(30),
});

export type EntradaAltaNegocio = z.input<typeof esquemaAltaNegocio>;

export type ErrorAltaNegocio = "SLUG_NO_DISPONIBLE" | "DATOS_INVALIDOS";

export type AltaRealizada = {
  negocioId: string;
  /** `false` si Clerk rechazó la invitación: el alta queda hecha igual (Q-08). */
  invitacionEnviada: boolean;
};

/**
 * Valida la entrada, resuelve el plan y convierte el vencimiento; luego crea, en una
 * sola transacción con `app.actor` = el admin (RN-30), el negocio, su configuración,
 * la sede principal, el consultorio, la política v1 y el miembro pendiente. Después
 * del `COMMIT` envía la invitación de Clerk al dueño (ARCH §7.4 y §18.4).
 *
 * Errores (Q-09): slug reservado o repetido → `SLUG_NO_DISPONIBLE`; formato de slug
 * inválido, plan inexistente, correo del dueño ya usado o cualquier otro dato
 * inválido → `DATOS_INVALIDOS`.
 */
export async function altaNegocio(
  entrada: unknown,
  admin: { clerkUserId: string },
): Promise<Resultado<AltaRealizada, ErrorAltaNegocio>> {
  const leida = esquemaAltaNegocio.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const datos = leida.data;

  const slug = validarSlug(datos.slug);
  if (!slug.ok) return fallo(slug.error === "reservado" ? "SLUG_NO_DISPONIBLE" : "DATOS_INVALIDOS");

  const plan = (await listarPlanes()).find((p) => p.codigo === datos.plan);
  if (!plan) return fallo("DATOS_INVALIDOS");

  // Se guarda como las 00:00 locales del día siguiente (ARCH §7.6). Lanza con una
  // fecha que no existe en el calendario.
  let vence: Date;
  try {
    vence = vencimientoAInstante(datos.vencimiento, ZONA_HORARIA_POR_DEFECTO);
  } catch {
    return fallo("DATOS_INVALIDOS");
  }

  const negocioId = crypto.randomUUID();
  try {
    await enTransaccion(async (tx) => {
      await fijarActor(tx, admin.clerkUserId);
      await negocios.crear(
        negocioId,
        {
          slug: slug.valor,
          nombre: datos.nombre,
          planId: plan.id,
          estadoSuscripcion: datos.estadoSuscripcion,
          vence,
          correoDueno: datos.correoDueno,
          sede: { direccion: datos.direccionSede, telefono: datos.telefonoSede },
          politica: politicaInicial(datos.nombre),
        },
        tx,
      );
    });
  } catch (error) {
    // La unicidad la decide la base de datos, sin carreras entre dos altas.
    const restriccion = violacionDeUnicidad(error);
    if (restriccion === "negocio_slug_key") return fallo("SLUG_NO_DISPONIBLE");
    if (restriccion === "miembro_negocio_correo_key") return fallo("DATOS_INVALIDOS");
    throw error;
  }

  // Después del COMMIT: si la transacción falló, no se invita a nadie. Si falla la
  // invitación, el negocio ya existe; el formulario lo avisa (Q-08). El registro no
  // lleva el correo (ARCH §19.2).
  const invitacionEnviada = await invitarDueno(datos.correoDueno).then(
    () => true,
    (error: unknown) => {
      console.error(
        JSON.stringify({
          evento: "invitacion_fallida",
          negocioId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return false;
    },
  );
  return exito({ negocioId, invitacionEnviada });
}

/** Nombre de la restricción `UNIQUE` que rechazó la consulta, si fue eso. Drizzle envuelve el error en `cause`. */
function violacionDeUnicidad(error: unknown): string | undefined {
  const causa = error instanceof Error && error.cause ? error.cause : error;
  const { code, constraint } = (causa ?? {}) as { code?: string; constraint?: string };
  return code === "23505" ? constraint : undefined;
}
