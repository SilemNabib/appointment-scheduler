"use server";

import { redirect } from "next/navigation";
import { accion } from "@/servidor/accion";
import { requireMiembro } from "@/servidor/auth/sesion";
import { buscarCitaPorCodigo } from "@/servidor/casos-uso/detalle-cita";

// Server Actions de la agenda (PAN-02). Adaptadores delgados (ARCH §4): el negocio sale
// de la sesión. Buscar solo lee, así que usa `requireMiembro` y funciona con el negocio
// suspendido (D-14).

/** "Buscar por código" (Q-59): con la cita, lleva a su detalle; si no, devuelve el error. */
export const buscarCodigoPanel = accion(async (codigo: string) => {
  const ctx = await requireMiembro();
  const resultado = await buscarCitaPorCodigo(ctx, codigo);
  if (!resultado.ok) return resultado;
  // Fuera de cualquier try: `redirect` funciona lanzando un error que Next debe recibir.
  redirect(`/panel/citas/${resultado.valor.citaId}`);
});
