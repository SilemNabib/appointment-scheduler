// Mosaico de logo (DESIGN §3, §8): el logo del negocio en el encabezado, la portada y el
// panel. Sin logo, la inicial del nombre con un punto del color de marca. Los tamaños
// chicos (42 y 48 px) van en `lima` con la inicial en `tinta`; los grandes (72 y 116 px),
// en `tinta` con la inicial en el destaque (Q-42). Es decorativo cuando el nombre se lee
// al lado: entonces el lector de pantalla lo salta.

export type TamanoMosaico = 42 | 48 | 72 | 116;

/** Radio, tamaño de la inicial y del punto, en px, para cada tamaño (DESIGN §2.3: 13 a 32 px). */
const MEDIDAS: Record<TamanoMosaico, { radio: number; letra: number; punto: number; margen: number }> = {
  42: { radio: 13, letra: 28, punto: 7, margen: 6 },
  48: { radio: 14, letra: 30, punto: 8, margen: 7 },
  72: { radio: 20, letra: 46, punto: 11, margen: 11 },
  116: { radio: 32, letra: 72, punto: 14, margen: 16 },
};

/** La primera letra del nombre, en mayúscula; sin letras, la primera cifra o "·". */
export function inicial(nombre: string): string {
  const letra = /[\p{L}\p{N}]/u.exec(nombre.trim());
  return letra ? letra[0].toLocaleUpperCase("es-CO") : "·";
}

export function MosaicoLogo({
  nombre,
  logoUrl,
  tamano,
  decorativo = true,
  className,
}: {
  nombre: string;
  logoUrl: string | null;
  tamano: TamanoMosaico;
  /** `false` si no hay otro texto con el nombre del negocio cerca. */
  decorativo?: boolean;
  className?: string;
}) {
  const m = MEDIDAS[tamano];
  const grande = tamano >= 72;
  const caja = { width: tamano, height: tamano, borderRadius: m.radio };

  if (logoUrl) {
    return (
      // `<img>` y no `next/image`: el logo ya se sirve desde /api/media con su caché (Q-21).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={decorativo ? "" : `Logo de ${nombre}`}
        width={tamano}
        height={tamano}
        style={caja}
        className={`shrink-0 border border-borde bg-superficie object-contain ${className ?? ""}`}
      />
    );
  }

  return (
    <span
      aria-hidden={decorativo || undefined}
      role={decorativo ? undefined : "img"}
      aria-label={decorativo ? undefined : `Inicial de ${nombre}`}
      style={{ ...caja, fontSize: m.letra, paddingBottom: Math.round(m.letra / 10) }}
      className={
        "relative grid shrink-0 place-items-center font-titulos leading-none font-extrabold " +
        `${grande ? "bg-tinta text-destaque" : "bg-lima text-tinta"} ${className ?? ""}`
      }
    >
      {inicial(nombre)}
      <span
        className="absolute rounded-full bg-acento"
        style={{ width: m.punto, height: m.punto, right: m.margen, bottom: m.margen }}
      />
    </span>
  );
}
