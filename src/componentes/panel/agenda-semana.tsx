import Link from "next/link";
import { ANILLO_FOCO } from "@/componentes/estilos";
import { agruparPorDia, type Semana } from "@/dominio/agenda";
import { formatearDiaCorto, formatearDiaLocal, formatearHora, formatearIntervalo } from "@/dominio/formato";
import { fechaLocal, fechasDelRango, type FechaLocal } from "@/dominio/tiempo";
import type { BloqueoDelDia, CitaDelDia } from "./agenda-dia";
import { BadgeEstadoCita } from "./estado-cita";

// Vista de semana de la agenda (PAN-02; RN-03, RNF-01; Q-52, Q-58): de lunes a domingo.
// En escritorio, una columna por día; en el celular, una lista por día, sin desplazar la
// página en horizontal (RNF-01). Cada cita lleva a su detalle y cada día a su vista de
// día. Las horas van en la zona del negocio (RN-03), y también se ven las canceladas,
// con su badge (Q-58).

const conMayuscula = (texto: string) => texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1);

export function AgendaSemana({
  semana,
  hoy,
  zonaHoraria,
  citas,
  bloqueos,
  hrefDia,
}: {
  semana: Semana;
  hoy: FechaLocal;
  zonaHoraria: string;
  citas: readonly CitaDelDia[];
  bloqueos: readonly BloqueoDelDia[];
  /** El enlace a la vista de día de una fecha, con la vista en la URL (Q-58). */
  hrefDia: (fecha: FechaLocal) => string;
}) {
  const citasPorDia = agruparPorDia(citas, zonaHoraria);
  const dias = fechasDelRango(semana.desde, semana.hasta);
  /** Un bloqueo de varios días aparece en cada día que toca. */
  const bloqueosDe = (fecha: FechaLocal) =>
    bloqueos.filter(
      (b) => fechaLocal(b.inicio, zonaHoraria) <= fecha && fecha <= fechaLocal(new Date(b.fin.getTime() - 1), zonaHoraria),
    );

  return (
    <ol className="grid grid-cols-1 gap-3 lg:grid-cols-7 lg:gap-2">
      {dias.map((fecha) => {
        const delDia = citasPorDia.get(fecha) ?? [];
        const bloqueosDelDia = bloqueosDe(fecha);
        const esHoy = fecha === hoy;
        return (
          <li
            key={fecha}
            className={`flex min-w-0 flex-col gap-2 rounded-boton border bg-superficie p-3 lg:p-1.5 ${esHoy ? "border-tinta" : "border-borde"}`}
          >
            <Link
              href={hrefDia(fecha)}
              aria-current={esHoy ? "date" : undefined}
              className={`flex min-h-11 flex-col justify-center rounded-control px-1 text-sm font-bold text-tinta no-underline hover:bg-fondo-suave ${ANILLO_FOCO}`}
            >
              {/* En las columnas de escritorio, la fecha corta; el lector de pantalla lee una sola. */}
              <span className="lg:hidden">{conMayuscula(formatearDiaLocal(fecha))}</span>
              <span className="hidden lg:inline">{conMayuscula(formatearDiaCorto(fecha))}</span>
              {esHoy && <span className="text-xs font-semibold text-texto-muted">Hoy</span>}
            </Link>
            {bloqueosDelDia.map((b) => (
              <p key={b.id} className="rounded-control border border-dashed border-borde-control bg-fondo-suave px-2 py-1.5 text-xs">
                <span className="font-semibold">Bloqueado</span>
                <span className="block text-tinta-suave">{formatearIntervalo(b.inicio, b.fin, zonaHoraria)}</span>
              </p>
            ))}
            {delDia.length === 0 ? (
              <p className="px-1 text-xs text-texto-muted">Sin citas</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {delDia.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/panel/citas/${c.id}`}
                      className={`flex min-h-11 flex-col gap-0.5 rounded-control border border-borde px-2 py-1.5 text-xs no-underline hover:bg-fondo-suave lg:px-1.5 ${ANILLO_FOCO}`}
                    >
                      <span className="font-bold text-tinta">{formatearHora(c.inicio, zonaHoraria)}</span>
                      <span className="truncate font-semibold text-tinta">{c.servicio}</span>
                      <span className="truncate text-tinta-suave">{c.cliente}</span>
                      <BadgeEstadoCita estado={c.estado} className="max-w-full self-start lg:px-1.5 lg:text-[11px]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
