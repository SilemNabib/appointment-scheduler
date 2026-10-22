"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Aviso, type TipoAviso } from "@/componentes/aviso";
import { claseBoton } from "@/componentes/estilos";
import { mensajeDeError } from "@/componentes/mensajes";
import { HorasDueno, useHorasDueno } from "@/componentes/panel/horas-dueno";
import { formatearDiaLocal, formatearFechaHora } from "@/dominio/formato";
import type { CodigoError } from "@/dominio/resultado";
import { sumarDias, type FechaLocal } from "@/dominio/tiempo";
import { horasParaMoverPanel, moverCitaPanel } from "./acciones";

// "Mover" en el detalle de la cita (PAN-05, F-07; RN-14, RN-15, D-11, S-07; Q-55, Q-56):
// el día y las horas libres del mismo servicio sin contar la propia cita, y "Confirmar
// cambio" con la `version` que se mostró. Si la cita cambió mientras tanto
// (`CONFLICTO_VERSION`), lo dice y recarga el detalle; si la hora se ocupó, recarga las
// horas. El aviso del resultado recibe el foco (RNF-03).

type AvisoMover = { tipo: TipoAviso; texto: string };

const conMayuscula = (texto: string) => texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1);

export function MoverCita({
  citaId,
  servicioId,
  version,
  inicioActual,
  fechaActual,
  hoy,
  zonaHoraria,
}: {
  citaId: string;
  servicioId: string;
  /** La versión que muestra el detalle (control optimista; Q-55). */
  version: number;
  /** El inicio actual de la cita, en ISO, que no se ofrece como hora nueva. */
  inicioActual: string;
  fechaActual: FechaLocal;
  hoy: FechaLocal;
  zonaHoraria: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState<FechaLocal>(fechaActual < hoy ? hoy : fechaActual);
  const [inicio, setInicio] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoMover | null>(null);
  const [enviando, iniciar] = useTransition();
  const refAviso = useRef<HTMLDivElement>(null);
  const { estado, recargar } = useHorasDueno(horasParaMoverPanel, {
    servicioId: abierto ? servicioId : null,
    fecha,
    citaExcluida: citaId,
  });

  useEffect(() => {
    if (aviso) refAviso.current?.focus();
  }, [aviso]);

  // La hora que ya tiene no es un cambio: no se ofrece.
  const horas = estado.tipo === "listo" ? { ...estado, inicios: estado.inicios.filter((i) => i !== inicioActual) } : estado;
  const elegido = inicio && horas.tipo === "listo" && horas.inicios.includes(inicio) ? inicio : null;

  function cambiarDia(nueva: FechaLocal) {
    setFecha(nueva);
    setInicio(null);
  }

  function confirmar() {
    if (!elegido) return;
    iniciar(async () => {
      const resultado = await moverCitaPanel({ citaId, inicio: elegido, version });
      if (resultado.ok) {
        setAbierto(false);
        setInicio(null);
        recargar();
        // La hora termina en "a. m." o "p. m.": su punto cierra la oración.
        setAviso({ tipo: "exito", texto: `Moviste la cita al ${formatearFechaHora(new Date(elegido), zonaHoraria)}` });
        router.refresh();
        return;
      }
      switch (resultado.error) {
        case "CONFLICTO_VERSION":
          setAbierto(false);
          setAviso({ tipo: "error", texto: "La cita cambió mientras la mirabas: recargamos el detalle. Revísalo y vuelve a intentarlo." });
          router.refresh();
          return;
        case "HORARIO_NO_DISPONIBLE":
          setInicio(null);
          recargar();
          setAviso({ tipo: "error", texto: "Esa hora ya no está disponible. Elige otra." });
          return;
        case "ESTADO_INVALIDO":
          setAbierto(false);
          setAviso({ tipo: "error", texto: "Esta cita ya no se puede mover." });
          router.refresh();
          return;
        default:
          setAviso({ tipo: "error", texto: mensajeDeError(resultado.error as CodigoError) });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {aviso && (
        <div ref={refAviso} tabIndex={-1} className="outline-none">
          <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>
        </div>
      )}
      {!abierto ? (
        <div>
          <button
            type="button"
            onClick={() => {
              setAbierto(true);
              setAviso(null);
            }}
            className={claseBoton("secundario")}
          >
            Mover
          </button>
        </div>
      ) : (
        <div role="group" aria-labelledby="mover-titulo" className="flex flex-col gap-4 rounded-boton border border-borde p-4">
          <div className="flex flex-col gap-1">
            <h3 id="mover-titulo" className="text-lg font-bold">
              Mover la cita
            </h3>
            <p className="text-sm text-texto-muted">Elige otra hora libre del mismo servicio. El cliente conserva sus reprogramaciones.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => cambiarDia(sumarDias(fecha, -1))}
              disabled={fecha <= hoy}
              aria-label="Día anterior"
              className={claseBoton("secundario")}
            >
              Anterior
            </button>
            <p aria-live="polite" className="min-w-0 flex-1 text-center font-semibold">
              {conMayuscula(formatearDiaLocal(fecha, true))}
            </p>
            <button type="button" onClick={() => cambiarDia(sumarDias(fecha, 1))} aria-label="Día siguiente" className={claseBoton("secundario")}>
              Siguiente
            </button>
          </div>
          <HorasDueno estado={horas} zonaHoraria={zonaHoraria} elegido={elegido} alElegir={setInicio} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={confirmar} disabled={!elegido || enviando} className={claseBoton("primario")}>
              {enviando ? "Moviendo…" : "Confirmar cambio"}
            </button>
            <button type="button" onClick={() => setAbierto(false)} disabled={enviando} className={claseBoton("secundario")}>
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
