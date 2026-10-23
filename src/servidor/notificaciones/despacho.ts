import "server-only";
import { after } from "next/server";
import { procesarNotificaciones } from "./procesar";
import { proveedorResend } from "./proveedor";

// Envío inmediato después de un cambio (C-01, C-03, C-04, C-05; RN-20, ADR-08; ARCH §11.1 y
// §14.4). Las notificaciones ya quedaron en la bandeja, en la misma transacción que el
// cambio. Después del COMMIT se pide procesar las de esa cita con `after()` de Next, que en
// el Worker usa el `waitUntil` de OpenNext: la respuesta no espera al correo. Si el envío
// inmediato falla, la notificación sigue pendiente y la recoge el cron (ARCH §14.4).

type Dependencias = {
  /** Corre la tarea después de responder: `after()` de Next. */
  programar: (tarea: () => Promise<void>) => void;
  procesar: (citaId: string) => Promise<unknown>;
};

const PRODUCCION: Dependencias = {
  programar: after,
  procesar: (citaId) => procesarNotificaciones({ citaId }, new Date(), proveedorResend()),
};

function registrarFallo(citaId: string, e: unknown) {
  // Sin el mensaje del error, que puede traer datos (ARCH §19.2).
  console.error(JSON.stringify({ evento: "despacho_fallido", citaId, error: e instanceof Error ? e.name : "desconocido" }));
}

type ResultadoConCita = { ok: true; valor: { citaId: string } } | { ok: false };

/**
 * Si la operación salió bien, pide enviar las notificaciones de su cita después de
 * responder. Devuelve el resultado sin cambiarlo: una operación que falla no despacha
 * nada, y un error del despacho nunca cambia la respuesta.
 */
export function despacharSiSalioBien<R extends ResultadoConCita>(resultado: R, dependencias: Dependencias = PRODUCCION): R {
  if (!resultado.ok) return resultado;
  const { citaId } = resultado.valor;
  try {
    dependencias.programar(async () => {
      try {
        await dependencias.procesar(citaId);
      } catch (e) {
        registrarFallo(citaId, e);
      }
    });
  } catch (e) {
    registrarFallo(citaId, e);
  }
  return resultado;
}
