import { valorVisible } from "@/dominio/contactos";
import { formatearDiaLocal, formatearHora } from "@/dominio/formato";
import { fechaLocal } from "@/dominio/tiempo";
import { fechaDeLaCita, horaDeLaCita } from "./confirmacion";
import { Boton, Dato, Diseno, Enlace, Parrafo, Titulo, type Marca } from "./diseno";

// C-05, el aviso de una cita nueva al dueño (PRD §5.4; RN-22, RN-35; Q-65): el cliente, su
// contacto, el servicio, la fecha, el código y el enlace al detalle en el panel. Solo lo
// generan las reservas del cliente, nunca las citas manuales (S-06). No lleva invitación
// de calendario: el dueño tiene su enlace de suscripción (RN-35).

/** El negocio en los avisos al dueño: su marca, sin el pie de contactos, que son los suyos. */
export type NegocioDelAviso = { nombre: string; logoUrl: string | null; acento: string };

export type DatosCitaNueva = {
  negocio: NegocioDelAviso;
  zonaHoraria: string;
  cita: { servicio: string; inicio: Date; fin: Date; codigo: string };
  /** La instantánea de la cita (RN-18.3): con lo que reservó el cliente. */
  cliente: { nombre: string; apellido: string; telefono: string; correo: string | null };
  /** `{APP_URL}/panel/citas/{citaId}`. */
  urlPanel: string;
};

export const marcaDelAviso = (negocio: NegocioDelAviso): Marca => ({ tipo: "negocio", ...negocio });

/** "miércoles, 14 de octubre a las 7:00 p. m.", en la zona del negocio. */
export function cuando(inicio: Date, zona: string): string {
  return `${formatearDiaLocal(fechaLocal(inicio, zona))} a las ${formatearHora(inicio, zona)}`;
}

/** "Nueva cita: {servicio}, {fecha y hora}" (Q-65). */
export function asuntoCitaNueva(servicio: string, inicio: Date, zona: string): string {
  return `Nueva cita: ${servicio}, ${cuando(inicio, zona)}`;
}

export function DuenoCitaNueva({ negocio, zonaHoraria, cita, cliente, urlPanel }: DatosCitaNueva) {
  const marca = marcaDelAviso(negocio);
  const nombre = `${cliente.nombre} ${cliente.apellido}`;
  return (
    <Diseno
      marca={marca}
      // Sin punto final: el de "a. m." o "p. m." cierra la oración.
      vistaPrevia={`${nombre} reservó ${cita.servicio} para el ${cuando(cita.inicio, zonaHoraria)}`}
      pie={<Parrafo suave>Recibes este aviso porque eres el dueño de {negocio.nombre}.</Parrafo>}
    >
      <Titulo>Tienes una cita nueva</Titulo>
      <Parrafo>{nombre} reservó desde tu página.</Parrafo>
      <Dato etiqueta="Código de reserva" codigo>
        {cita.codigo}
      </Dato>
      <Dato etiqueta="Servicio">{cita.servicio}</Dato>
      <Dato etiqueta="Fecha">{fechaDeLaCita(cita.inicio, zonaHoraria)}</Dato>
      <Dato etiqueta="Hora">{horaDeLaCita(cita.inicio, cita.fin, zonaHoraria)}</Dato>
      <Dato etiqueta="Cliente">{nombre}</Dato>
      <Dato etiqueta="Teléfono">
        <Enlace href={`tel:${cliente.telefono}`}>{valorVisible({ tipo: "telefono", valor: cliente.telefono })}</Enlace>
      </Dato>
      {cliente.correo && (
        <Dato etiqueta="Correo">
          <Enlace href={`mailto:${cliente.correo}`}>{cliente.correo}</Enlace>
        </Dato>
      )}
      <Boton marca={marca} href={urlPanel}>
        Ver la cita en el panel
      </Boton>
    </Diseno>
  );
}
