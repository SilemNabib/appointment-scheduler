"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso } from "@/componentes/aviso";
import { claseBoton } from "@/componentes/formulario";
import { mesDe, mesesNavegables, moverMes, rangoDelMes, siguienteDiaConCupo, type Mes } from "@/dominio/calendario";
import { formatearDiaLocal } from "@/dominio/formato";
import { sumarDias, type FechaLocal } from "@/dominio/tiempo";
import { consultarDisponibilidad, type CodigoApi, type DiaDisponible } from "./api";
import { Calendario, type EstadoDia } from "./calendario";
import { HorasLibres } from "./horas-libres";

// Paso "Día y hora" (PUB-03, PUB-04; F-01; Q-48). El calendario consulta la
// disponibilidad del mes visible en una sola solicitud, recortada a los días
// reservables, y la guarda: volver a un mes no la repite. Al entrar se elige el primer
// día con cupo. Si el día elegido queda sin horas, lo dice y ofrece el siguiente día con
// cupo, aunque esté en otro mes.

type EstadoMes = { estado: "cargando" } | { estado: "listo"; dias: DiaDisponible[] } | { estado: "error"; codigo: CodigoApi };

/** Igualdad de meses. */
const mismoMes = (a: Mes, b: Mes) => a.anio === b.anio && a.mes === b.mes;

/**
 * La disponibilidad de un servicio por mes, guardada mientras dure el flujo (la usa
 * `Reserva`, para que sobreviva a los cambios de paso). `invalidar` la borra, para
 * volver a consultar después de una hora ocupada (F-01).
 */
export function useDisponibilidad(c: { slug: string; sedeId: string; servicioId: string | null; hoy: FechaLocal; ultimoDia: FechaLocal }) {
  const { slug, sedeId, servicioId, hoy, ultimoDia } = c;
  const [meses, setMeses] = useState<Record<string, EstadoMes>>({});
  /** Las solicitudes hechas o en curso, por mes: una sola por mes (Q-48). */
  const pedidas = useRef(new Map<string, Promise<DiaDisponible[] | null>>());
  const clave = useCallback((m: Mes) => `${servicioId}|${m.anio}-${m.mes}`, [servicioId]);

  const cargar = useCallback(
    (m: Mes): Promise<DiaDisponible[] | null> => {
      if (!servicioId) return Promise.resolve(null);
      const k = clave(m);
      const pedida = pedidas.current.get(k);
      if (pedida) return pedida;
      const rango = rangoDelMes(m, hoy, ultimoDia);
      if (!rango) return Promise.resolve([]);
      setMeses((p) => ({ ...p, [k]: { estado: "cargando" } }));
      const promesa = consultarDisponibilidad({ slug, sedeId, servicioId, ...rango }).then((r) => {
        if (r.ok) {
          setMeses((p) => ({ ...p, [k]: { estado: "listo", dias: r.valor.dias } }));
          return r.valor.dias;
        }
        pedidas.current.delete(k); // un error se puede reintentar
        setMeses((p) => ({ ...p, [k]: { estado: "error", codigo: r.error.codigo } }));
        return null;
      });
      pedidas.current.set(k, promesa);
      return promesa;
    },
    [clave, hoy, sedeId, servicioId, slug, ultimoDia],
  );

  const invalidar = useCallback(() => {
    pedidas.current.clear();
    setMeses({});
  }, []);

  const estadoMes = useCallback((m: Mes): EstadoMes | undefined => meses[clave(m)], [clave, meses]);
  return { cargar, invalidar, estadoMes };
}

export type Disponibilidad = ReturnType<typeof useDisponibilidad>;

const ERRORES: Partial<Record<CodigoApi, string>> = {
  CONEXION: "No pudimos cargar los horarios. Revisa tu conexión e intenta de nuevo.",
  NO_ENCONTRADO: "Este servicio ya no está disponible. Recarga la página para ver los servicios.",
  DEMASIADAS_SOLICITUDES: "Hiciste muchas solicitudes seguidas. Intenta en un minuto.",
};

export function PasoHorario({
  disponibilidad,
  hoy,
  ultimoDia,
  zonaHoraria,
  fecha,
  inicio,
  aviso,
  alElegirFecha,
  alElegirInicio,
  alSuspender,
  alContinuar,
  alVolver,
}: {
  disponibilidad: Disponibilidad;
  hoy: FechaLocal;
  ultimoDia: FechaLocal;
  zonaHoraria: string;
  fecha: FechaLocal | null;
  inicio: string | null;
  /** Un aviso que trae el flujo, como el de la hora ocupada (F-01). */
  aviso: string | null;
  alElegirFecha: (fecha: FechaLocal) => void;
  alElegirInicio: (inicio: string | null) => void;
  alSuspender: () => void;
  alContinuar: () => void;
  alVolver: () => void;
}) {
  const { cargar, estadoMes } = disponibilidad;
  // El aviso del flujo (la hora ocupada) recibe el foco al aparecer (RNF-03).
  const refAviso = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (aviso) refAviso.current?.focus();
  }, [aviso]);
  const navegables = mesesNavegables(hoy, ultimoDia);
  const [mes, setMes] = useState<Mes>(() => mesDe(fecha ?? hoy));
  const indice = navegables.findIndex((m) => mismoMes(m, mes));
  const visible = estadoMes(mes);

  // El mes visible: una solicitud, la primera vez.
  useEffect(() => {
    void cargar(mes);
  }, [cargar, mes]);

  // Al entrar sin día, el primer día con cupo, aunque esté en un mes siguiente (Q-48).
  useEffect(() => {
    if (fecha) return;
    let cancelado = false;
    void (async () => {
      for (const m of mesesNavegables(hoy, ultimoDia)) {
        const dias = await cargar(m);
        if (cancelado || dias === null) return;
        const primero = siguienteDiaConCupo(dias, hoy);
        if (primero) {
          alElegirFecha(primero);
          setMes(m);
          return;
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [alElegirFecha, cargar, fecha, hoy, ultimoDia]);

  // Un negocio que se suspendió después de cargar la página (RN-04).
  const errorVisible = visible?.estado === "error" ? visible.codigo : null;
  useEffect(() => {
    if (errorVisible === "NEGOCIO_SUSPENDIDO") alSuspender();
  }, [alSuspender, errorVisible]);

  const diasDe = (m: Mes) => {
    const e = estadoMes(m);
    return e?.estado === "listo" ? e.dias : null;
  };
  const delMesVisible = diasDe(mes);
  const estadoDe = (f: FechaLocal): EstadoDia => {
    if (f < hoy || f > ultimoDia || !delMesVisible) return "fuera";
    const dia = delMesVisible.find((d) => d.fecha === f);
    return dia && dia.inicios.length > 0 ? "disponible" : "sin_cupos";
  };

  // Las horas del día elegido y, si no le quedan, el siguiente día con cupo (F-01).
  const delDia = fecha ? diasDe(mesDe(fecha))?.find((d) => d.fecha === fecha) : undefined;
  const sinHoras = fecha !== null && delDia !== undefined && delDia.inicios.length === 0;
  const [siguiente, setSiguiente] = useState<{ desde: FechaLocal; fecha: FechaLocal | null } | null>(null);
  useEffect(() => {
    if (!sinHoras || !fecha) return;
    let cancelado = false;
    void (async () => {
      const desde = sumarDias(fecha, 1);
      for (const m of mesesNavegables(fecha, ultimoDia)) {
        const dias = await cargar(m);
        if (cancelado || dias === null) return;
        const encontrado = siguienteDiaConCupo(dias, desde);
        if (encontrado) return setSiguiente({ desde: fecha, fecha: encontrado });
      }
      if (!cancelado) setSiguiente({ desde: fecha, fecha: null });
    })();
    return () => {
      cancelado = true;
    };
  }, [cargar, fecha, sinHoras, ultimoDia]);
  const siguienteDia = siguiente && siguiente.desde === fecha ? siguiente.fecha : undefined;

  const elegirDia = (f: FechaLocal) => {
    alElegirFecha(f);
    alElegirInicio(null);
    setMes(mesDe(f));
  };

  return (
    <div className="flex flex-col gap-[18px]">
      {aviso && (
        <div ref={refAviso} tabIndex={-1} className="outline-none">
          <Aviso tipo="advertencia">{aviso}</Aviso>
        </div>
      )}
      {errorVisible && errorVisible !== "NEGOCIO_SUSPENDIDO" && (
        <Aviso tipo="error">
          <span className="flex flex-wrap items-center gap-3">
            {ERRORES[errorVisible] ?? ERRORES.CONEXION}
            <button type="button" className={claseBoton("secundario")} onClick={() => void cargar(mes)}>
              Reintentar
            </button>
          </span>
        </Aviso>
      )}
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col">
          <Calendario
            mes={mes}
            estadoDe={estadoDe}
            hoy={hoy}
            seleccionado={fecha}
            cargando={visible === undefined || visible.estado === "cargando"}
            puedeAnterior={indice > 0}
            puedeSiguiente={indice >= 0 && indice < navegables.length - 1}
            alElegir={elegirDia}
            alMover={(pasos) => setMes((m) => moverMes(m, pasos))}
          />
        </div>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-3.5 rounded-[18px] bg-fondo p-[18px]">
          {!fecha ? (
            <p className="m-0 text-texto-muted">Selecciona un día del calendario para ver las horas libres.</p>
          ) : (
            <>
              <h3 className="m-0 font-cuerpo text-[17px] font-bold first-letter:uppercase">{formatearDiaLocal(fecha)}</h3>
              {sinHoras ? (
                <div className="flex flex-col gap-2.5" role="status">
                  <p className="m-0">No quedan horas libres este día.</p>
                  {siguienteDia && (
                    <button type="button" className={`${claseBoton("primario")} self-start`} onClick={() => elegirDia(siguienteDia)}>
                      Ver horas del {formatearDiaLocal(siguienteDia)}
                    </button>
                  )}
                  {siguienteDia === null && (
                    <p className="m-0 text-texto-muted">No hay más días con cupo hasta el {formatearDiaLocal(ultimoDia, true)}.</p>
                  )}
                </div>
              ) : delDia ? (
                <HorasLibres inicios={delDia.inicios} zonaHoraria={zonaHoraria} elegido={inicio} alElegir={alElegirInicio} />
              ) : (
                <p className="m-0 text-texto-muted">Cargando las horas…</p>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-[18px]">
        <button type="button" className={claseBoton("secundario")} onClick={alVolver}>
          Atrás
        </button>
        <button type="button" className={`${claseBoton("primario")} min-h-[52px] px-[26px] text-base`} disabled={!inicio} onClick={alContinuar}>
          Continuar
        </button>
      </div>
    </div>
  );
}
