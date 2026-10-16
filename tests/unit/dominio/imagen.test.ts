import { describe, expect, test } from "vitest";
import { TAMANO_MAXIMO_IMAGEN, validarImagen } from "@/dominio/imagen";

// Validación de imágenes (ARCH §19.2, Archivos).

const texto = (contenido: string) => new TextEncoder().encode(contenido);

/** Archivo que empieza con `cabecera` y completa `tamano` bytes con ceros. */
function archivo(cabecera: number[] | Uint8Array, tamano = 64) {
  const bytes = new Uint8Array(Math.max(tamano, cabecera.length));
  bytes.set(cabecera);
  return bytes;
}

// Muestras mínimas: solo la firma de cada formato y algo de relleno.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, ...texto("IHDR")];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...texto("JFIF")];
const WEBP = [...texto("RIFF"), 0x24, 0x00, 0x00, 0x00, ...texto("WEBPVP8 ")];

describe("validarImagen", () => {
  test.each([
    ["PNG", PNG, { tipo: "image/png", extension: "png" }],
    ["JPEG", JPEG, { tipo: "image/jpeg", extension: "jpg" }],
    ["WebP", WEBP, { tipo: "image/webp", extension: "webp" }],
  ])("acepta una muestra mínima de %s", (_, cabecera, esperado) => {
    expect(validarImagen(archivo(cabecera))).toEqual({ ok: true, valor: esperado });
  });

  test.each([
    ["un SVG (ARCH §19.2: sin SVG)", texto('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["un SVG con declaración XML", texto('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')],
    ["un GIF", archivo(texto("GIF89a"))],
    ["un texto con nombre .png: el nombre no cuenta", texto("hola, no soy una imagen")],
    ["un RIFF que no es WebP (un WAV)", archivo([...texto("RIFF"), 0x24, 0x00, 0x00, 0x00, ...texto("WAVE")])],
    ["un PNG truncado", new Uint8Array(PNG.slice(0, 4))],
    ["un archivo vacío", new Uint8Array()],
  ])("rechaza %s por su formato", (_, bytes) => {
    expect(validarImagen(bytes)).toEqual({ ok: false, error: "formato" });
  });

  test("acepta un archivo de 512 KB y rechaza uno de 512 KB más 1 byte", () => {
    expect(TAMANO_MAXIMO_IMAGEN).toBe(512 * 1024);
    expect(validarImagen(archivo(PNG, TAMANO_MAXIMO_IMAGEN)).ok).toBe(true);
    expect(validarImagen(archivo(PNG, TAMANO_MAXIMO_IMAGEN + 1))).toEqual({ ok: false, error: "tamano" });
  });
});
