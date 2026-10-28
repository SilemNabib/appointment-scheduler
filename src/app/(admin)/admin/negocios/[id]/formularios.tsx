"use client";

import { useActionState, useState, useTransition } from "react";
import { Aviso, type TipoAviso } from "@/componentes/aviso";
import { BotonEnviar, Entrada, Seccion } from "@/componentes/formulario";
import { claseBoton } from "@/componentes/estilos";
import { mensajeDeError } from "@/componentes/mensajes";
import { formatearFechaLocal } from "@/dominio/formato";
import { cambiarFinPruebaAdmin, reenviarInvitacionAdmin, registrarPagoAdmin, suspenderNegocioAdmin } from "./acciones";

// Acciones de suscripción del admin (ADM-03; RN-31, D-14, Q-25). Las fechas son locales
// e inclusivas: "pagado hasta el 9" cubre todo el día 9 (ARCH §7.6). Validan en el
// servidor (Q-02). Y "Reenviar invitación", mientras el dueño no entre (T6.33; Q-73).

type Estado = { error?: string; exito?: string };

const MENSAJES = { NO_ENCONTRADO: "El negocio ya no existe. Vuelve a la lista." };

export function FormularioPago({ negocioId, pagadoHasta }: { negocioId: string; pagadoHasta: string | null }) {
  const [estado, enviar] = useActionState<Estado, FormData>(async (_previo, formulario) => {
    const resultado = await registrarPagoAdmin(formulario);
    if (resultado.ok) return { exito: `Pago registrado: pagado hasta el ${formatearFechaLocal(String(formulario.get("pagadoHasta")))}.` };
    return {
      error: mensajeDeError(resultado.error, {
        ...MENSAJES,
        DATOS_INVALIDOS: pagadoHasta
          ? `La fecha debe ser posterior al pagado hasta actual (${formatearFechaLocal(pagadoHasta)}).`
          : "Elige una fecha válida.",
      }),
    };
  }, {});

  return (
    <Seccion
      titulo="Registrar un pago"
      descripcion="Deja el negocio activo hasta la fecha elegida, incluida. Si estaba suspendido, vuelve a funcionar de inmediato."
    >
      <form action={enviar} className="flex flex-col gap-4">
        {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
        {estado.exito && <Aviso tipo="exito">{estado.exito}</Aviso>}
        <input type="hidden" name="negocioId" value={negocioId} />
        <Entrada
          id="pagadoHasta"
          name="pagadoHasta"
          type="date"
          etiqueta="Pagado hasta (incluido)"
          ayuda="En hora de Colombia."
          required
          className="max-w-56"
        />
        <div>
          <BotonEnviar textoEnviando="Registrando…">Registrar pago</BotonEnviar>
        </div>
      </form>
    </Seccion>
  );
}

export function FormularioFinPrueba({ negocioId, finPrueba }: { negocioId: string; finPrueba: string | null }) {
  const [estado, enviar] = useActionState<Estado, FormData>(async (_previo, formulario) => {
    const resultado = await cambiarFinPruebaAdmin(formulario);
    if (resultado.ok) return { exito: `La prueba termina el ${formatearFechaLocal(String(formulario.get("finPrueba")))}.` };
    return {
      error: mensajeDeError(resultado.error, {
        ...MENSAJES,
        DATOS_INVALIDOS: "Elige una fecha válida.",
        ESTADO_INVALIDO: "El negocio ya no está en prueba. Recarga la página.",
      }),
    };
  }, {});

  return (
    <Seccion titulo="Cambiar el fin de la prueba" descripcion="Último día de la prueba, incluido.">
      <form action={enviar} className="flex flex-col gap-4">
        {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
        {estado.exito && <Aviso tipo="exito">{estado.exito}</Aviso>}
        <input type="hidden" name="negocioId" value={negocioId} />
        <Entrada
          id="finPrueba"
          name="finPrueba"
          type="date"
          etiqueta="Fin de la prueba (incluido)"
          ayuda="En hora de Colombia."
          required
          defaultValue={finPrueba ?? undefined}
          className="max-w-56"
        />
        <div>
          <BotonEnviar textoEnviando="Guardando…">Cambiar el fin de la prueba</BotonEnviar>
        </div>
      </form>
    </Seccion>
  );
}

export function BotonSuspender({ negocioId, nombre }: { negocioId: string; nombre: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [suspendiendo, iniciar] = useTransition();

  const suspender = () =>
    iniciar(async () => {
      const resultado = await suspenderNegocioAdmin(negocioId);
      setMensaje(
        resultado.ok
          ? { tipo: "exito", texto: "Suspendiste el negocio. Su dueño recibirá el aviso por correo." }
          : {
              tipo: "error",
              texto: mensajeDeError(resultado.error, { ...MENSAJES, ESTADO_INVALIDO: "El negocio ya estaba suspendido." }),
            },
      );
      setConfirmando(false);
    });

  return (
    <Seccion
      titulo="Suspender"
      descripcion="El panel del dueño queda en solo lectura y la página pública deja de aceptar reservas. Los datos se conservan."
    >
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Confirmar la suspensión">
          <span className="text-sm">¿Suspender {nombre}?</span>
          <button type="button" disabled={suspendiendo} onClick={suspender} className={claseBoton("peligro")}>
            {suspendiendo ? "Suspendiendo…" : "Sí, suspender"}
          </button>
          <button
            type="button"
            disabled={suspendiendo}
            onClick={() => setConfirmando(false)}
            className={claseBoton("secundario")}
          >
            No
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => {
              setMensaje(null);
              setConfirmando(true);
            }}
            className={claseBoton("peligro")}
          >
            Suspender
          </button>
        </div>
      )}
    </Seccion>
  );
}

export function BotonReenviarInvitacion({ negocioId, correo }: { negocioId: string; correo: string }) {
  const [mensaje, setMensaje] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [enviando, iniciar] = useTransition();

  const reenviar = () =>
    iniciar(async () => {
      const resultado = await reenviarInvitacionAdmin(negocioId);
      setMensaje(
        !resultado.ok
          ? {
              tipo: "error",
              texto: mensajeDeError(resultado.error, {
                ...MENSAJES,
                ESTADO_INVALIDO: "El dueño ya entró al panel: no necesita otra invitación. Recarga la página.",
              }),
            }
          : resultado.valor.invitacionEnviada
            ? { tipo: "exito", texto: `Listo: le enviamos una invitación nueva a ${correo}.` }
            : {
                tipo: "error",
                texto:
                  "No se pudo enviar la invitación. Intenta de nuevo en unos minutos o envíala desde el " +
                  "Dashboard de Clerk (Users → Invitations) con su correo.",
              },
      );
    });

  return (
    <Seccion
      titulo="Invitación del dueño"
      descripcion={`El dueño (${correo}) todavía no entra al panel. Si no le llegó la invitación o ya venció, envíale una nueva. La anterior sigue sirviendo.`}
    >
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      <div>
        <button type="button" disabled={enviando} onClick={reenviar} className={claseBoton("secundario")}>
          {enviando ? "Enviando…" : "Reenviar invitación"}
        </button>
      </div>
    </Seccion>
  );
}
