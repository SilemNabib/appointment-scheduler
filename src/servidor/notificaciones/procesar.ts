import "server-only";
import { decidirEnvio, esCorreoDeCuenta, type CitaActual } from "@/dominio/envios";
import { estadoEfectivo } from "@/dominio/suscripcion";
import { mesLocal } from "@/dominio/tiempo";
import * as negocios from "@/servidor/db/repositorios/negocios";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import type { NotificacionReclamada } from "@/servidor/db/repositorios/notificaciones";
import { limite } from "@/servidor/planes/acceso";
import { armarMensaje } from "./mensajes";
import type { ProveedorCorreo } from "./proveedor";

// Procesador de la bandeja de salida (RN-20, RN-21, RN-25, D-14; ARCH §14.2, §14.3 y §16.3;
// Q-67, Q-75). Lo usan el cron, para todo lo vencido, y el envío inmediato, para las
// notificaciones de una cita (ARCH §14.4). Por cada notificación reclamada: la revalida
// con los datos actuales (`dominio/envios.ts`), comprueba `max_emails_per_month` en los
// correos de citas, arma el mensaje, lo envía con su clave de idempotencia y la marca.
// Registra cada resultado con identificadores, nunca con datos personales (ARCH §19.2).

/** Lotes por corrida: lo que quede sale en la siguiente (Q-75). */
export const MAXIMO_LOTES = 4;

export type ResultadoNotificacion = "enviada" | "anulada" | "reintento" | "fallida";

export type ResumenProceso = Record<ResultadoNotificacion, number>;

function registrar(n: NotificacionReclamada, { resultado, motivo }: Desenlace) {
  console.log(
    JSON.stringify({
      evento: "notificacion",
      notificacionId: n.id,
      negocioId: n.negocioId,
      citaId: n.citaId,
      tipo: n.tipo,
      intento: n.intentos,
      resultado: resultado ?? "retomada",
      ...(motivo ? { motivo } : {}),
    }),
  );
}

/** El nombre de un error inesperado, para `ultimo_error`: su mensaje puede traer datos. */
const errorInterno = (e: unknown) => `ERROR_INTERNO:${e instanceof Error ? e.name : "desconocido"}`;

/**
 * Si el negocio ya envió los correos de citas que le permite su plan este mes local
 * (RN-25; ARCH §16.3). Los de la cuenta no cuentan y nunca se detienen (ARCH §14.1).
 */
async function sinCupoDeCorreos(negocioId: string, zonaHoraria: string, ahora: Date): Promise<boolean> {
  const maximo = await limite(negocioId, "max_emails_per_month");
  if (maximo === null) return false;
  return (await notificaciones.contarEnviadas(negocioId, mesLocal(ahora, zonaHoraria))) >= maximo;
}

/**
 * Qué pasó con una notificación, y por qué si no salió. `null`: otro procesador la retomó
 * porque venció su arriendo, y la marca él.
 */
type Desenlace = { resultado: ResultadoNotificacion | null; motivo?: string };

const segun = (marcada: boolean, resultado: ResultadoNotificacion, motivo?: string): Desenlace => ({
  resultado: marcada ? resultado : null,
  motivo,
});

/** Procesa una notificación reclamada y la deja marcada. */
async function procesarUna(n: NotificacionReclamada, ahora: Date, proveedor: ProveedorCorreo): Promise<Desenlace> {
  // 1. Revalidar con los datos actuales (ARCH §14.3, paso 1; Q-67).
  const [suscripcion, negocio, cita] = await Promise.all([
    negocios.suscripcion(n.negocioId),
    notificaciones.negocioDelMensaje(n.negocioId),
    n.citaId ? notificaciones.citaDelMensaje(n.negocioId, n.citaId) : Promise.resolve(null),
  ]);
  if (!suscripcion || !negocio) throw new Error(`No existe el negocio de la notificación ${n.id}.`);
  const actual: CitaActual = cita ? { estado: cita.estado, version: cita.version } : null;
  const decision = decidirEnvio({ tipo: n.tipo, datos: n.datos }, actual, estadoEfectivo(suscripcion, ahora));
  if (!decision.enviar) {
    return segun(await notificaciones.anular(n, decision.ultimoError), "anulada", decision.ultimoError);
  }

  // 2. El límite del plan, solo en los correos de citas (ARCH §14.3, paso 2).
  if (!esCorreoDeCuenta(n.tipo) && (await sinCupoDeCorreos(n.negocioId, negocio.zonaHoraria, ahora))) {
    return segun(await notificaciones.marcarFallida(n, "LIMITE_PLAN"), "fallida", "LIMITE_PLAN");
  }

  // 3 y 4. Armar con los datos actuales y enviar con la clave de idempotencia.
  const resultado = await proveedor.enviar(await armarMensaje(n));

  // 5. Marcar (ARCH §14.3, paso 5).
  if (resultado.ok) return segun(await notificaciones.marcarEnviada(n, resultado.mensajeId, ahora), "enviada");
  if (resultado.claveYaUsada) {
    // El proveedor ya aceptó un mensaje con esta clave, con otro cuerpo: salió, así que
    // reenviarlo duplicaría el correo (RN-20). Queda enviada sin el id del proveedor.
    return segun(await notificaciones.marcarEnviada(n, null, ahora), "enviada", resultado.error);
  }
  return trasFallo(n, resultado.error, ahora);
}

/** Un envío fallido vuelve a la cola con su espera, o queda `fallida` en el 5.º intento. */
async function trasFallo(n: NotificacionReclamada, error: string, ahora: Date): Promise<Desenlace> {
  const estado = await notificaciones.registrarFallo(n, error, ahora);
  return { resultado: estado === null ? null : estado === "fallida" ? "fallida" : "reintento", motivo: error };
}

/**
 * Procesa las notificaciones vencidas: de a 25, hasta 4 lotes (Q-75); con `citaId`, solo
 * las de esa cita (el envío inmediato, ARCH §14.4). Una notificación que falla no detiene
 * a las demás: su error se registra y se reintenta con la espera de ARCH §14.3.
 */
export async function procesarNotificaciones(
  { citaId }: { citaId?: string },
  ahora: Date,
  proveedor: ProveedorCorreo,
): Promise<ResumenProceso> {
  const resumen: ResumenProceso = { enviada: 0, anulada: 0, reintento: 0, fallida: 0 };
  for (let lote = 0; lote < MAXIMO_LOTES; lote++) {
    const reclamadas = await notificaciones.reclamar(ahora, { citaId });
    for (const n of reclamadas) {
      let desenlace: Desenlace;
      try {
        desenlace = await procesarUna(n, ahora, proveedor);
      } catch (e) {
        // Un error inesperado (los datos ya no están, una falla de la base): se reintenta.
        desenlace = await trasFallo(n, errorInterno(e), ahora).catch(() => ({ resultado: null, motivo: errorInterno(e) }));
      }
      registrar(n, desenlace);
      if (desenlace.resultado) resumen[desenlace.resultado]++;
    }
    if (reclamadas.length < notificaciones.TAMANO_LOTE) break;
  }
  return resumen;
}
