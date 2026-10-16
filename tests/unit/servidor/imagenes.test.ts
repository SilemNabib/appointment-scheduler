import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  borrarImagen,
  claveDeUrl,
  guardarImagen,
  leerImagen,
  urlDeImagen,
} from "@/servidor/archivos/imagenes";

// Almacenamiento de imágenes en R2 (ARCH §19.2; Q-21), con el binding `MEDIA` simulado.

const objetos = new Map<string, { bytes: Uint8Array; contentType?: string }>();

const MEDIA = {
  put: vi.fn(async (clave: string, bytes: Uint8Array, opciones?: { httpMetadata?: { contentType?: string } }) => {
    objetos.set(clave, { bytes, contentType: opciones?.httpMetadata?.contentType });
  }),
  get: vi.fn(async (clave: string) => {
    const objeto = objetos.get(clave);
    return objeto ? { body: new Blob([new Uint8Array(objeto.bytes)]).stream(), size: objeto.bytes.length, httpEtag: '"e"' } : null;
  }),
  delete: vi.fn(async (clave: string) => {
    objetos.delete(clave);
  }),
};

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: { MEDIA } }) }));

beforeEach(() => {
  objetos.clear();
  vi.clearAllMocks();
});

const CLAVE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/;
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe("servidor/archivos/imagenes", () => {
  test("guarda con una clave aleatoria, la extensión y el tipo detectados", async () => {
    const clave = await guardarImagen(BYTES, { tipo: "image/png", extension: "png" });
    const otra = await guardarImagen(BYTES, { tipo: "image/png", extension: "png" });

    expect(clave).toMatch(CLAVE);
    expect(otra).not.toBe(clave);
    expect(objetos.get(clave)).toEqual({ bytes: BYTES, contentType: "image/png" });
  });

  test("lee una imagen guardada con su tipo y su tamaño, y devuelve null si no existe", async () => {
    const clave = await guardarImagen(BYTES, { tipo: "image/png", extension: "png" });

    expect(await leerImagen(clave)).toMatchObject({ tipo: "image/png", tamano: BYTES.length });
    expect(await leerImagen("00000000-0000-0000-0000-000000000000.png")).toBeNull();
  });

  test.each(["logo.png", "../secreto.png", "00000000-0000-0000-0000-000000000000.svg", ""])(
    "una clave con otro formato (%j) no llega a R2",
    async (clave) => {
      expect(await leerImagen(clave)).toBeNull();
      expect(MEDIA.get).not.toHaveBeenCalled();
    },
  );

  test("la URL pública lleva la clave, y claveDeUrl la recupera solo de esas rutas", async () => {
    const clave = await guardarImagen(BYTES, { tipo: "image/png", extension: "png" });

    expect(urlDeImagen(clave)).toBe(`/api/media/${clave}`);
    expect(claveDeUrl(urlDeImagen(clave))).toBe(clave);
    expect(claveDeUrl("https://otro.sitio/logo.png")).toBeNull();
    expect(claveDeUrl("/api/media/logo.png")).toBeNull();
  });

  test("borrar quita la imagen", async () => {
    const clave = await guardarImagen(BYTES, { tipo: "image/png", extension: "png" });

    await borrarImagen(clave);
    expect(await leerImagen(clave)).toBeNull();
  });
});
