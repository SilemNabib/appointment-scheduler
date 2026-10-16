import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { quitarLogo, subirLogo } from "@/servidor/casos-uso/logo-negocio";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { sesionDeDueno } from "../fixtures";

// Logo del negocio (PAN-11; ARCH §19.2; Q-21), con el binding de R2 simulado en memoria
// y la base real. Clerk se simula.

const r2 = vi.hoisted(() => {
  const objetos = new Map<string, Uint8Array>();
  return {
    objetos,
    MEDIA: {
      put: async (clave: string, bytes: Uint8Array) => void objetos.set(clave, bytes),
      delete: async (clave: string) => void objetos.delete(clave),
    },
  };
});

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: { MEDIA: r2.MEDIA } }) }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

beforeEach(() => {
  r2.objetos.clear();
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

/** Archivo como lo entrega un formulario, con el nombre y el tipo que diga el navegador. */
const archivo = (bytes: Uint8Array, nombre = "logo.png", tipo = "image/png") =>
  new File([new Uint8Array(bytes)], nombre, { type: tipo });

async function logoUrl(negocioId: string) {
  const [fila] = await db()
    .select({ logoUrl: esquema.negocio.logoUrl })
    .from(esquema.negocio)
    .where(eq(esquema.negocio.id, negocioId));
  return fila.logoUrl;
}

const claveDe = (url: string) => url.replace("/api/media/", "");

describe("subirLogo y quitarLogo", () => {
  test("un PNG válido queda en logo_url, y reemplazarlo borra el anterior de R2", async () => {
    const { negocioId } = await sesionDeDueno();

    const primero = await subirLogo({ negocioId }, archivo(PNG, "mi-logo.png"));
    if (!primero.ok) throw new Error(primero.error);
    expect(primero.valor.logoUrl).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.png$/);
    expect(primero.valor.logoUrl).not.toContain("mi-logo");
    expect(await logoUrl(negocioId)).toBe(primero.valor.logoUrl);
    expect([...r2.objetos.keys()]).toEqual([claveDe(primero.valor.logoUrl)]);

    const segundo = await subirLogo({ negocioId }, archivo(PNG));
    if (!segundo.ok) throw new Error(segundo.error);
    expect(await logoUrl(negocioId)).toBe(segundo.valor.logoUrl);
    expect([...r2.objetos.keys()]).toEqual([claveDe(segundo.valor.logoUrl)]);
  });

  test("un SVG devuelve DATOS_INVALIDOS y no guarda nada, aunque el navegador diga que es PNG (ARCH §19.2)", async () => {
    const { negocioId } = await sesionDeDueno();

    expect(await subirLogo({ negocioId }, archivo(SVG, "logo.png", "image/png"))).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
    });
    expect(await subirLogo({ negocioId }, archivo(SVG, "logo.svg", "image/svg+xml"))).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
    });
    expect(r2.objetos.size).toBe(0);
    expect(await logoUrl(negocioId)).toBeNull();
  });

  test("sin archivo o con uno de más de 512 KB devuelve DATOS_INVALIDOS", async () => {
    const { negocioId } = await sesionDeDueno();
    const grande = new Uint8Array(512 * 1024 + 1);
    grande.set(PNG);

    for (const entrada of [null, "logo.png", archivo(grande)]) {
      expect(await subirLogo({ negocioId }, entrada)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    }
    expect(r2.objetos.size).toBe(0);
  });

  test("si falla la escritura en la base, borra la imagen subida", async () => {
    await expect(subirLogo({ negocioId: randomUUID() }, archivo(PNG))).rejects.toThrow();
    expect(r2.objetos.size).toBe(0);
  });

  test("quitarLogo deja logo_url en NULL y borra la imagen", async () => {
    const { negocioId } = await sesionDeDueno();
    const subido = await subirLogo({ negocioId }, archivo(PNG));
    if (!subido.ok) throw new Error(subido.error);

    expect(await quitarLogo({ negocioId })).toEqual({ ok: true, valor: undefined });
    expect(await logoUrl(negocioId)).toBeNull();
    expect(r2.objetos.size).toBe(0);
  });
});
