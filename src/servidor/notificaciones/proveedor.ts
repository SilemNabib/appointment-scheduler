import "server-only";

// Proveedor de correo (RN-20; ARCH §14.3, pasos 4 y 5, y §19.2; Q-64). Los casos de uso
// lo reciben como parámetro, igual que el azar del código de reserva (ARCH §4), así que
// las pruebas usan uno simulado y nunca llaman a Resend. La implementación usa la API REST
// de Resend con `fetch`, sin su SDK, para no sumar peso al Worker (ARCH §21.4).

const URL_RESEND = "https://api.resend.com/emails";
/** Más que esto, el envío se da por fallido y se reintenta con la espera de ARCH §14.3. */
const ESPERA_MAXIMA_MS = 15_000;

export type Adjunto = {
  /** Por ejemplo, `invitacion.ics`. */
  nombre: string;
  /** Por ejemplo, `text/calendar; method=REQUEST; charset=utf-8` (ARCH §14.6). */
  tipo: string;
  /** El contenido como texto; viaja en base64 de sus bytes UTF-8. */
  contenido: string;
};

export type MensajeCorreo = {
  /** `"{nombre}" <correo>`, ya armado por `remitente.ts`. */
  remitente: string;
  destinatario: string;
  responderA: string | null;
  asunto: string;
  html: string;
  texto: string;
  adjuntos: Adjunto[];
  /** La `clave_idempotencia` de la notificación (ARCH §14.1): el reintento no duplica el correo. */
  claveIdempotencia: string;
};

export type ResultadoEnvio =
  | { ok: true; mensajeId: string }
  | {
      ok: false;
      /**
       * Para `ultimo_error`: el estado HTTP y el nombre del error del proveedor (por
       * ejemplo, `RESEND_403:validation_error`) o la falla de red. Nunca el destinatario
       * ni el mensaje del proveedor, que puede traer direcciones (ARCH §19.2).
       */
      error: string;
      /**
       * La clave ya se usó con otro cuerpo: el proveedor ya aceptó un mensaje con ella,
       * así que reenviarla no sirve (RN-20). Pasa si los datos de la cita cambiaron
       * entre un envío aceptado y su reintento.
       */
      claveYaUsada: boolean;
    };

export type ProveedorCorreo = { enviar(mensaje: MensajeCorreo): Promise<ResultadoEnvio> };

function aBase64(texto: string): string {
  let binario = "";
  for (const byte of new TextEncoder().encode(texto)) binario += String.fromCharCode(byte);
  return btoa(binario);
}

/** El nombre del error de Resend (`{ name, message }`), si el cuerpo lo trae. */
async function nombreDelError(respuesta: Response): Promise<string | null> {
  try {
    const cuerpo: unknown = await respuesta.json();
    const nombre = (cuerpo as { name?: unknown } | null)?.name;
    return typeof nombre === "string" && /^[a-z_]{1,64}$/.test(nombre) ? nombre : null;
  } catch {
    return null;
  }
}

/** El cuerpo de `POST /emails` de Resend. */
function cuerpo(m: MensajeCorreo) {
  return {
    from: m.remitente,
    to: [m.destinatario],
    subject: m.asunto,
    html: m.html,
    text: m.texto,
    ...(m.responderA ? { reply_to: m.responderA } : {}),
    ...(m.adjuntos.length > 0
      ? { attachments: m.adjuntos.map((a) => ({ filename: a.nombre, content: aBase64(a.contenido), content_type: a.tipo })) }
      : {}),
  };
}

/**
 * El proveedor de Resend, con `RESEND_API_KEY`. Lanza al crearse si falta la clave: es
 * un error de configuración, no de un envío.
 */
export function proveedorResend(apiKey: string | undefined = process.env.RESEND_API_KEY, pedir: typeof fetch = fetch): ProveedorCorreo {
  if (!apiKey) throw new Error("Falta RESEND_API_KEY (ver .env.example).");
  return {
    async enviar(m) {
      let respuesta: Response;
      try {
        respuesta = await pedir(URL_RESEND, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": m.claveIdempotencia,
          },
          body: JSON.stringify(cuerpo(m)),
          signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
        });
      } catch (e) {
        // `TypeError` (red) o `TimeoutError`: solo el nombre, el mensaje puede traer la URL.
        return { ok: false, error: `RED:${e instanceof Error ? e.name : "desconocido"}`, claveYaUsada: false };
      }
      if (respuesta.ok) {
        const id = await respuesta
          .json()
          .then((c: unknown) => (c as { id?: unknown } | null)?.id)
          .catch(() => undefined);
        if (typeof id === "string" && id) return { ok: true, mensajeId: id };
        return { ok: false, error: `RESEND_${respuesta.status}:sin_id`, claveYaUsada: false };
      }
      const nombre = await nombreDelError(respuesta);
      return {
        ok: false,
        error: nombre ? `RESEND_${respuesta.status}:${nombre}` : `RESEND_${respuesta.status}`,
        claveYaUsada: nombre === "invalid_idempotent_request",
      };
    },
  };
}
