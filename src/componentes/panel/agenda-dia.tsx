import Link from "next/link";
import { ANILLO_FOCO } from "@/componentes/estilos";
import type { EstadoCita } from "@/dominio/estados-cita";
import { formatearHora, formatearIntervalo } from "@/dominio/formato";
import { minutosLocales, type FechaLocal } from "@/dominio/tiempo";
import { BadgeEstadoCita } from "./estado-cita";

// Vista de día de la agenda (PAN-02, F-06; RN-03, RNF-02, RNF-03; Q-56, Q-58): las citas
// y los bloqueos del día por hora, y los espacios libres, cada uno con su enlace a "Nueva
// cita". Las horas van en la zona del negocio, nunca en la del dispositivo (RN-03). Una
// cita cancelada se distingue por su badge, no solo por el color (RNF-03).

export type CitaDelDia = {
  id: string;
  codigo: string;
  inicio: Date;
  fin: Date;
  servicio: string;
  cliente: string;
  estado: EstadoCita;
};

export type BloqueoDelDia = { id: string; inicio: Date; fin: Date; motivo: string | null };

type Entrada = { tipo: "cita"; cita: CitaDelDia } | { tipo: "bloqueo"; bloqueo: BloqueoDelDia };

const inicioDe = (e: Entrada) => (e.tipo === "cita" ? e.cita.inicio : e.bloqueo.inicio).getTime();

/** La hora local `HH:mm` de un instante, para el enlace a "Nueva cita". */
function horaLocal(instante: Date, zona: string): string {
  const minutos = Math.floor(minutosLocales(instante, zona));
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

export function AgendaDia({
  fecha,
  esHoy,
  zonaHoraria,
  citas,
  bloqueos,
  espacios,
}: {
  fecha: FechaLocal;
  esHoy: boolean;
  zonaHoraria: string;
  citas: readonly CitaDelDia[];
  bloqueos: readonly BloqueoDelDia[];
  /** Los espacios libres del día (`dominio/agenda.ts`), ya sin los que pasaron. */
  espacios: readonly Date[];
}) {
  const entradas: Entrada[] = [
    ...citas.map((cita) => ({ tipo: "cita" as const, cita })),
    ...bloqueos.map((bloqueo) => ({ tipo: "bloqueo" as const, bloqueo })),
  ].sort((a, b) => inicioDe(a) - inicioDe(b));

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="agenda-dia-citas" className="flex flex-col gap-3">
        <h2 id="agenda-dia-citas" className="text-xl font-bold">
          Citas
        </h2>
        {citas.length === 0 && (
          <p className="rounded-boton border border-borde bg-superficie px-4 py-3.5 text-tinta-suave">
            {esHoy ? "No tienes citas hoy." : "No tienes citas este día."}
          </p>
        )}
        {entradas.length > 0 && (
          <ol className="flex flex-col gap-2">
            {entradas.map((e) =>
              e.tipo === "cita" ? (
                <li key={e.cita.id}>
                  <Link
                    href={`/panel/citas/${e.cita.id}`}
                    className={`flex gap-4 rounded-boton border border-borde bg-superficie px-4 py-3 no-underline hover:bg-fondo-suave ${ANILLO_FOCO}`}
                  >
                    <span className="flex w-20 shrink-0 flex-col text-sm">
                      <span className="font-bold text-tinta">{formatearHora(e.cita.inicio, zonaHoraria)}</span>
                      <span className="text-texto-muted">{formatearHora(e.cita.fin, zonaHoraria)}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-tinta">{e.cita.servicio}</span>
                        <BadgeEstadoCita estado={e.cita.estado} />
                      </span>
                      <span className="truncate text-sm text-tinta-suave">{e.cita.cliente}</span>
                      <span className="font-codigo text-[13px] text-texto-muted">{e.cita.codigo}</span>
                    </span>
                  </Link>
                </li>
              ) : (
                <li
                  key={e.bloqueo.id}
                  className="flex flex-col gap-0.5 rounded-boton border border-dashed border-borde-control bg-fondo-suave px-4 py-3 text-sm"
                >
                  <span className="font-semibold text-tinta">Bloqueado</span>
                  <span className="text-tinta-suave">{formatearIntervalo(e.bloqueo.inicio, e.bloqueo.fin, zonaHoraria)}</span>
                  {e.bloqueo.motivo && <span className="text-texto-muted">{e.bloqueo.motivo}</span>}
                </li>
              ),
            )}
          </ol>
        )}
      </section>

      <section aria-labelledby="agenda-dia-espacios" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="agenda-dia-espacios" className="text-xl font-bold">
            Espacios libres
          </h2>
          {espacios.length > 0 && (
            <p className="text-sm text-texto-muted">
              Elige uno para crear una cita. La hora se confirma con el servicio que elijas.
            </p>
          )}
        </div>
        {espacios.length === 0 ? (
          <p className="text-sm text-tinta-suave">No quedan espacios libres este día.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
            {espacios.map((inicio) => (
              <li key={inicio.getTime()}>
                <Link
                  href={`/panel/citas/nueva?fecha=${fecha}&hora=${horaLocal(inicio, zonaHoraria)}`}
                  aria-label={`Nueva cita a las ${formatearHora(inicio, zonaHoraria)}`}
                  className={`flex min-h-11 items-center justify-center rounded-full border border-borde bg-superficie px-3 text-sm font-semibold text-tinta no-underline hover:bg-fondo-suave ${ANILLO_FOCO}`}
                >
                  {formatearHora(inicio, zonaHoraria)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
