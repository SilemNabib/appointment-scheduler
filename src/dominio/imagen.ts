import { exito, fallo, type Resultado } from "./resultado";

// Validación de los logos y las fotos (ARCH §19.2, Archivos): solo PNG, JPEG o WebP,
// de hasta 512 KB. El tipo se detecta por los primeros bytes del archivo, sin fiarse
// del nombre ni del tipo que declara el navegador. Sin SVG, porque puede contener
// scripts, y sin GIF.

/** 512 KB. */
export const TAMANO_MAXIMO_IMAGEN = 512 * 1024;

export type TipoImagen = "image/png" | "image/jpeg" | "image/webp";

export type ImagenValida = { tipo: TipoImagen; extension: "png" | "jpg" | "webp" };

/** Por qué se rechaza: no es PNG, JPEG ni WebP, o pasa del tamaño máximo. */
export type MotivoImagenInvalida = "formato" | "tamano";

const ascii = (texto: string) => Array.from(texto, (c) => c.charCodeAt(0));

/** Firmas de cada formato: bytes esperados a partir de una posición. */
const FIRMAS: { imagen: ImagenValida; partes: { desde: number; bytes: number[] }[] }[] = [
  {
    imagen: { tipo: "image/png", extension: "png" },
    partes: [{ desde: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  },
  {
    imagen: { tipo: "image/jpeg", extension: "jpg" },
    partes: [{ desde: 0, bytes: [0xff, 0xd8, 0xff] }],
  },
  {
    // Contenedor RIFF (4 bytes de tamaño en medio) con el formato WEBP.
    imagen: { tipo: "image/webp", extension: "webp" },
    partes: [
      { desde: 0, bytes: ascii("RIFF") },
      { desde: 8, bytes: ascii("WEBP") },
    ],
  },
];

const coincide = (archivo: Uint8Array, { desde, bytes }: { desde: number; bytes: number[] }) =>
  archivo.length >= desde + bytes.length && bytes.every((b, i) => archivo[desde + i] === b);

/** Detecta el tipo de la imagen por su contenido y comprueba su tamaño. */
export function validarImagen(archivo: Uint8Array): Resultado<ImagenValida, MotivoImagenInvalida> {
  if (archivo.length > TAMANO_MAXIMO_IMAGEN) return fallo("tamano");
  const firma = FIRMAS.find(({ partes }) => partes.every((parte) => coincide(archivo, parte)));
  return firma ? exito(firma.imagen) : fallo("formato");
}
