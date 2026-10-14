import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { estadoEfectivo, type EstadoEfectivo } from "@/dominio/suscripcion";
import * as miembros from "@/servidor/db/repositorios/miembros";
import * as negocios from "@/servidor/db/repositorios/negocios";

// Autorización en el servidor (ARCH §7.5). Clerk solo autentica; la pertenencia al
// negocio vive en `miembro_negocio` (ADR-05). El proxy solo protege rutas: cada
// página, Server Action y ruta vuelve a autorizar aquí.

export type ContextoMiembro = {
  negocioId: string;
  miembroId: string;
  rol: "dueno";
  clerkUserId: string;
  suscripcion: EstadoEfectivo; // al_dia | en_gracia | suspendida (§7.6)
};

/**
 * Primera línea de toda página, Server Action y ruta del panel. Se memoriza por
 * solicitud. Sin sesión redirige a /login; con un usuario válido sin negocio, a
 * /sin-acceso. El `negocioId` sale siempre de la sesión, nunca del cliente (ARCH §6).
 */
export const requireMiembro = cache(async (): Promise<ContextoMiembro> => {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const miembro = (await miembros.porClerkId(userId)) ?? (await vincularPorCorreo(userId));
  if (!miembro) redirect("/sin-acceso"); // Usuario válido, pero sin negocio asignado

  const negocio = await negocios.suscripcion(miembro.negocioId);
  if (!negocio) throw new Error(`El miembro ${miembro.id} apunta a un negocio inexistente.`);
  return {
    negocioId: miembro.negocioId,
    miembroId: miembro.id,
    rol: miembro.rol,
    clerkUserId: userId,
    suscripcion: estadoEfectivo(negocio, new Date()),
  };
});

/**
 * Primer ingreso (ARCH §7.4): vincula al miembro pendiente cuyo correo es el
 * **principal y verificado** del usuario. Un correo sin verificar nunca da acceso.
 */
async function vincularPorCorreo(userId: string) {
  const usuario = await currentUser();
  const principal = usuario?.emailAddresses.find((e) => e.id === usuario.primaryEmailAddressId);
  if (principal?.verification?.status !== "verified") return null;
  return miembros.vincular(principal.emailAddress.toLowerCase(), userId); // UPDATE … RETURNING
}
