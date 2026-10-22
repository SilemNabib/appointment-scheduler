import type { Metadata } from "next";
import Link from "next/link";
import { claseBoton } from "@/componentes/estilos";
import { AgendaDia } from "@/componentes/panel/agenda-dia";
import { BuscarCodigo } from "@/componentes/panel/buscar-codigo";
import { TituloPagina } from "@/componentes/panel/titulo-pagina";
import { espaciosLibres } from "@/dominio/agenda";
import { formatearDiaLocal } from "@/dominio/formato";
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

type Vista = "dia";

const conMayuscula = (texto: string) => texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1);

const href = (vista: Vista, fecha: FechaLocal) => `/panel/agenda?vista=${vista}&fecha=${fecha}`;

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
  const vista: Vista = "dia";

  const agenda = await listarAgenda(ctx, fecha, fecha);
  if (!agenda.ok) throw new Error(`La agenda del ${fecha} no se pudo leer: ${agenda.error}`);
  const { citas, bloqueos, franjas, granularidadMin } = agenda.valor;
  const espacios = espaciosLibres({ fecha, zonaHoraria: zona, franjas, granularidadMin, citas, bloqueos, ahora });

  const navegacion = [
    { texto: "Anterior", destino: sumarDias(fecha, -1), etiqueta: "Día anterior" },
    { texto: "Hoy", destino: hoy, etiqueta: "Hoy" },
    { texto: "Siguiente", destino: sumarDias(fecha, 1), etiqueta: "Día siguiente" },
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <TituloPagina
        titulo="Agenda"
        descripcion={conMayuscula(formatearDiaLocal(fecha, true))}
        acciones={
          <Link href={`/panel/citas/nueva?fecha=${fecha}`} className={claseBoton("primario")}>
            Nueva cita
          </Link>
        }
      />

      <div className="flex flex-col gap-4 min-[700px]:flex-row min-[700px]:items-end min-[700px]:justify-between">
        <nav aria-label="Cambiar de día" className="flex gap-2">
          {navegacion.map((n) => (
            <Link
              key={n.texto}
              href={href(vista, n.destino)}
              aria-label={n.etiqueta === n.texto ? undefined : n.etiqueta}
              aria-current={n.texto === "Hoy" && fecha === hoy ? "date" : undefined}
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

      <AgendaDia fecha={fecha} esHoy={fecha === hoy} zonaHoraria={zona} citas={citas} bloqueos={bloqueos} espacios={espacios} />
    </div>
  );
}
