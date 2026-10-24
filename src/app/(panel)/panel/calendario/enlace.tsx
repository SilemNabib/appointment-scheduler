"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Aviso, type TipoAviso } from "@/componentes/aviso";
import { CLASE_CONTROL, claseBoton } from "@/componentes/estilos";
import { Seccion } from "@/componentes/formulario";
import { mensajeDeError } from "@/componentes/mensajes";
import type { UrlsDeCalendario } from "@/servidor/calendario/firma";
import { generarEnlaceCalendarioPanel } from "./acciones";

// El enlace de calendario del dueño (PAN-20; RN-35, D-14; DESIGN §3 y §4.3; Q-72): sin
// enlace, para qué sirve y "Crear mi enlace"; con enlace, la URL con "Copiar", las
// instrucciones para Google Calendar ("Desde URL", con `https://`) y para Outlook y Apple
// (con `webcal://`), el aviso de que cada calendario decide cada cuánto se actualiza, y
// "Regenerar enlace" en dos pasos. Con el negocio suspendido, el enlace se ve y los
// botones quedan deshabilitados.

const SOLO_LECTURA = "Tu suscripción está suspendida: tu enlace sigue funcionando, pero no puedes crear ni regenerar uno.";

/** Una URL de solo lectura con su botón "Copiar". */
function UrlCopiable({ etiqueta, url }: { etiqueta: string; url: string }) {
  const id = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [copiado, setCopiado] = useState<boolean | null>(null);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
    } catch {
      // Sin acceso al portapapeles: se selecciona, para copiarla a mano.
      campo.current?.select();
      setCopiado(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {etiqueta}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          ref={campo}
          id={id}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className={`${CLASE_CONTROL} min-w-0 flex-[1_1_240px] font-codigo text-sm`}
        />
        <button type="button" onClick={() => void copiar()} className={claseBoton("secundario")}>
          Copiar<span className="sr-only"> {etiqueta.charAt(0).toLowerCase() + etiqueta.slice(1)}</span>
        </button>
      </div>
      <p role="status" className="min-h-5 text-sm text-texto-muted">
        {copiado === true && "Copiado."}
        {copiado === false && "No pudimos copiarlo: el enlace quedó seleccionado para que lo copies."}
      </p>
    </div>
  );
}

export function EnlaceCalendario({ urls, soloLectura }: { urls: UrlsDeCalendario | null; soloLectura: boolean }) {
  const [confirmando, setConfirmando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [generando, iniciar] = useTransition();

  const generar = (regenerar: boolean) =>
    iniciar(async () => {
      const resultado = await generarEnlaceCalendarioPanel();
      setConfirmando(false);
      setMensaje(
        resultado.ok
          ? {
              tipo: "exito",
              texto: regenerar
                ? "Listo: este es tu enlace nuevo. El anterior ya no funciona: agrégalo otra vez en tu calendario."
                : "Listo: ya tienes tu enlace. Agrégalo en tu calendario con las instrucciones de abajo.",
            }
          : { tipo: "error", texto: mensajeDeError(resultado.error) },
      );
    });

  if (!urls) {
    return (
      <Seccion
        titulo="Tu enlace privado"
        descripcion="Con un enlace privado, tu calendario de Google u Outlook muestra todas las citas de tu agenda y las va actualizando solo. No hace falta conectar ninguna cuenta."
      >
        {soloLectura && <Aviso tipo="advertencia">{SOLO_LECTURA}</Aviso>}
        {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
        <button type="button" disabled={soloLectura || generando} onClick={() => generar(false)} className={`${claseBoton("primario")} self-start`}>
          {generando ? "Creando…" : "Crear mi enlace"}
        </button>
      </Seccion>
    );
  }

  return (
    <>
      <Seccion
        titulo="Tu enlace privado"
        descripcion="Quien tenga este enlace puede ver tus citas: no lo compartas. Si crees que alguien más lo tiene, regéneralo."
      >
        {soloLectura && <Aviso tipo="advertencia">{SOLO_LECTURA}</Aviso>}
        {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
        <UrlCopiable etiqueta="Enlace para Google Calendar" url={urls.https} />
        <UrlCopiable etiqueta="Enlace para Outlook y Apple" url={urls.webcal} />
      </Seccion>

      <Seccion titulo="Cómo agregarlo">
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-base font-bold">Google Calendar</h3>
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm text-tinta-suave">
            <li>Abre Google Calendar en un computador.</li>
            <li>Junto a «Otros calendarios», toca «+» y elige «Desde URL».</li>
            <li>Pega el enlace para Google Calendar y toca «Agregar calendario».</li>
          </ol>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-base font-bold">Outlook</h3>
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm text-tinta-suave">
            <li>En Outlook, elige «Agregar calendario» y luego «Suscribirse desde la web».</li>
            <li>Pega el enlace para Outlook y Apple, ponle un nombre y toca «Importar».</li>
          </ol>
          <p className="m-0 text-sm text-tinta-suave">En un iPhone o un Mac, basta con abrir ese mismo enlace.</p>
        </div>
        <Aviso tipo="info">
          Cada calendario decide cada cuánto se actualiza: en Google pueden pasar varias horas. Para saber qué tienes hoy,
          el panel sigue siendo la referencia.
        </Aviso>
      </Seccion>

      <Seccion titulo="Regenerar el enlace" descripcion="Crea un enlace nuevo. El anterior deja de funcionar en todos los calendarios donde lo agregaste.">
        {confirmando ? (
          <div role="group" aria-label="Confirmar que se regenera el enlace" className="flex flex-col gap-3">
            <p className="m-0 font-bold">¿Regenerar el enlace?</p>
            <p className="m-0 text-sm text-texto-muted">Tendrás que agregar el nuevo en tus calendarios.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={generando} onClick={() => generar(true)} className={claseBoton("peligro")}>
                {generando ? "Regenerando…" : "Sí, regenerar"}
              </button>
              <button type="button" disabled={generando} onClick={() => setConfirmando(false)} className={claseBoton("secundario")}>
                No
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={soloLectura || generando}
            onClick={() => {
              setMensaje(null);
              setConfirmando(true);
            }}
            className={`${claseBoton("secundario")} self-start`}
          >
            Regenerar enlace
          </button>
        )}
      </Seccion>
    </>
  );
}
