import { MosaicoLogo } from "@/componentes/mosaico-logo";
import { enlaceMapa } from "@/dominio/contactos";
import { resumirSemana } from "@/dominio/horario";
import type { MarcaPagina, SedePagina } from "@/servidor/casos-uso/pagina-publica";
import { TarjetaContacto } from "./tarjeta-contacto";

// Encabezado de la página pública (PUB-01; DESIGN §4.1). A la izquierda, el banner con
// la frase principal (o el nombre, si falta) y el eslogan, y debajo el mosaico de logo,
// el nombre con el rubro y la descripción (Q-38). A la derecha, la ubicación, el horario
// de la semana resumido y los contactos (D-29), con "Cómo llegar" a Google Maps (D-30).
// Con una sola sede, la página nunca dice "sede" (RN-32). Un campo vacío no deja hueco.
// Las formas del banner son decorativas, solo CSS (DESIGN §8).

export function Encabezado({ marca, sede }: { marca: MarcaPagina; sede: SedePagina }) {
  const horario = resumirSemana(sede.franjas);
  return (
    <div className="flex flex-wrap items-stretch gap-6">
      <section aria-labelledby="nombre-negocio" className="flex min-w-0 flex-[999_1_560px] flex-col">
        {/* El margen inferior deja libre la franja que tapa el mosaico de logo (-56 px). */}
        <div className="relative flex min-h-[240px] flex-col justify-end gap-3 overflow-hidden rounded-[28px] bg-tinta px-7 pt-7 pb-[76px] text-fondo sm:min-h-[300px] sm:px-10 sm:pt-10">
          <span aria-hidden="true" className="absolute -top-[120px] -right-[90px] size-[240px] rounded-full bg-destaque sm:-top-[190px] sm:-right-[110px] sm:size-[440px]" />
          <span aria-hidden="true" className="absolute right-[230px] -bottom-[150px] hidden size-[260px] rotate-[18deg] rounded-[56px] bg-acento sm:block" />
          <span aria-hidden="true" className="absolute right-[70px] bottom-[34px] hidden size-[190px] rounded-full border-2 border-fondo/35 md:block" />
          <span aria-hidden="true" className="absolute right-[105px] bottom-[69px] hidden size-[120px] rounded-full border-2 border-fondo/20 md:block" />
          {marca.rubro && (
            <span className="relative text-[13px] font-bold tracking-[0.12em] text-destaque uppercase">{marca.rubro}</span>
          )}
          <p className="relative m-0 max-w-[620px] font-titulos text-[clamp(28px,4.4vw,56px)] leading-[1.02] font-bold tracking-[-0.035em] text-balance break-words">
            {marca.fraseBanner ?? marca.nombre}
          </p>
          {marca.eslogan && <p className="relative m-0 max-w-[560px] text-base text-fondo/85">{marca.eslogan}</p>}
        </div>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4 px-2 sm:px-6">
          <MosaicoLogo
            nombre={marca.nombre}
            logoUrl={marca.logoUrl}
            tamano={116}
            className="-mt-14 border-[6px] border-fondo"
          />
          <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-2.5 pt-4">
            <h1 id="nombre-negocio" className="m-0 text-[clamp(28px,3.4vw,42px)] leading-[1.05] font-bold tracking-[-0.03em] break-words">
              {marca.nombre}
            </h1>
            {marca.descripcion && <p className="m-0 max-w-[760px] text-base text-pretty text-tinta-suave">{marca.descripcion}</p>}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="ubicacion-contacto"
        className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-5"
      >
        <h2 id="ubicacion-contacto" className="m-0 font-cuerpo text-xs font-bold tracking-[0.08em] text-acento-texto uppercase">
          Ubicación y contacto
        </h2>
        {sede.direccion && (
          <div className="flex items-start justify-between gap-3">
            <p className="m-0 min-w-0 text-base font-bold break-words">{sede.direccion}</p>
            <a
              href={enlaceMapa(sede.direccion)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 shrink-0 items-center text-sm font-semibold text-acento-texto underline underline-offset-[3px]"
            >
              Cómo llegar<span className="sr-only"> (Google Maps, se abre en otra pestaña)</span>
            </a>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <h3 className="m-0 font-cuerpo text-sm font-semibold text-texto-muted">Horario</h3>
          <dl className="m-0 flex flex-col gap-0.5">
            {horario.map((linea) => (
              <div key={linea.dias} className="flex justify-between gap-3 rounded-[10px] px-2.5 py-1.5 text-sm odd:bg-fondo-suave">
                <dt className="font-semibold">{linea.dias}</dt>
                <dd className="m-0 text-right text-tinta-suave">
                  {linea.horas === null
                    ? "Cerrado"
                    : linea.horas.map((h) => (
                        <span key={h} className="block whitespace-nowrap">
                          {h}
                        </span>
                      ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <TarjetaContacto contactos={sede.contactos} className="mt-auto" />
      </section>
    </div>
  );
}
