import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/componentes/aviso";
import { Seccion } from "@/componentes/formulario";
import { ANILLO_FOCO } from "@/componentes/estilos";
import { requireMiembro } from "@/servidor/auth/sesion";
import { estadoConfiguracion } from "@/servidor/casos-uso/estado-configuracion";
import { resumenNegocio } from "@/servidor/casos-uso/resumen-negocio";

export const metadata: Metadata = { title: "Inicio" };

// Inicio del panel: la lista de verificación del primer ingreso (F-05, paso 3) y el
// enlace a la página pública, con un aviso mientras falten servicios u horario
// (PAN-18). Los servicios y el horario muestran si están listos; lo demás ya tiene
// valores por defecto y aparece como algo para revisar, sin estado (Q-22). El
// calendario llega en la Fase 5.

const enlace = `rounded-sm font-medium text-teal-700 underline dark:text-teal-400 ${ANILLO_FOCO}`;

const plural = (n: number, singular: string, varios: string) => `${n} ${n === 1 ? singular : varios}`;

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
    <li className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {titulo}
          {listo !== undefined && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                listo
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              }`}
            >
              {listo ? "Listo" : "Falta"}
            </span>
          )}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{detalle}</p>
      </div>
      <Link href={href} className={`shrink-0 text-sm ${enlace}`}>
        {accion}
        <span className="sr-only">: {titulo}</span>
      </Link>
    </li>
  );
}

export default async function Panel() {
  const ctx = await requireMiembro();
  const [negocio, estado] = await Promise.all([resumenNegocio(ctx), estadoConfiguracion(ctx)]);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <h1 className="text-xl font-semibold">Hola, este es el panel de {negocio.nombre}</h1>

      <Seccion titulo="Tu página de reservas" descripcion="Compártela con tus clientes para que reserven en línea.">
        <p className="text-sm break-all">
          <a href={estado.enlacePublico} target="_blank" rel="noopener" className={enlace}>
            {estado.enlacePublico}
          </a>
        </p>
        {!estado.completa && (
          <Aviso tipo="advertencia">
            Mientras no tengas al menos un servicio activo y un horario, tu página mostrará &quot;Aún no hay horarios
            disponibles&quot;.
          </Aviso>
        )}
      </Seccion>

      <Seccion titulo="Configura tu negocio" descripcion="Lo que necesitas para empezar a recibir reservas.">
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
            detalle="Nombre, logo, colores, dirección y teléfono de tu negocio."
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
