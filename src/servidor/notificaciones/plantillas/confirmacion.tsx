import type { Contacto } from "@/dominio/contactos";
import { formatearDiaLocal, formatearHora } from "@/dominio/formato";
import { fechaLocal } from "@/dominio/tiempo";
import { Boton, ComoLlegar, Dato, Diseno, Enlace, Parrafo, PieNegocio, Titulo, type Marca } from "./diseno";

// C-01, la confirmación de la cita (PRD §5.4; RN-03, RN-13, RN-17, RN-24; D-28, D-30;
// Q-65): el negocio, el servicio, la fecha y la hora en la zona del negocio, la dirección
// con "Cómo llegar", el código de reserva, el link de gestión y el enlace a la política.
// Sin empleado: en el MVP todo servicio se atiende por capacidad (D-17). Nunca lleva el
// teléfono ni el correo del cliente (RN-24). La invitación de calendario va adjunta
// (T6.14). Lo que comparte con C-02 y C-04 también está aquí.

/** El negocio que firma un correo de citas, con sus contactos para el pie (Q-65). */
export type NegocioDelCorreo = {
  nombre: string;
  /** URL absoluta del logo, o `null`. */
  logoUrl: string | null;
  /** `negocio.color_primario` (Q-42). */
  acento: string;
  contactos: readonly Contacto[];
};

export type CitaDelCorreo = {
  servicio: string;
  inicio: Date;
  fin: Date;
  /** La dirección de la sede de la cita. */
  direccion: string | null;
  codigo: string;
};

export type DatosConfirmacion = {
  negocio: NegocioDelCorreo;
  zonaHoraria: string;
  cita: CitaDelCorreo;
  /** El link de gestión (ARCH §13). */
  urlGestion: string;
  /** La versión que aceptó el cliente o, en una cita manual, la vigente (Q-65); `null` sin política. */
  urlPolitica: string | null;
};

export const marcaDe = (negocio: NegocioDelCorreo): Marca => ({
  tipo: "negocio",
  nombre: negocio.nombre,
  logoUrl: negocio.logoUrl,
  acento: negocio.acento,
});

const conMayuscula = (texto: string) => texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1);

/** "Miércoles, 14 de octubre de 2026", en la zona del negocio (RN-03), como la confirmación de PUB-06. */
export function fechaDeLaCita(inicio: Date, zona: string): string {
  return conMayuscula(fechaEnFrase(inicio, zona));
}

/** "miércoles, 14 de octubre de 2026", para usar a mitad de una frase. */
export function fechaEnFrase(inicio: Date, zona: string): string {
  return formatearDiaLocal(fechaLocal(inicio, zona), true);
}

/** "7:00 p. m. – 7:30 p. m.", en la zona del negocio (RN-03, RNF-02). */
export function horaDeLaCita(inicio: Date, fin: Date, zona: string): string {
  return `${formatearHora(inicio, zona)} – ${formatearHora(fin, zona)}`;
}

/** El código, el servicio, la fecha, la hora y la dirección con "Cómo llegar" (D-28, D-30). */
export function DatosDeLaCita({ cita, zonaHoraria }: { cita: CitaDelCorreo; zonaHoraria: string }) {
  return (
    <>
      <Dato etiqueta="Código de reserva" codigo>
        {cita.codigo}
      </Dato>
      <Dato etiqueta="Servicio">{cita.servicio}</Dato>
      <Dato etiqueta="Fecha">{fechaDeLaCita(cita.inicio, zonaHoraria)}</Dato>
      <Dato etiqueta="Hora">{horaDeLaCita(cita.inicio, cita.fin, zonaHoraria)}</Dato>
      {cita.direccion && (
        <Dato etiqueta="Dirección">
          {cita.direccion} · <ComoLlegar direccion={cita.direccion} />
        </Dato>
      )}
    </>
  );
}

/** El link de gestión con su explicación (RN-13), y la política de datos (RN-17). */
export function GestionYPolitica({
  marca,
  negocio,
  urlGestion,
  urlPolitica,
}: {
  marca: Marca;
  negocio: string;
  urlGestion: string;
  urlPolitica: string | null;
}) {
  return (
    <>
      <Boton marca={marca} href={urlGestion}>
        Ver, cambiar o cancelar mi cita
      </Boton>
      <Parrafo suave>Si hablas con el negocio, menciona tu código de reserva.</Parrafo>
      {urlPolitica && (
        <Parrafo suave>
          {negocio} trata tus datos según su <Enlace href={urlPolitica}>política de tratamiento de datos</Enlace>.
        </Parrafo>
      )}
    </>
  );
}

export function asuntoConfirmacion(negocio: string): string {
  return `Tu cita en ${negocio} está confirmada`;
}

export function Confirmacion({ negocio, zonaHoraria, cita, urlGestion, urlPolitica }: DatosConfirmacion) {
  const marca = marcaDe(negocio);
  return (
    <Diseno
      marca={marca}
      // Sin punto final: el de "a. m." o "p. m." cierra la oración.
      vistaPrevia={`${cita.servicio}, el ${fechaEnFrase(cita.inicio, zonaHoraria)} a las ${formatearHora(cita.inicio, zonaHoraria)}`}
      pie={<PieNegocio nombre={negocio.nombre} contactos={negocio.contactos} />}
    >
      <Titulo>Tu cita está confirmada</Titulo>
      <Parrafo>
        Te esperamos en {negocio.nombre}. Este correo trae la invitación para agregar la cita a tu calendario.
      </Parrafo>
      <DatosDeLaCita cita={cita} zonaHoraria={zonaHoraria} />
      <GestionYPolitica marca={marca} negocio={negocio.nombre} urlGestion={urlGestion} urlPolitica={urlPolitica} />
    </Diseno>
  );
}
