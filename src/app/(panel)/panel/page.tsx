import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/componentes/aviso";
import { Badge } from "@/componentes/badge";
import { ANILLO_FOCO, claseBoton } from "@/componentes/estilos";
import { Seccion } from "@/componentes/formulario";
import { BadgeEstadoCita } from "@/componentes/panel/estado-cita";
import { TituloPagina } from "@/componentes/panel/titulo-pagina";
import { formatearDiaLocal, formatearHora } from "@/dominio/formato";
import { fechaLocal } from "@/dominio/tiempo";
import { requireMiembro } from "@/servidor/auth/sesion";
import { listarAgenda } from "@/servidor/casos-uso/agenda-panel";
import { estadoConfiguracion } from "@/servidor/casos-uso/estado-configuracion";
import { resumenNegocio } from "@/servidor/casos-uso/resumen-negocio";

export const metadata: Metadata = { title: "Inicio" };

// Inicio del panel (F-05, PAN-02, PAN-18; DESIGN §4.3): la tarjeta "Hoy" con las citas
// del día en la zona del negocio (RN-03), el enlace a la página pública con "Ver página",
// y "Prepara tu negocio", la lista de verificación del primer ingreso (F-05, paso 3).
// Los servicios y el horario dicen "Listo" o "Falta", y mientras falte alguno se ve el
// aviso de PAN-18; lo demás ya tiene valores por defecto y aparece para revisar, sin
// estado (Q-22 de TASKS-02). El panel no menciona la sede (RN-32).

const enlace = `rounded-sm font-semibold text-acento-texto underline ${ANILLO_FOCO}`;

const plural = (n: number, singular: string, varios: string) => `${n} ${n === 1 ? singular : varios}`;

const conMayuscula = (texto: string) => texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1);

function Paso({
  listo,
  titulo,
  detalle,
  href,
  accion,
}: {
  /** `undefined`: un paso para revisar, sin estado (Q-22). */
  listo?: boolean;
  titulo: string;
  detalle: string;
  href: string;
  accion: string;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-boton border border-borde px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {titulo}
          {listo !== undefined && <Badge tono={listo ? "exito" : "aviso"}>{listo ? "Listo" : "Falta"}</Badge>}
        </p>
        <p className="text-sm text-tinta-suave">{detalle}</p>
      </div>
      <Link href={href} className={`inline-flex min-h-11 shrink-0 items-center text-sm ${enlace}`}>
        {accion}
        <span className="sr-only">: {titulo}</span>
      </Link>
    </li>
  );
}

export default async function Panel() {
  const ctx = await requireMiembro();
  const [negocio, estado] = await Promise.all([resumenNegocio(ctx), estadoConfiguracion(ctx)]);
  const zona = negocio.zonaHoraria;
  const hoy = fechaLocal(new Date(), zona);
  const agenda = await listarAgenda(ctx, hoy, hoy);
  if (!agenda.ok) throw new Error(`La agenda de hoy no se pudo leer: ${agenda.error}`);
  const citas = agenda.valor.citas;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <TituloPagina titulo={`Hola, este es el panel de ${negocio.nombre}`} />

      <Seccion titulo="Hoy" descripcion={conMayuscula(formatearDiaLocal(hoy, true))}>
        {citas.length === 0 ? (
          <p className="text-tinta-suave">No tienes citas hoy.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {citas.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/panel/citas/${c.id}`}
                  className={`flex items-center gap-4 rounded-boton border border-borde px-4 py-3 no-underline hover:bg-fondo-suave ${ANILLO_FOCO}`}
                >
                  <span className="w-20 shrink-0 text-sm font-bold text-tinta">{formatearHora(c.inicio, zona)}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold text-tinta">{c.servicio}</span>
                    <span className="truncate text-sm text-tinta-suave">{c.cliente}</span>
                  </span>
                  <BadgeEstadoCita estado={c.estado} />
                </Link>
              </li>
            ))}
          </ol>
        )}
        <div>
          <Link href={`/panel/agenda?vista=dia&fecha=${hoy}`} className={claseBoton("secundario")}>
            Ver la agenda
          </Link>
        </div>
      </Seccion>

      <Seccion titulo="Tu página de reservas" descripcion="Compártela con tus clientes para que reserven en línea.">
        <p className="text-sm break-all text-tinta-suave">{estado.enlacePublico}</p>
        <div>
          <a href={estado.enlacePublico} target="_blank" rel="noopener" className={claseBoton("secundario")}>
            Ver página
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        </div>
        {!estado.completa && (
          <Aviso tipo="advertencia">
            Mientras no tengas al menos un servicio activo y un horario, tu página mostrará &quot;Aún no hay horarios
            disponibles&quot;.
          </Aviso>
        )}
      </Seccion>

      <Seccion titulo="Prepara tu negocio" descripcion="Lo que necesitas para empezar a recibir reservas.">
        <ul className="flex flex-col gap-3">
          <Paso
            listo={estado.serviciosActivos > 0}
            titulo="Servicios"
            detalle={
              estado.serviciosActivos > 0
                ? `Tienes ${plural(estado.serviciosActivos, "servicio activo", "servicios activos")}.`
                : "Crea al menos un servicio, como un examen visual."
            }
            href="/panel/configuracion/servicios"
            accion={estado.serviciosActivos > 0 ? "Ver" : "Crear"}
          />
          <Paso
            listo={estado.franjas > 0}
            titulo="Horario"
            detalle={
              estado.franjas > 0
                ? `Tu horario tiene ${plural(estado.franjas, "franja", "franjas")} a la semana.`
                : "Define los días y las horas en que atiendes."
            }
            href="/panel/configuracion/horario"
            accion={estado.franjas > 0 ? "Ver" : "Definir"}
          />
          <Paso
            titulo="Marca"
            detalle="Nombre, logo, colores, dirección y contactos de tu negocio."
            href="/panel/configuracion/negocio"
            accion="Revisar"
          />
          <Paso
            titulo="Reglas de reserva"
            detalle="Con cuánta anticipación se reserva, el plazo para cancelar y más. Ya tienen valores por defecto."
            href="/panel/configuracion/reglas"
            accion="Revisar"
          />
          <Paso
            titulo="Recordatorio"
            detalle="Cuántas horas antes de la cita reciben tus clientes un recordatorio por correo."
            href="/panel/configuracion/recordatorios"
            accion="Revisar"
          />
          <Paso
            titulo="Política de datos"
            detalle="La política de tratamiento de datos que aceptan tus clientes. Parte de una plantilla."
            href="/panel/configuracion/politica"
            accion="Revisar"
          />
        </ul>
      </Seccion>
    </div>
  );
}
