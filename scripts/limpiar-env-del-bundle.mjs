// Se ejecuta entre `opennextjs-cloudflare build` y `opennextjs-cloudflare deploy`.
//
// Al compilar, OpenNext copia en `.open-next/cloudflare/next-env.mjs` los valores de
// `.env`, `.env.production`, `.env.local` y `.env.production.local`, y el Worker los usa
// como respaldo de `process.env`. Así, los secretos de desarrollo de `.env.local` (la
// base `development`, `NEON_API_KEY`, la clave secreta de Clerk…) y la cadena directa de
// producción se subirían a Cloudflare dentro del bundle, y una variable que faltara
// como secreto tomaría en silencio el valor de desarrollo (RNF-04).
//
// Este script deja solo las `NEXT_PUBLIC_*`, que ya son públicas y Next las incrusta en
// el JavaScript del navegador. Todo lo demás llega por los secretos y los `vars` del
// Worker (ARCH §21.3). Falla si el archivo no existe o si después queda otra variable.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const RUTA_NEXT_ENV = ".open-next/cloudflare/next-env.mjs";
const MODOS = ["production", "development", "test"];

/** Solo las variables `NEXT_PUBLIC_*` de un objeto de entorno. */
export function soloPublicas(variables) {
  return Object.fromEntries(Object.entries(variables ?? {}).filter(([clave]) => clave.startsWith("NEXT_PUBLIC_")));
}

/** Contenido de `next-env.mjs` con solo las variables públicas, en el formato de OpenNext. */
export function nextEnvLimpio(modulo) {
  return MODOS.map((modo) => `export const ${modo} = ${JSON.stringify(soloPublicas(modulo[modo]))};\n`).join("");
}

async function importar(ruta) {
  // `?t=` evita que Node devuelva el módulo ya cargado al volver a importarlo.
  return import(`${pathToFileURL(ruta).href}?t=${Date.now()}`);
}

async function principal() {
  let original;
  try {
    readFileSync(RUTA_NEXT_ENV);
    original = await importar(RUTA_NEXT_ENV);
  } catch {
    console.error(`No existe ${RUTA_NEXT_ENV}: ejecuta antes \`opennextjs-cloudflare build\`.`);
    process.exit(1);
  }

  writeFileSync(RUTA_NEXT_ENV, nextEnvLimpio(original));

  const limpio = await importar(RUTA_NEXT_ENV);
  const quitadas = new Set(MODOS.flatMap((modo) => Object.keys(original[modo] ?? {})));
  const restantes = MODOS.flatMap((modo) => Object.keys(limpio[modo] ?? {}));
  const noPublicas = restantes.filter((clave) => !clave.startsWith("NEXT_PUBLIC_"));
  if (noPublicas.length > 0) {
    console.error(`Quedaron variables no públicas en ${RUTA_NEXT_ENV}: ${noPublicas.join(", ")}`);
    process.exit(1);
  }
  for (const clave of restantes) quitadas.delete(clave);
  console.log(
    `${RUTA_NEXT_ENV}: quedan ${new Set(restantes).size} variables NEXT_PUBLIC_*; ` +
      `se quitaron ${quitadas.size} (${[...quitadas].sort().join(", ") || "ninguna"}).`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await principal();
}
