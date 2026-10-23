import { formatearHora } from "@/dominio/formato";
import { fechaDeLaCita } from "./confirmacion";
import { Boton, Dato, Diseno, Parrafo, Titulo } from "./diseno";
import { marcaDelAviso, type NegocioDelAviso } from "./dueno-cita-nueva";

// C-06, el aviso al dueño de que el cliente canceló o reprogramó su cita (PRD §5.4; RN-22,
// RN-35; Q-65, Q-68): qué cambió, según los `datos` de la notificación, y el enlace al
// detalle en el panel. Solo lo generan las acciones del cliente desde su link (S-06). No
// lleva invitación de calendario (RN-35).

/** Los `datos` de C-06 (Q-68), ya leídos. */
export type CambioDeCita = { tipo: "cancelada" } | { tipo: "reprogramada"; inicioAnterior: Date; inicioNuevo: Date };

export type DatosCambio = {
  negocio: NegocioDelAviso;
  zonaHoraria: string;
  cita: { servicio: string; inicio: Date; codigo: string };
  cliente: { nombre: string; apellido: string };
  cambio: CambioDeCita;
  /** `{APP_URL}/panel/citas/{citaId}`. */
  urlPanel: string;
};

/** "Cambio en la cita {código}" (Q-65). */
export function asuntoCambio(codigo: string): string {
  return `Cambio en la cita ${codigo}`;
}

const fechaYHora = (instante: Date, zona: string) => `${fechaDeLaCita(instante, zona)}, ${formatearHora(instante, zona)}`;

export function DuenoCambio({ negocio, zonaHoraria, cita, cliente, cambio, urlPanel }: DatosCambio) {
  const marca = marcaDelAviso(negocio);
  const nombre = `${cliente.nombre} ${cliente.apellido}`;
  const cancelada = cambio.tipo === "cancelada";
  const resumen = cancelada ? `${nombre} canceló su cita.` : `${nombre} cambió la hora de su cita.`;
  return (
    <Diseno
      marca={marca}
      vistaPrevia={`${resumen} ${cita.servicio}, ${cita.codigo}.`}
      pie={<Parrafo suave>Recibes este aviso porque eres el dueño de {negocio.nombre}.</Parrafo>}
    >
      <Titulo>{cancelada ? "El cliente canceló una cita" : "El cliente reprogramó una cita"}</Titulo>
      <Parrafo>
        {resumen} {cancelada ? "Su cupo quedó libre." : null}
      </Parrafo>
      <Dato etiqueta="Código de reserva" codigo>
        {cita.codigo}
      </Dato>
      <Dato etiqueta="Servicio">{cita.servicio}</Dato>
      <Dato etiqueta="Cliente">{nombre}</Dato>
      {cambio.tipo === "cancelada" ? (
        <Dato etiqueta="Fecha cancelada">{fechaYHora(cita.inicio, zonaHoraria)}</Dato>
      ) : (
        <>
          <Dato etiqueta="Antes">{fechaYHora(cambio.inicioAnterior, zonaHoraria)}</Dato>
          <Dato etiqueta="Ahora">{fechaYHora(cambio.inicioNuevo, zonaHoraria)}</Dato>
        </>
      )}
      <Boton marca={marca} href={urlPanel}>
        Ver la cita en el panel
      </Boton>
    </Diseno>
  );
}
