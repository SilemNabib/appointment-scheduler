"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso } from "@/componentes/aviso";
import { claseBoton } from "@/componentes/estilos";
import type { Contacto } from "@/dominio/contactos";
import type { AccionesCliente } from "@/dominio/plazos";
import type { FechaLocal } from "@/dominio/tiempo";
import { cancelarPorLink, consultarDisponibilidadGestion, reprogramarPorLink, type CodigoApi, type LinkGestion } from "./api";
import { AvisoConContactos, mensajeSinAccion, motivoVisible } from "./gestion-cita";
import { PasoHorario, useDisponibilidad, type Consulta } from "./paso-horario";

// Acciones de la página de gestión (GES-02 a GES-04; F-02, F-03; RN-11, RN-13, RN-34;
// DESIGN §3, §4.2 y §5; Q-43 de TASKS-04, Q-70): "Cancelar cita" en dos pasos y
// "Reprogramar" con el calendario y las horas libres de la Fase 4, que consultan sin
// contar la propia cita (T6.20). Muestra el mensaje de Q-70 cuando el cliente no puede
// actuar. Cada respuesta se trata como en la reserva (T4.27): una hora ocupada recarga las
// horas; un cambio en lo que la cita admite recarga el estado; 429 y la falla de conexión
// se dicen con su texto. El botón muestra "Procesando…" y no admite un segundo envío, y el
// foco va al aviso del resultado (RNF-03).

type Modo = "detalle" | "confirmar_cancelacion" | "reprogramar";

/** El resultado que la página anuncia después de actuar. */
type Resultado = { tipo: "exito" | "error" | "advertencia"; texto: string; contactos?: boolean };

const TEXTOS: Partial<Record<CodigoApi, string>> = {
  DEMASIADAS_SOLICITUDES: "Hiciste muchas solicitudes seguidas. Intenta en un minuto.", // Q-43 de TASKS-04
  CONEXION: "No pudimos conectar. Revisa tu conexión e intenta de nuevo.",
  DATOS_INVALIDOS: "No pudimos procesar el cambio. Recarga la página e intenta de nuevo.",
};

/** Los códigos que dicen que la cita ya no admite lo que se intentó: se recarga su estado. */
const RECARGAN: readonly CodigoApi[] = ["FUERA_DE_PLAZO", "LIMITE_REPROGRAMACIONES", "NEGOCIO_SUSPENDIDO", "ESTADO_INVALIDO", "NO_ENCONTRADO"];

export function AccionesGestion({
  link,
  sedeId,
  acciones,
  limite,
  zonaHoraria,
  hoy,
  ultimoDia,
  contactos,
}: {
  link: LinkGestion;
  sedeId: string;
  acciones: AccionesCliente;
  /** `max_reprogramaciones_cliente`; `null` sin límite (RN-34). */
  limite: number | null;
  zonaHoraria: string;
  hoy: FechaLocal;
  ultimoDia: FechaLocal;
  contactos: readonly Contacto[];
}) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("detalle");
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  /** Justo después de cancelar, el texto de Q-70 dice que el cupo quedó libre. */
  const [recienCancelada, setRecienCancelada] = useState(false);
  const [fecha, setFecha] = useState<FechaLocal | null>(null);
  const [inicio, setInicio] = useState<string | null>(null);
  const [avisoHorario, setAvisoHorario] = useState<string | null>(null);

  const consulta = useCallback<Consulta>((rango) => consultarDisponibilidadGestion(link, rango), [link]);
  const disponibilidad = useDisponibilidad({ slug: link.slug, sedeId, servicioId: link.citaId, hoy, ultimoDia, consulta });

  // El foco va al aviso del resultado (RNF-03).
  const refResultado = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (resultado) refResultado.current?.focus();
  }, [resultado]);

  /** Un error de la API: recarga lo que haga falta y dice qué pasó. */
  function alFallar(codigo: CodigoApi) {
    if (RECARGAN.includes(codigo)) {
      setModo("detalle");
      setResultado(null);
      router.refresh(); // El estado nuevo trae el mensaje de Q-70 que corresponde.
      return;
    }
    setResultado({ tipo: "error", texto: TEXTOS[codigo] ?? TEXTOS.CONEXION!, contactos: codigo === "DATOS_INVALIDOS" });
  }

  async function cancelar() {
    if (procesando) return;
    setProcesando(true);
    setResultado(null);
    const r = await cancelarPorLink(link);
    setProcesando(false);
    if (r.ok) {
      setModo("detalle");
      setRecienCancelada(true);
      router.refresh();
      return;
    }
    alFallar(r.error.codigo);
  }

  async function reprogramar() {
    if (procesando || !inicio) return;
    setProcesando(true);
    setResultado(null);
    setAvisoHorario(null);
    const r = await reprogramarPorLink(link, inicio);
    setProcesando(false);
    if (r.ok) {
      setModo("detalle");
      setFecha(null);
      setInicio(null);
      disponibilidad.invalidar();
      setResultado({ tipo: "exito", texto: "Listo: tu cita cambió de hora. Te enviamos un correo con la hora nueva." });
      router.refresh();
      return;
    }
    if (r.error.codigo === "HORARIO_NO_DISPONIBLE") {
      // Otra persona tomó esa hora: se recargan las horas (RN-11).
      setInicio(null);
      disponibilidad.invalidar();
      setAvisoHorario("Esa hora se acaba de ocupar. Elige otra.");
      return;
    }
    alFallar(r.error.codigo);
  }

  if (recienCancelada) {
    return <AvisoConContactos mensaje="Esta cita fue cancelada y su cupo quedó libre." contactos={contactos} />;
  }

  const motivo = motivoVisible(acciones);
  const mensaje = motivo ? mensajeSinAccion(motivo, limite) : null;
  const quedan = acciones.reprogramacionesRestantes;

  return (
    <div className="flex flex-col gap-4">
      {resultado && (
        <div ref={refResultado} tabIndex={-1} className="outline-none">
          <Aviso tipo={resultado.tipo}>{resultado.texto}</Aviso>
        </div>
      )}
      {mensaje && <AvisoConContactos mensaje={mensaje} contactos={contactos} />}

      {modo === "detalle" && (acciones.reprogramar.permitida || acciones.cancelar.permitida) && (
        <div className="flex flex-col gap-3 border-t border-borde pt-4">
          {acciones.reprogramar.permitida && limite !== null && quedan !== null && (
            <p className="m-0 text-sm text-texto-muted">
              Te quedan {quedan} de {limite} reprogramaciones.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {acciones.reprogramar.permitida && (
              <button
                type="button"
                className={claseBoton("primario")}
                onClick={() => {
                  setResultado(null);
                  setModo("reprogramar");
                }}
              >
                Reprogramar
              </button>
            )}
            {acciones.cancelar.permitida && (
              <button
                type="button"
                className={claseBoton("peligro")}
                onClick={() => {
                  setResultado(null);
                  setModo("confirmar_cancelacion");
                }}
              >
                Cancelar cita
              </button>
            )}
          </div>
        </div>
      )}

      {modo === "confirmar_cancelacion" && (
        <div role="group" aria-labelledby="confirmar-cancelacion" className="flex flex-col gap-3 border-t border-borde pt-4">
          <p id="confirmar-cancelacion" className="m-0 font-bold">
            ¿Cancelar la cita?
          </p>
          <p className="m-0 text-sm text-texto-muted">Su cupo quedará libre para otra persona.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={claseBoton("peligro")} disabled={procesando} aria-busy={procesando} onClick={() => void cancelar()}>
              {procesando ? "Procesando…" : "Sí, cancelar mi cita"}
            </button>
            <button type="button" className={claseBoton("secundario")} disabled={procesando} onClick={() => setModo("detalle")}>
              No, volver
            </button>
          </div>
        </div>
      )}

      {modo === "reprogramar" && (
        <section aria-labelledby="titulo-reprogramar" className="flex flex-col gap-3 border-t border-borde pt-4">
          <h3 id="titulo-reprogramar" className="m-0 text-lg font-bold">
            Elige el nuevo día y la nueva hora
          </h3>
          {limite !== null && quedan !== null && (
            <p className="m-0 text-sm text-texto-muted">
              Te quedan {quedan} de {limite} reprogramaciones.
            </p>
          )}
          <PasoHorario
            disponibilidad={disponibilidad}
            hoy={hoy}
            ultimoDia={ultimoDia}
            zonaHoraria={zonaHoraria}
            fecha={fecha}
            inicio={inicio}
            aviso={avisoHorario}
            alElegirFecha={setFecha}
            alElegirInicio={setInicio}
            alSuspender={() => alFallar("NEGOCIO_SUSPENDIDO")}
            alContinuar={() => void reprogramar()}
            alVolver={() => {
              setAvisoHorario(null);
              setModo("detalle");
            }}
            textoContinuar="Confirmar cambio"
            textoVolver="Volver"
            procesando={procesando}
          />
        </section>
      )}
    </div>
  );
}
