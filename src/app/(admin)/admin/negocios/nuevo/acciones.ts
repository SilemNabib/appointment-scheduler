"use server";

import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/servidor/auth/sesion";
import { altaNegocio, type ErrorAltaNegocio } from "@/servidor/casos-uso/alta-negocio";

// Server Action del alta de negocios (ADM-02, F-11). Es un adaptador delgado: el
// esquema y las reglas viven en el caso de uso (ARCH §4; Q-02).

const CAMPOS = [
  "slug",
  "nombre",
  "plan",
  "estadoSuscripcion",
  "vencimiento",
  "correoDueno",
  "direccionSede",
  "telefonoSede",
] as const;

export type ValoresAlta = Partial<Record<(typeof CAMPOS)[number], string>>;

export type EstadoAlta = {
  /** Mensaje de error; el alta no se hizo. */
  error?: string;
  /** El alta se hizo, pero algo quedó pendiente (Q-08). */
  aviso?: string;
  /** Lo que escribió el admin, para no perderlo al mostrar el error. */
  valores?: ValoresAlta;
};

const MENSAJES: Record<ErrorAltaNegocio, string> = {
  SLUG_NO_DISPONIBLE: "Slug no disponible: ya lo usa otro negocio o está reservado por el sistema.",
  DATOS_INVALIDOS:
    "Datos inválidos. Revisa el slug (solo a-z, 0-9 y guiones, de 3 a 40 caracteres), el plan, " +
    "la fecha de vencimiento y el correo del dueño, que no puede pertenecer a otro negocio.",
};

export async function crearNegocio(_previo: EstadoAlta, datos: FormData): Promise<EstadoAlta> {
  const admin = await requireSuperadmin();
  const valores: ValoresAlta = Object.fromEntries(
    CAMPOS.map((campo) => [campo, String(datos.get(campo) ?? "")]),
  );

  const resultado = await altaNegocio(valores, admin);
  if (!resultado.ok) return { error: MENSAJES[resultado.error], valores };
  if (!resultado.valor.invitacionEnviada) {
    return {
      aviso:
        `El negocio "${valores.slug}" quedó creado, pero no se pudo enviar la invitación al dueño. ` +
        "Envíala desde el Dashboard de Clerk (Users → Invitations) con su correo.",
    };
  }
  redirect("/admin");
}
