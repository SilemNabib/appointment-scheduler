import { formatearHora } from "@/dominio/formato";
import {
  fechaDeLaCita,
  fechaEnFrase,
  GestionYPolitica,
  horaDeLaCita,
  marcaDe,
  type CitaDelCorreo,
  type NegocioDelCorreo,
} from "./confirmacion";
import { ComoLlegar, Dato, Diseno, Parrafo, PieNegocio, Titulo } from "./diseno";

// C-04, la reprogramación (PRD §5.4; RN-03, RN-14; Q-60 de TASKS-05, Q-65, Q-67): la hora
// anterior, que sale de `datos.inicio_anterior`, la hora nueva, que es la actual de la
// cita, y el link de gestión. Sale igual si la movió el cliente o el dueño. La invitación
// adjunta (`REQUEST` con un `SEQUENCE` mayor) mueve el mismo evento del calendario
// (ARCH §14.6, T6.14).

export type DatosReprogramacion = {
  negocio: NegocioDelCorreo;
  zonaHoraria: string;
  /** La cita con su hora actual. */
  cita: CitaDelCorreo;
  /** `datos.inicio_anterior` de la notificación (Q-60). */
  inicioAnterior: Date;
  urlGestion: string;
};

export function asuntoReprogramacion(negocio: string): string {
  return `Tu cita en ${negocio} cambió de hora`;
}

export function Reprogramacion({ negocio, zonaHoraria, cita, inicioAnterior, urlGestion }: DatosReprogramacion) {
  const marca = marcaDe(negocio);
  return (
    <Diseno
      marca={marca}
      vistaPrevia={`Ahora es el ${fechaEnFrase(cita.inicio, zonaHoraria)} a las ${formatearHora(cita.inicio, zonaHoraria)}.`}
      pie={<PieNegocio nombre={negocio.nombre} contactos={negocio.contactos} />}
    >
      <Titulo>Tu cita cambió de hora</Titulo>
      <Parrafo>
        Tu cita en {negocio.nombre} tiene una hora nueva. Si la habías agregado a tu calendario, la invitación de este
        correo la mueve.
      </Parrafo>
      <Dato etiqueta="Código de reserva" codigo>
        {cita.codigo}
      </Dato>
      <Dato etiqueta="Servicio">{cita.servicio}</Dato>
      <Dato etiqueta="Antes">{`${fechaDeLaCita(inicioAnterior, zonaHoraria)}, ${formatearHora(inicioAnterior, zonaHoraria)}`}</Dato>
      <Dato etiqueta="Ahora">
        {`${fechaDeLaCita(cita.inicio, zonaHoraria)}, ${horaDeLaCita(cita.inicio, cita.fin, zonaHoraria)}`}
      </Dato>
      {cita.direccion && (
        <Dato etiqueta="Dirección">
          {cita.direccion} · <ComoLlegar direccion={cita.direccion} />
        </Dato>
      )}
      <GestionYPolitica marca={marca} negocio={negocio.nombre} urlGestion={urlGestion} urlPolitica={null} />
    </Diseno>
  );
}
