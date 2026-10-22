"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Aviso, type TipoAviso } from "@/componentes/aviso";
import { claseBoton } from "@/componentes/estilos";
import { Seccion } from "@/componentes/formulario";
import { mensajeDeError } from "@/componentes/mensajes";
import type { EstadoAsistencia, EstadoCita } from "@/dominio/estados-cita";
import type { CodigoError } from "@/dominio/resultado";
import { cancelarCitaPanel, marcarAsistenciaPanel } from "./acciones";
import { MoverCita } from "./mover";

// Las acciones del detalle de la cita (PAN-05 a PAN-07, F-07, F-08; RN-10, RN-15, RN-16,
// S-08, S-09; DESIGN §3 y §6; Q-55): mover, cancelar con la confirmación en dos pasos
// ("¿Cancelar la cita?" y "Sí, cancelar") y, desde el inicio, "Asistió" y "No asistió",
// con la corrección entre las dos. Solo se muestran las que permite la cita en ese
// momento (detalleCita); el servidor las vuelve a comprobar. Después de cada acción, el
// foco va al aviso del resultado (RNF-03).
//
// La página lo monta siempre en el mismo lugar: así el aviso de una cancelación sigue a
// la vista aunque la cita, ya cancelada, no tenga acciones (S-08).

type AvisoAccion = { tipo: TipoAviso; texto: string };

const PALABRA: Record<EstadoAsistencia, string> = { completada: "asistió", no_asistio: "no asistió" };

export function AccionesCita({
  citaId,
  estado,
  acciones,
  mover,
}: {
  citaId: string;
  estado: EstadoCita;
  acciones: { mover: boolean; cancelar: boolean; marcar: boolean };
  /** Lo que necesita "Mover" (T5.21), sin el id de la cita. */
  mover: Omit<Parameters<typeof MoverCita>[0], "citaId">;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<AvisoAccion | null>(null);
  const [enviando, iniciar] = useTransition();
  const refAviso = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aviso) refAviso.current?.focus();
  }, [aviso]);

  const hayAcciones = acciones.mover || acciones.cancelar || acciones.marcar;
  if (!hayAcciones && !aviso) return null;

  /** Un error que se explica con que la cita cambió: se avisa y se recarga el detalle. */
  function siCambio(error: string): boolean {
    if (error !== "ESTADO_INVALIDO") return false;
    setAviso({ tipo: "error", texto: "La cita cambió mientras la mirabas: recargamos el detalle. Revísalo y vuelve a intentarlo." });
    router.refresh();
    return true;
  }

  function cancelar() {
    iniciar(async () => {
      const resultado = await cancelarCitaPanel(citaId);
      setConfirmando(false);
      if (resultado.ok) {
        setAviso({ tipo: "exito", texto: "Cancelaste la cita. Su hora quedó libre." });
        router.refresh();
      } else if (!siCambio(resultado.error)) {
        setAviso({ tipo: "error", texto: mensajeDeError(resultado.error as CodigoError) });
      }
    });
  }

  function marcar(nuevo: EstadoAsistencia) {
    iniciar(async () => {
      const resultado = await marcarAsistenciaPanel({ citaId, estado: nuevo, estadoEsperado: estado });
      if (resultado.ok) {
        setAviso({
          tipo: "exito",
          texto: estado === "confirmada" ? `Marcaste que ${PALABRA[nuevo]}.` : `Corregiste la asistencia: ${PALABRA[nuevo]}.`,
        });
        router.refresh();
      } else if (!siCambio(resultado.error)) {
        setAviso({
          tipo: "error",
          texto: mensajeDeError(resultado.error as CodigoError, {
            ANTES_DEL_INICIO: "La cita todavía no empieza: podrás marcar la asistencia desde su hora de inicio.",
          }),
        });
      }
    });
  }

  return (
    <Seccion titulo="Acciones">
      {aviso && (
        <div ref={refAviso} tabIndex={-1} className="outline-none">
          <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>
        </div>
      )}

      {acciones.marcar && (
        <div role="group" aria-labelledby="asistencia-titulo" className="flex flex-col gap-2">
          <p id="asistencia-titulo" className="text-sm font-semibold">
            Asistencia
          </p>
          {estado === "confirmada" ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => marcar("completada")} disabled={enviando} className={claseBoton("secundario")}>
                Asistió
              </button>
              <button type="button" onClick={() => marcar("no_asistio")} disabled={enviando} className={claseBoton("secundario")}>
                No asistió
              </button>
            </div>
          ) : (
            (estado === "completada" || estado === "no_asistio") && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-tinta-suave">Marcaste que {PALABRA[estado]}.</p>
                <button
                  type="button"
                  onClick={() => marcar(estado === "completada" ? "no_asistio" : "completada")}
                  disabled={enviando}
                  className={claseBoton("secundario")}
                >
                  {estado === "completada" ? "Cambiar a No asistió" : "Cambiar a Asistió"}
                </button>
              </div>
            )
          )}
        </div>
      )}

      {acciones.mover && <MoverCita citaId={citaId} {...mover} />}

      {acciones.cancelar &&
        (confirmando ? (
          <div role="group" aria-labelledby="cancelar-titulo" className="flex flex-col gap-3 rounded-boton border border-error-borde bg-error-fondo p-4">
            <p id="cancelar-titulo" className="font-semibold text-error-texto">
              ¿Cancelar la cita?
            </p>
            <p className="text-sm text-tinta-suave">La hora queda libre y, si la cita tiene correo, el cliente recibe el aviso.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={cancelar} disabled={enviando} className={claseBoton("peligro")}>
                {enviando ? "Cancelando…" : "Sí, cancelar"}
              </button>
              <button type="button" onClick={() => setConfirmando(false)} disabled={enviando} className={claseBoton("secundario")}>
                No, volver
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => {
                setConfirmando(true);
                setAviso(null);
              }}
              className={claseBoton("peligro")}
            >
              Cancelar cita
            </button>
          </div>
        ))}
    </Seccion>
  );
}
