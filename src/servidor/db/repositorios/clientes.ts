import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import { decidirIdentidad, type ClienteConocido, type DatosIdentidad } from "@/dominio/identidad-cliente";
import type { Transaccion } from "../cliente";
import { cliente } from "../esquema";

// Clientes del negocio (RN-18, RN-19; ARCH §12). Toda función recibe `negocioId` y lo
// usa en el WHERE (ARCH §6, defensa 1): el mismo teléfono en otro negocio es otro
// cliente.

const columnas = { id: cliente.id, telefonoE164: cliente.telefonoE164, correo: cliente.correo };

/**
 * Cliente al que se asocia una cita, dentro de la transacción de la reserva: busca en
 * el negocio por teléfono y por correo (ya normalizados), aplica `decidirIdentidad` y
 * crea o actualiza el cliente. Devuelve su id.
 *
 * El caso nuevo usa `INSERT … ON CONFLICT (negocio_id, telefono_e164)`: si otra reserva
 * (de otro recurso, que no espera el mismo bloqueo) creó ese teléfono después de la
 * búsqueda, se actualiza ese cliente en lugar de chocar. Un choque por el correo de
 * otro cliente sí llega como error de unicidad; quien llama reintenta la transacción
 * (ARCH §12).
 */
export async function resolver(negocioId: string, datos: DatosIdentidad, tx: Transaccion): Promise<string> {
  const coincidencias = await tx
    .select(columnas)
    .from(cliente)
    .where(
      and(
        eq(cliente.negocioId, negocioId),
        datos.correo === null
          ? eq(cliente.telefonoE164, datos.telefonoE164)
          : or(eq(cliente.telefonoE164, datos.telefonoE164), eq(cliente.correo, datos.correo)),
      ),
    );
  const porTelefono: ClienteConocido | null = coincidencias.find((c) => c.telefonoE164 === datos.telefonoE164) ?? null;
  const porCorreo: ClienteConocido | null =
    datos.correo === null ? null : (coincidencias.find((c) => c.correo === datos.correo) ?? null);

  const decision = decidirIdentidad(datos, porTelefono, porCorreo);
  if (decision.tipo === "existente") {
    await tx
      .update(cliente)
      .set(decision.cambios)
      .where(and(eq(cliente.negocioId, negocioId), eq(cliente.id, decision.clienteId)));
    return decision.clienteId;
  }

  const [{ id }] = await tx
    .insert(cliente)
    .values({ negocioId, ...decision.datos })
    .onConflictDoUpdate({
      target: [cliente.negocioId, cliente.telefonoE164],
      // Como si hubiera coincidido por teléfono: nombre nuevo y correo solo si faltaba (S-15).
      set: {
        nombre: sql`excluded.nombre`,
        apellido: sql`excluded.apellido`,
        correo: sql`coalesce(${cliente.correo}, excluded.correo)`,
        actualizadoEn: sql`now()`, // `$onUpdate` no aplica a ON CONFLICT
      },
    })
    .returning({ id: cliente.id });
  return id;
}
