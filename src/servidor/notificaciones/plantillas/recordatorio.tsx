import { formatearDiaLocal, formatearHora } from "@/dominio/formato";
import { fechaLocal } from "@/dominio/tiempo";
import { DatosDeLaCita, GestionYPolitica, marcaDe, type DatosConfirmacion } from "./confirmacion";
import { Diseno, Parrafo, PieNegocio, Titulo } from "./diseno";

// C-02, el recordatorio (PRD §5.4: "Igual que C-01"; RN-21; Q-65). Sale `recordatorio_horas_antes`
// del inicio, con los datos actuales de la cita. No lleva invitación de calendario, para no
// duplicar el evento (ARCH §14.6).

export type DatosRecordatorio = DatosConfirmacion;

/** "Recordatorio: tu cita en {negocio} es el miércoles, 14 de octubre" (Q-65), en la zona del negocio. */
export function asuntoRecordatorio(negocio: string, inicio: Date, zona: string): string {
  return `Recordatorio: tu cita en ${negocio} es el ${formatearDiaLocal(fechaLocal(inicio, zona))}`;
}

export function Recordatorio({ negocio, zonaHoraria, cita, urlGestion, urlPolitica }: DatosRecordatorio) {
  const marca = marcaDe(negocio);
  // Las oraciones que terminan en la hora no llevan punto: el de "a. m." o "p. m." las cierra.
  const hora = formatearHora(cita.inicio, zonaHoraria);
  return (
    <Diseno
      marca={marca}
      vistaPrevia={`${cita.servicio} a las ${hora}`}
      pie={<PieNegocio nombre={negocio.nombre} contactos={negocio.contactos} />}
    >
      <Titulo>Te recordamos tu cita</Titulo>
      <Parrafo>
        Tienes una cita en {negocio.nombre} el {formatearDiaLocal(fechaLocal(cita.inicio, zonaHoraria))} a las {hora}
      </Parrafo>
      <DatosDeLaCita cita={cita} zonaHoraria={zonaHoraria} />
      <GestionYPolitica marca={marca} negocio={negocio.nombre} urlGestion={urlGestion} urlPolitica={urlPolitica} />
    </Diseno>
  );
}
