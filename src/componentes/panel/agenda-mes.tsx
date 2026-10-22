import Link from "next/link";
import { ANILLO_FOCO } from "@/componentes/estilos";
import { agruparPorDia } from "@/dominio/agenda";
import { semanasDelMes, type Mes } from "@/dominio/calendario";
import { formatearDiaLocal } from "@/dominio/formato";
import type { FechaLocal } from "@/dominio/tiempo";
import type { CitaDelDia } from "./agenda-dia";

// Vista de mes de la agenda (PAN-02; RN-10, RNF-03; PRD §4.3; Q-52, Q-58): las semanas de
// `dominio/calendario.ts`, de lunes a domingo, y en cada día el número de citas activas,
// con enlace a su vista de día. Las canceladas no cuentan (RN-10). El número va con su
// texto ("2 citas"), no solo con el color (RNF-03). Es lo primero que se recorta si el
// plazo aprieta (PRD §4.3).

const DIAS = [
  { corto: "L", largo: "Lunes" },
  { corto: "M", largo: "Martes" },
  { corto: "X", largo: "Miércoles" },
  { corto: "J", largo: "Jueves" },
  { corto: "V", largo: "Viernes" },
  { corto: "S", largo: "Sábado" },
  { corto: "D", largo: "Domingo" },
];

const citasEnTexto = (n: number) => (n === 1 ? "1 cita" : `${n} citas`);

/** Un día del mes: su número y, si tiene, cuántas citas activas, con enlace a su vista de día. */
function DiaDelMes({ fecha, citas, esHoy, href }: { fecha: FechaLocal; citas: number; esHoy: boolean; href: string }) {
  return (
    <Link
      href={href}
      aria-label={`${formatearDiaLocal(fecha)}: ${citas === 0 ? "sin citas" : citasEnTexto(citas)}${esHoy ? ", hoy" : ""}`}
      aria-current={esHoy ? "date" : undefined}
      className={
        "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-control border px-0.5 py-1 text-tinta no-underline hover:bg-fondo-suave sm:min-h-20 " +
        `${esHoy ? "border-tinta" : "border-borde"} ${citas > 0 ? "bg-superficie" : "bg-fondo-suave"} ${ANILLO_FOCO}`
      }
    >
      <span className="text-sm font-bold">{Number(fecha.slice(8, 10))}</span>
      {citas > 0 && (
        <span className="rounded-full bg-tinta px-1.5 text-xs font-bold text-white">
          {citas}
          <span className="hidden sm:inline"> {citas === 1 ? "cita" : "citas"}</span>
        </span>
      )}
    </Link>
  );
}

export function AgendaMes({
  mes,
  hoy,
  zonaHoraria,
  citas,
  hrefDia,
}: {
  mes: Mes;
  hoy: FechaLocal;
  zonaHoraria: string;
  citas: readonly CitaDelDia[];
  /** El enlace a la vista de día de una fecha, con la vista en la URL (Q-58). */
  hrefDia: (fecha: FechaLocal) => string;
}) {
  const porDia = agruparPorDia(
    citas.filter((c) => c.estado !== "cancelada"),
    zonaHoraria,
  );

  return (
    <table className="w-full table-fixed border-separate border-spacing-0.5 sm:border-spacing-1">
      <caption className="sr-only">Citas activas por día; cada día abre su agenda</caption>
      <thead>
        <tr>
          {DIAS.map((d) => (
            <th key={d.corto} scope="col" className="pb-1 text-xs font-bold text-texto-muted">
              <abbr title={d.largo} className="no-underline">
                {d.corto}
              </abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {semanasDelMes(mes).map((semana, i) => (
          <tr key={i}>
            {semana.map((fecha, j) =>
              fecha === null ? (
                <td key={`vacio-${j}`} />
              ) : (
                <td key={fecha} className="p-0 align-top">
                  <DiaDelMes fecha={fecha} citas={porDia.get(fecha)?.length ?? 0} esHoy={fecha === hoy} href={hrefDia(fecha)} />
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
