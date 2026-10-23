import { afterEach, describe, expect, test, vi } from "vitest";
import { proveedorResend, type MensajeCorreo } from "@/servidor/notificaciones/proveedor";

// Proveedor de correo con `fetch` simulado (ARCH §14.3, pasos 4 y 5, y §19.2; Q-64).

const CLAVE = "re_clave_de_prueba";
const DESTINATARIO = "ana.perez@mail.com";
const ICS = "BEGIN:VCALENDAR\r\nSUMMARY:Limpieza — Consultorio Ana\r\nEND:VCALENDAR\r\n";

const mensaje = (m: Partial<MensajeCorreo> = {}): MensajeCorreo => ({
  remitente: '"Consultorio Ana" <onboarding@resend.dev>',
  destinatario: DESTINATARIO,
  responderA: "contacto@consultorio-ana.com",
  asunto: "Tu cita en Consultorio Ana está confirmada",
  html: "<p>Hola</p>",
  texto: "Hola",
  adjuntos: [{ nombre: "invitacion.ics", tipo: "text/calendar; method=REQUEST; charset=utf-8", contenido: ICS }],
  claveIdempotencia: "confirmacion:6f1c1d0e-2b3a-4c5d-8e9f-0a1b2c3d4e5f",
  ...m,
});

const json = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

function simulado(respuesta: Response | Error) {
  return vi.fn<typeof fetch>(async () => {
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("la solicitud a Resend (ARCH §14.3, paso 4)", () => {
  test("POST /emails con Authorization: Bearer, Idempotency-Key y el cuerpo de Resend", async () => {
    const pedir = simulado(json(200, { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }));
    await proveedorResend(CLAVE, pedir).enviar(mensaje());

    expect(pedir).toHaveBeenCalledOnce();
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(opciones?.method).toBe("POST");
    const encabezados = new Headers(opciones?.headers);
    expect(encabezados.get("Authorization")).toBe(`Bearer ${CLAVE}`);
    expect(encabezados.get("Content-Type")).toBe("application/json");
    expect(encabezados.get("Idempotency-Key")).toBe("confirmacion:6f1c1d0e-2b3a-4c5d-8e9f-0a1b2c3d4e5f");

    const cuerpo = JSON.parse(String(opciones?.body));
    expect(cuerpo).toMatchObject({
      from: '"Consultorio Ana" <onboarding@resend.dev>',
      to: [DESTINATARIO],
      reply_to: "contacto@consultorio-ana.com",
      subject: "Tu cita en Consultorio Ana está confirmada",
      html: "<p>Hola</p>",
      text: "Hola",
    });
  });

  test("el adjunto .ics va en base64 de sus bytes UTF-8, con su nombre y su tipo", async () => {
    const pedir = simulado(json(200, { id: "x" }));
    await proveedorResend(CLAVE, pedir).enviar(mensaje());
    const { attachments } = JSON.parse(String(pedir.mock.calls[0][1]?.body));
    expect(attachments).toEqual([
      { filename: "invitacion.ics", content: expect.any(String), content_type: "text/calendar; method=REQUEST; charset=utf-8" },
    ]);
    expect(Buffer.from(attachments[0].content, "base64").toString("utf8")).toBe(ICS);
  });

  test("sin reply_to ni adjuntos, no los envía", async () => {
    const pedir = simulado(json(200, { id: "x" }));
    await proveedorResend(CLAVE, pedir).enviar(mensaje({ responderA: null, adjuntos: [] }));
    const cuerpo = JSON.parse(String(pedir.mock.calls[0][1]?.body));
    expect(cuerpo).not.toHaveProperty("reply_to");
    expect(cuerpo).not.toHaveProperty("attachments");
  });

  test("sin RESEND_API_KEY, crear el proveedor lanza un error", () => {
    vi.stubEnv("RESEND_API_KEY", undefined);
    expect(() => proveedorResend()).toThrow(/RESEND_API_KEY/);
    expect(() => proveedorResend("")).toThrow(/RESEND_API_KEY/);
  });
});

describe("la respuesta (ARCH §14.3, paso 5, y §19.2)", () => {
  test("un 200 devuelve el id del mensaje", async () => {
    const r = await proveedorResend(CLAVE, simulado(json(200, { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }))).enviar(mensaje());
    expect(r).toEqual({ ok: true, mensajeId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
  });

  test.each<[string, Response | Error, string, boolean]>([
    [
      "un 403 del modo de prueba, cuyo mensaje trae una dirección",
      json(403, { name: "validation_error", message: `You can only send testing emails to your own email address (${DESTINATARIO}).` }),
      "RESEND_403:validation_error",
      false,
    ],
    ["un 422", json(422, { name: "missing_required_field", message: "Missing `to` field." }), "RESEND_422:missing_required_field", false],
    ["un 429", json(429, { name: "rate_limit_exceeded", message: "Too many requests." }), "RESEND_429:rate_limit_exceeded", false],
    ["un 500 sin cuerpo JSON", new Response("Internal Server Error", { status: 500 }), "RESEND_500", false],
    ["un 503", json(503, { name: "service_unavailable", message: "…" }), "RESEND_503:service_unavailable", false],
    [
      "un 409 de una clave usada con otro cuerpo",
      json(409, { name: "invalid_idempotent_request", message: "…" }),
      "RESEND_409:invalid_idempotent_request",
      true,
    ],
    [
      "un 409 de una solicitud con la misma clave en curso",
      json(409, { name: "concurrent_idempotent_requests", message: "…" }),
      "RESEND_409:concurrent_idempotent_requests",
      false,
    ],
    ["un 200 sin id", json(200, {}), "RESEND_200:sin_id", false],
    ["una falla de red", new TypeError(`fetch failed: ${DESTINATARIO}`), "RED:TypeError", false],
    ["una espera agotada", new DOMException("The operation timed out.", "TimeoutError"), "RED:TimeoutError", false],
  ])("%s devuelve un error sin el destinatario", async (_, respuesta, error, claveYaUsada) => {
    const consola = (["log", "info", "warn", "error", "debug"] as const).map((n) => vi.spyOn(console, n));
    const r = await proveedorResend(CLAVE, simulado(respuesta)).enviar(mensaje());
    expect(r).toEqual({ ok: false, error, claveYaUsada });
    expect(JSON.stringify(r)).not.toContain(DESTINATARIO);
    // El proveedor no registra nada: los registros los hace el procesador, sin datos personales.
    for (const espia of consola) expect(espia).not.toHaveBeenCalled();
  });

  test("un nombre de error que no tiene la forma esperada no se copia", async () => {
    const r = await proveedorResend(CLAVE, simulado(json(400, { name: `raro ${DESTINATARIO}` }))).enviar(mensaje());
    expect(r).toEqual({ ok: false, error: "RESEND_400", claveYaUsada: false });
  });
});
