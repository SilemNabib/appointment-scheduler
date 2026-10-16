import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../cliente";
import { recurso } from "../esquema";
import { idSedePrincipal } from "./sedes";

// Recursos de las sedes (RN-06, RN-33). Toda función recibe `negocioId` y lo usa en
// el WHERE (ARCH §6, defensa 1).
//
// En el MVP cada servicio lo atiende el consultorio de la sede principal (Q-20): el
// recurso `consultorio` activo de esa sede con menor (`orden`, `creado_en`). El alta
// lo crea y no hay interfaz para crear otro.

export type Consultorio = {
  id: string;
  sedeId: string;
  nombre: string;
  capacidad: number;
};

const columnas = {
  id: recurso.id,
  sedeId: recurso.sedeId,
  nombre: recurso.nombre,
  capacidad: recurso.capacidad,
};

/** El consultorio de la sede principal, o `null` si el negocio no existe (Q-20). */
export async function consultorioPrincipal(negocioId: string): Promise<Consultorio | null> {
  const [fila] = await db()
    .select(columnas)
    .from(recurso)
    .where(
      and(
        eq(recurso.negocioId, negocioId),
        eq(recurso.sedeId, idSedePrincipal(negocioId)),
        eq(recurso.tipo, "consultorio"),
        eq(recurso.activo, true),
      ),
    )
    .orderBy(asc(recurso.orden), asc(recurso.creadoEn), asc(recurso.id))
    .limit(1);
  return fila ?? null;
}
