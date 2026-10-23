import "server-only";
import { procesarNotificaciones } from "@/servidor/notificaciones/procesar";
import { proveedorResend, type ProveedorCorreo } from "@/servidor/notificaciones/proveedor";
import { aplicarAsistenciaPorDefecto } from "./asistencia-por-defecto";
import { aplicarVencimientos } from "./vencimientos";

// Las tareas del cron, cada 5 minutos (RN-16, RN-21, RN-31; ARCH §14.4, §14.5, §19.2 y
// §21.4; Q-75), en este orden: `aplicarVencimientos` primero, para que las siguientes ya
// vean las suspensiones; después `aplicarAsistenciaPorDefecto`; y al final
// `procesarNotificaciones`, que envía lo vencido, también los C-08 recién encolados. Cada
// tarea corre aunque falle la anterior, y su resultado se registra sin datos personales.

export type TareaCron = { nombre: string; correr: (ahora: Date) => Promise<unknown> };

/** Las tres tareas de ARCH §14.4. El proveedor se crea al procesar: si falta su clave, falla solo esa tarea. */
export function tareasDelCron(crearProveedor: () => ProveedorCorreo = () => proveedorResend()): TareaCron[] {
  return [
    { nombre: "aplicarVencimientos", correr: aplicarVencimientos },
    { nombre: "aplicarAsistenciaPorDefecto", correr: aplicarAsistenciaPorDefecto },
    { nombre: "procesarNotificaciones", correr: (ahora) => procesarNotificaciones({}, ahora, crearProveedor()) },
  ];
}

export type ResultadoCron = { ok: boolean; tareas: { nombre: string; ok: boolean }[] };

/**
 * Corre las tareas en orden, cada una aunque falle la anterior (Q-75), y registra cada
 * resultado: el resumen que devuelve la tarea (solo conteos) o el nombre del error, nunca
 * su mensaje (ARCH §19.2). `ok` es falso si alguna falló.
 */
export async function correrCron(ahora: Date, tareas: TareaCron[] = tareasDelCron()): Promise<ResultadoCron> {
  const resultados: ResultadoCron["tareas"] = [];
  for (const tarea of tareas) {
    const inicio = Date.now();
    try {
      const resumen = await tarea.correr(ahora);
      console.log(JSON.stringify({ evento: "cron_tarea", tarea: tarea.nombre, ok: true, ms: Date.now() - inicio, resumen }));
      resultados.push({ nombre: tarea.nombre, ok: true });
    } catch (e) {
      console.error(
        JSON.stringify({ evento: "cron_tarea", tarea: tarea.nombre, ok: false, ms: Date.now() - inicio, error: e instanceof Error ? e.name : "desconocido" }),
      );
      resultados.push({ nombre: tarea.nombre, ok: false });
    }
  }
  return { ok: resultados.every((r) => r.ok), tareas: resultados };
}
