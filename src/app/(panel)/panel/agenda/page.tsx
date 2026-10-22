import type { Metadata } from "next";
import Link from "next/link";
import { ANILLO_FOCO, claseBoton } from "@/componentes/estilos";
import { AgendaDia } from "@/componentes/panel/agenda-dia";
import { AgendaMes } from "@/componentes/panel/agenda-mes";
import { AgendaSemana } from "@/componentes/panel/agenda-semana";
import { BuscarCodigo } from "@/componentes/panel/buscar-codigo";
import { TituloPagina } from "@/componentes/panel/titulo-pagina";
import { espaciosLibres, moverSemana, semanaDe } from "@/dominio/agenda";
import { mesDe, moverMes, primerDia, ultimoDiaDelMes } from "@/dominio/calendario";
import { formatearDiaLocal, formatearFechaLocal, formatearMesLocal } from "@/dominio/formato";
import { esFechaLocal, fechaLocal, sumarDias, type FechaLocal } from "@/dominio/tiempo";
import { requireMiembro } from "@/servidor/auth/sesion";
import { listarAgenda } from "@/servidor/casos-uso/agenda-panel";
import { resumenNegocio } from "@/servidor/casos-uso/resumen-negocio";
import { buscarCodigoPanel } from "./acciones";

export const metadata: Metadata = { title: "Agenda" };

// La agenda del panel (PAN-02; RN-03; Q-52, Q-58, Q-59). La URL lleva la vista y la
// fecha (`?vista=dia&fecha=AAAA-MM-DD`), así recargar o compartir la conserva; sin
// parámetros abre el día de hoy en la zona del negocio. Se pueden ver los días pasados.
// Solo lee: con el negocio suspendido también se ve (D-14).

type Vista = "dia" | "semana" | "mes";

const VISTAS: { vista: Vista; texto: string }[] = [
  { vista: "dia", texto: "Día" },
  { vista: "semana", texto: "Semana" },
  { vista: "mes", texto: "Mes" },
];

const esVista = (valor: unknown): valor is Vista => VISTAS.some((v) => v.vista === valor);

const conMayuscula = (texto: string) => texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1);

const href = (vista: Vista, fecha: FechaLocal) => `/panel/agenda?vista=${vista}&fecha=${fecha}`;

/** Lo que cambia según la vista: el rango que se lee, el título y la navegación. */
function planDeVista(vista: Vista, fecha: FechaLocal, hoy: FechaLocal) {
  if (vista === "mes") {
    const mes = mesDe(fecha);
    return {
      rango: { desde: primerDia(mes), hasta: ultimoDiaDelMes(mes) },
      descripcion: formatearMesLocal(fecha),
      etiquetaNavegacion: "Cambiar de mes",
      navegacion: [
        { texto: "Anterior", destino: primerDia(moverMes(mes, -1)), etiqueta: "Mes anterior", actual: false },
        { texto: "Este mes", destino: hoy, etiqueta: undefined, actual: primerDia(mesDe(hoy)) === primerDia(mes) },
        { texto: "Siguiente", destino: primerDia(moverMes(mes, 1)), etiqueta: "Mes siguiente", actual: false },
      ],
    };
  }
  if (vista === "semana") {
    const semana = semanaDe(fecha);
    return {
      rango: semana,
      descripcion: `Del ${formatearFechaLocal(semana.desde)} al ${formatearFechaLocal(semana.hasta)}`,
      etiquetaNavegacion: "Cambiar de semana",
      navegacion: [
        { texto: "Anterior", destino: moverSemana(fecha, -1).desde, etiqueta: "Semana anterior", actual: false },
        { texto: "Esta semana", destino: hoy, etiqueta: undefined, actual: semanaDe(hoy).desde === semana.desde },
        { texto: "Siguiente", destino: moverSemana(fecha, 1).desde, etiqueta: "Semana siguiente", actual: false },
      ],
    };
  }
  return {
    rango: { desde: fecha, hasta: fecha },
    descripcion: conMayuscula(formatearDiaLocal(fecha, true)),
    etiquetaNavegacion: "Cambiar de día",
    navegacion: [
      { texto: "Anterior", destino: sumarDias(fecha, -1), etiqueta: "Día anterior", actual: false },
      { texto: "Hoy", destino: hoy, etiqueta: undefined, actual: fecha === hoy },
      { texto: "Siguiente", destino: sumarDias(fecha, 1), etiqueta: "Día siguiente", actual: false },
    ],
  };
}

export default async function PaginaAgenda({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const ctx = await requireMiembro();
  const negocio = await resumenNegocio(ctx);
  const zona = negocio.zonaHoraria;
  const ahora = new Date();
  const hoy = fechaLocal(ahora, zona);
  const parametros = await searchParams;
  const fecha = esFechaLocal(parametros.fecha) ? parametros.fecha : hoy;
  const vista: Vista = esVista(parametros.vista) ? parametros.vista : "dia";
  const plan = planDeVista(vista, fecha, hoy);

  const agenda = await listarAgenda(ctx, plan.rango.desde, plan.rango.hasta);
  if (!agenda.ok) throw new Error(`La agenda de ${plan.rango.desde} a ${plan.rango.hasta} no se pudo leer: ${agenda.error}`);
  const { citas, bloqueos, franjas, granularidadMin } = agenda.valor;

  return (
    <div className={`flex flex-col gap-6 ${vista === "dia" ? "max-w-3xl" : ""}`}>
      <TituloPagina
        titulo="Agenda"
        descripcion={plan.descripcion}
        acciones={
          <Link href={`/panel/citas/nueva?fecha=${fecha}`} className={claseBoton("primario")}>
            Nueva cita
          </Link>
        }
      />

      <nav aria-label="Vista de la agenda" className="flex gap-2">
        {VISTAS.map((v) => (
          <Link
            key={v.vista}
            href={href(v.vista, fecha)}
            aria-current={v.vista === vista ? "page" : undefined}
            className={
              "flex min-h-11 items-center rounded-full border border-borde bg-superficie px-4 text-sm font-semibold text-tinta no-underline " +
              `hover:brightness-95 aria-[current=page]:border-tinta aria-[current=page]:bg-tinta aria-[current=page]:text-white ${ANILLO_FOCO}`
            }
          >
            {v.texto}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-4 min-[700px]:flex-row min-[700px]:items-end min-[700px]:justify-between">
        <nav aria-label={plan.etiquetaNavegacion} className="flex flex-wrap gap-2">
          {plan.navegacion.map((n) => (
            <Link
              key={n.texto}
              href={href(vista, n.destino)}
              aria-label={n.etiqueta}
              aria-current={n.actual ? "date" : undefined}
              className={claseBoton("secundario")}
            >
              {n.texto}
            </Link>
          ))}
        </nav>
        <div className="min-[700px]:w-72">
          <BuscarCodigo buscar={buscarCodigoPanel} />
        </div>
      </div>

      {vista === "mes" ? (
        <AgendaMes mes={mesDe(fecha)} hoy={hoy} zonaHoraria={zona} citas={citas} hrefDia={(dia) => href("dia", dia)} />
      ) : vista === "semana" ? (
        <AgendaSemana
          semana={plan.rango}
          hoy={hoy}
          zonaHoraria={zona}
          citas={citas}
          bloqueos={bloqueos}
          hrefDia={(dia) => href("dia", dia)}
        />
      ) : (
        <AgendaDia
          fecha={fecha}
          esHoy={fecha === hoy}
          zonaHoraria={zona}
          citas={citas}
          bloqueos={bloqueos}
          espacios={espaciosLibres({ fecha, zonaHoraria: zona, franjas, granularidadMin, citas, bloqueos, ahora })}
        />
      )}
    </div>
  );
}
