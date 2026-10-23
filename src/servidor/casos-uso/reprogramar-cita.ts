import "server-only";
import { z } from "zod";
import { accionesDelCliente, reprogramacionesRestantes } from "@/dominio/plazos";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import { estadoEfectivo } from "@/dominio/suscripcion";
import { enTransaccion } from "@/servidor/db/cliente";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import { cambiarHora, type HorarioNoDisponible } from "./agendar";
import { verificarLink, type CitaGestionada, type EntradaLink } from "./gestion-cita";

// Reprogramar desde el link (GES-03, F-03; RN-09, RN-11, RN-13, RN-14, RN-22, RN-34, D-14,
// D-20, S-07; ARCH §11.2, §11.3, §14.1, §18.3 y §18.4; Q-68, Q-69). Usa el mismo cambio de
// hora que el dueño (`cambiarHora`), con actor `cliente`: la anticipación de RN-09 aplica,
// el plazo de RN-13 y el límite de RN-34 se comprueban con la cita releída DESPUÉS del
// bloqueo de su recurso (T6.03), y la reprogramación suma 1 a `reprogramaciones_cliente`
// en la misma transacción. Así dos reprogramaciones a la vez nunca pasan el límite (ARCH §18.3).

const esquemaInicio = z.iso.datetime();

export type EntradaReprogramar = EntradaLink & { inicio: unknown };

export type ResultadoReprogramar =
  | Resultado<
      CitaGestionada,
      | "DATOS_INVALIDOS"
      | "NO_ENCONTRADO"
      | "NEGOCIO_SUSPENDIDO"
      | "FUERA_DE_PLAZO"
      | "LIMITE_REPROGRAMACIONES"
      | "ESTADO_INVALIDO"
    >
  | HorarioNoDisponible;

/**
 * El cliente cambia la hora de su cita (F-03). Con el link verificado y el negocio no
 * suspendido (D-14), en una transacción: la cita conserva su id, su código y su servicio
 * (RN-14, S-07); sube su `version` y sus reprogramaciones del cliente; se rehace su
 * recordatorio; y se encolan C-04 (`reprogramacion:{citaId}:v{version}`) y un solo C-06 al
 * dueño (`dueno_cambio:{citaId}:{eventoId}`, con la hora anterior y la nueva; Q-68). El
 * cliente no envía la versión (Q-69). Con el límite alcanzado devuelve
 * `LIMITE_REPROGRAMACIONES`; fuera del plazo, `FUERA_DE_PLAZO`; y con una hora que no
 * cumple RN-09, `HORARIO_NO_DISPONIBLE`. En todos esos casos no cambia nada.
 */
export async function reprogramarCita(entrada: EntradaReprogramar, ahora: Date): Promise<ResultadoReprogramar> {
  const v = await verificarLink(entrada);
  if (!v) return fallo("NO_ENCONTRADO");
  const leida = esquemaInicio.safeParse(entrada.inicio);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const inicio = new Date(leida.data);
  const suscripcion = estadoEfectivo(v.negocio, ahora);
  if (suscripcion.estado === "suspendida") return fallo("NEGOCIO_SUSPENDIDO");
  const negocio = { id: v.negocio.id, zonaHoraria: v.negocio.zonaHoraria };
  const limite = v.reglas.maxReprogramacionesCliente;

  return enTransaccion(async (tx): Promise<ResultadoReprogramar> => {
    let previas = 0;
    const cambio = await cambiarHora<"FUERA_DE_PLAZO" | "LIMITE_REPROGRAMACIONES" | "ESTADO_INVALIDO">(
      {
        negocio,
        citaId: v.cita.id,
        inicio,
        version: null,
        quien: { actor: "cliente" },
        validar: (cita) => {
          previas = cita.reprogramacionesCliente;
          const { reprogramar } = accionesDelCliente(cita, v.reglas, suscripcion, ahora);
          if (reprogramar.permitida) return null;
          return fallo(
            reprogramar.error === "FUERA_DE_PLAZO" || reprogramar.error === "LIMITE_REPROGRAMACIONES"
              ? reprogramar.error
              : "ESTADO_INVALIDO",
          );
        },
      },
      ahora,
      tx,
    );
    if (!cambio.ok) {
      if ("motivos" in cambio) return cambio;
      // El cliente no envía la versión, así que no hay conflicto posible: queda por tipos.
      return fallo(cambio.error === "CONFLICTO_VERSION" ? "ESTADO_INVALIDO" : cambio.error);
    }
    const c = cambio.valor;
    if (c.clienteCorreo !== null) {
      await notificaciones.encolar(
        negocio.id,
        c.clienteCorreo,
        [
          {
            citaId: c.citaId,
            tipo: "reprogramacion",
            claveIdempotencia: `reprogramacion:${c.citaId}:v${c.version}`,
            programadaPara: ahora,
            datos: { version: c.version, inicio_anterior: c.inicioAnterior.toISOString() },
          },
        ],
        tx,
      );
    }
    await notificaciones.encolarAlDueno(
      negocio.id,
      {
        citaId: c.citaId,
        tipo: "dueno_cambio",
        claveIdempotencia: `dueno_cambio:${c.citaId}:${c.eventoId}`,
        programadaPara: ahora,
        datos: { cambio: "reprogramada", inicio_anterior: c.inicioAnterior.toISOString(), inicio_nuevo: c.inicio.toISOString() },
      },
      tx,
    );
    return exito({
      citaId: c.citaId,
      estado: "confirmada",
      inicio: c.inicio.toISOString(),
      fin: c.fin.toISOString(),
      reprogramacionesRestantes: reprogramacionesRestantes(previas + 1, limite),
    });
  });
}
