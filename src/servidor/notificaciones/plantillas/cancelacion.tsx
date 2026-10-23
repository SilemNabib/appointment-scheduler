import { fechaDeLaCita, fechaEnFrase, horaDeLaCita, marcaDe, type CitaDelCorreo, type NegocioDelCorreo } from "./confirmacion";
import { Boton, Dato, Diseno, Parrafo, PieNegocio, Titulo } from "./diseno";

// C-03, la cancelación (PRD §5.4; RN-03; Q-65): el servicio, la fecha cancelada y el
// enlace para reservar de nuevo en `{APP_URL}/{slug}`, con el código y los contactos del
// negocio. Sale igual si canceló el cliente o el dueño. No lleva link de gestión: ya no hay
// nada que gestionar. La invitación adjunta (`CANCEL`) quita el evento del calendario
// (ARCH §14.6, T6.14).

export type DatosCancelacion = {
  negocio: NegocioDelCorreo;
  zonaHoraria: string;
  cita: Omit<CitaDelCorreo, "direccion">;
  /** `{APP_URL}/{slug}`, la página pública del negocio. */
  urlReservar: string;
};

export function asuntoCancelacion(negocio: string): string {
  return `Tu cita en ${negocio} fue cancelada`;
}

export function Cancelacion({ negocio, zonaHoraria, cita, urlReservar }: DatosCancelacion) {
  const marca = marcaDe(negocio);
  return (
    <Diseno
      marca={marca}
      vistaPrevia={`${cita.servicio}, el ${fechaEnFrase(cita.inicio, zonaHoraria)}.`}
      pie={<PieNegocio nombre={negocio.nombre} contactos={negocio.contactos} />}
    >
      <Titulo>Tu cita fue cancelada</Titulo>
      <Parrafo>
        Se canceló tu cita en {negocio.nombre}. Si la habías agregado a tu calendario, este correo la quita.
      </Parrafo>
      <Dato etiqueta="Código de reserva" codigo>
        {cita.codigo}
      </Dato>
      <Dato etiqueta="Servicio">{cita.servicio}</Dato>
      <Dato etiqueta="Fecha cancelada">
        {`${fechaDeLaCita(cita.inicio, zonaHoraria)}, ${horaDeLaCita(cita.inicio, cita.fin, zonaHoraria)}`}
      </Dato>
      <Boton marca={marca} href={urlReservar}>
        Reservar otra cita
      </Boton>
    </Diseno>
  );
}
