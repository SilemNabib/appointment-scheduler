"use client";

import { useCallback, useEffect, useState } from "react";
import { HorasLibres } from "@/componentes/publico/horas-libres";

// Horas libres de un servicio para el dueño (PAN-04, PAN-05; D-11; Q-56): el mismo
// selector de hora de la página pública (DESIGN §3), con los estados de la consulta. Las
// horas salen de `consultarHorasDueno`, así que el panel ofrece solo las que el servidor
// después acepta (D-01).

export type EstadoHoras =
  | { tipo: "sin-servicio" }
  | { tipo: "cargando" }
  | { tipo: "error" }
  | { tipo: "listo"; inicios: readonly string[] };

/** La consulta de horas (la Server Action de la página, con `consultarHorasDueno`). */
export type ConsultarHoras = (entrada: {
  servicioId: string;
  fecha: string;
  citaExcluida?: string;
}) => Promise<{ ok: true; valor: { inicios: string[] } } | { ok: false; error: string }>;

/**
 * Las horas libres de un servicio en un día, guardadas por servicio, día y versión: volver
 * a un día no repite la consulta, y `recargar` la repite (después de "Esa hora ya no está
 * disponible"; F-06, paso 5).
 */
export function useHorasDueno(
  consultar: ConsultarHoras,
  { servicioId, fecha, citaExcluida }: { servicioId: string | null; fecha: string; citaExcluida?: string },
) {
  const [version, setVersion] = useState(0);
  const [resultados, setResultados] = useState<Record<string, EstadoHoras>>({});
  const clave = servicioId ? `${servicioId}|${fecha}|${version}` : null;

  useEffect(() => {
    if (!clave || !servicioId || resultados[clave]) return;
    let vigente = true;
    consultar({ servicioId, fecha, ...(citaExcluida ? { citaExcluida } : {}) }).then(
      (r) => {
        if (vigente) setResultados((p) => ({ ...p, [clave]: r.ok ? { tipo: "listo", inicios: r.valor.inicios } : { tipo: "error" } }));
      },
      () => {
        if (vigente) setResultados((p) => ({ ...p, [clave]: { tipo: "error" } }));
      },
    );
    return () => {
      vigente = false;
    };
  }, [citaExcluida, clave, consultar, fecha, resultados, servicioId]);

  const estado: EstadoHoras = !clave ? { tipo: "sin-servicio" } : (resultados[clave] ?? { tipo: "cargando" });
  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { estado, recargar };
}

export function HorasDueno({
  estado,
  zonaHoraria,
  elegido,
  alElegir,
  sinHoras = "No hay horas libres este día.",
}: {
  estado: EstadoHoras;
  zonaHoraria: string;
  elegido: string | null;
  alElegir: (inicio: string) => void;
  sinHoras?: string;
}) {
  // `aria-live`: al cambiar de día o de servicio, el lector de pantalla anuncia el resultado.
  return (
    <div aria-live="polite" aria-busy={estado.tipo === "cargando"} className="flex flex-col gap-2">
      {estado.tipo === "sin-servicio" && <p className="text-sm text-texto-muted">Elige un servicio para ver sus horas libres.</p>}
      {estado.tipo === "cargando" && (
        <p className="flex items-center gap-2 text-sm text-texto-muted">
          <span aria-hidden="true" className="size-4 animate-giro rounded-full border-2 border-borde-control border-t-tinta" />
          Buscando horas libres…
        </p>
      )}
      {estado.tipo === "error" && (
        <p className="text-sm font-semibold text-error-texto">No pudimos cargar las horas. Intenta de nuevo.</p>
      )}
      {estado.tipo === "listo" &&
        (estado.inicios.length === 0 ? (
          <p className="text-sm text-tinta-suave">{sinHoras}</p>
        ) : (
          <HorasLibres inicios={estado.inicios} zonaHoraria={zonaHoraria} elegido={elegido} alElegir={alElegir} />
        ))}
    </div>
  );
}
