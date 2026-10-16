import { leerImagen } from "@/servidor/archivos/imagenes";

// Logos y fotos guardados en R2 (ARCH §19.2; Q-21). El bucket no es público: el Worker
// sirve cada imagen por su clave aleatoria. Una clave nunca cambia de contenido (al
// reemplazar un logo se crea otra), así que el navegador la guarda un año.
// `nosniff` impide que el navegador interprete el archivo como otro tipo.
export async function GET(_solicitud: Request, { params }: { params: Promise<{ clave: string }> }) {
  const { clave } = await params;
  const imagen = await leerImagen(clave);
  if (!imagen) {
    return new Response(null, { status: 404, headers: { "X-Content-Type-Options": "nosniff" } });
  }
  return new Response(imagen.cuerpo, {
    headers: {
      "Content-Type": imagen.tipo,
      "Content-Length": String(imagen.tamano),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ETag: imagen.etag,
    },
  });
}
