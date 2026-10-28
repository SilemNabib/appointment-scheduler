import type { Metadata } from "next";
import Link from "next/link";
import { ANILLO_FOCO } from "@/componentes/estilos";
import { formatearFechaHora } from "@/dominio/formato";
import { requireSuperadmin } from "@/servidor/auth/sesion";
import {
  CORREO_DEL_PRD,
  listarNotificacionesConProblemas,
  type NotificacionConProblema,
} from "@/servidor/casos-uso/notificaciones-admin";

export const metadata: Metadata = { title: "Notificaciones · Admin" };

// Notificaciones fallidas o atrasadas (ADM-05; ADR-07; ARCH §19.2, §21.4 y §23; Q-73): el
// negocio, el correo del PRD, el código de la cita, cuándo estaba programada (en la zona
// del negocio), los intentos, el último error y el estado, sin el destinatario. Si la
// lista de atrasadas está vacía, el cron está corriendo.

const ESTADO: Record<NotificacionConProblema["estado"], string> = { fallida: "Fallida", pendiente: "Pendiente" };

function Tabla({ filas }: { filas: NotificacionConProblema[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <tr>
            <th className="py-2 pr-4 font-medium">Negocio</th>
            <th className="py-2 pr-4 font-medium">Correo</th>
            <th className="py-2 pr-4 font-medium">Cita</th>
            <th className="py-2 pr-4 font-medium">Programada para</th>
            <th className="py-2 pr-4 font-medium">Intentos</th>
            <th className="py-2 pr-4 font-medium">Último error</th>
            <th className="py-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((n) => (
            <tr key={n.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-4 font-mono">{n.slug}</td>
              <td className="py-2 pr-4">{CORREO_DEL_PRD[n.tipo]}</td>
              <td className="py-2 pr-4 font-mono">{n.codigo ?? "—"}</td>
              <td className="py-2 pr-4">{formatearFechaHora(n.programadaPara, n.zonaHoraria)}</td>
              <td className="py-2 pr-4">{n.intentos}</td>
              <td className="py-2 pr-4 font-mono text-xs">{n.ultimoError ?? "—"}</td>
              <td className="py-2">{ESTADO[n.estado]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function NotificacionesAdmin() {
  await requireSuperadmin();
  const { fallidas, atrasadas } = await listarNotificacionesConProblemas(new Date());

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className={`self-start rounded-sm text-sm text-teal-700 underline dark:text-teal-400 ${ANILLO_FOCO}`}>
          ← Negocios
        </Link>
        <h1 className="text-xl font-semibold">Notificaciones</h1>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Fallidas</h2>
        {fallidas.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">No hay notificaciones fallidas.</p>
        ) : (
          <Tabla filas={fallidas} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Pendientes con más de 15 minutos de atraso</h2>
        {atrasadas.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Ninguna: el cron está corriendo.</p>
        ) : (
          <>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Hay correos que debían salir hace más de 15 minutos: revisa que el cron esté corriendo en Workers Logs.
            </p>
            <Tabla filas={atrasadas} />
          </>
        )}
      </div>
    </section>
  );
}
