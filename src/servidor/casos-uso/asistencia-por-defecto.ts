import "server-only";
import { enTransaccion } from "@/servidor/db/cliente";
import * as citas from "@/servidor/db/repositorios/citas";

// La asistencia por defecto en el cron (RN-16, D-14, D-21; F-08, paso 3; ARCH §14.4 y
// §18.3; Q-55 de TASKS-05, Q-75). Si el dueño no marca una cita que ya terminó, el cron la
// marca con el valor de su negocio, a más tardar 5 minutos después de su fin. No lo hace
// con "siempre decido yo" ni con el negocio suspendido; al reactivarlo, la siguiente
// corrida las marca. El dueño la puede corregir después (S-09).

/** Marca las citas terminadas sin marcar y devuelve cuántas. */
export async function aplicarAsistenciaPorDefecto(ahora: Date): Promise<{ marcadas: number }> {
  return enTransaccion(async (tx) => ({ marcadas: await citas.marcarAsistenciaPorDefecto(ahora, tx) }));
}
