import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { FONDO, SUPERFICIE, TINTA, textoSobre } from "@/dominio/color";
import { enlaceContacto, enlaceMapa, valorVisible, type Contacto } from "@/dominio/contactos";

// Lo común a todos los correos (RNF-02, RNF-03; DESIGN §2; Q-42 de TASKS-04, Q-65, Q-66):
// el encabezado con el nombre y el logo del negocio (o el nombre del producto en C-07 y
// C-08), el botón principal con el acento y el texto que contrasta con él
// (`dominio/color.ts`), los datos de la cita y el pie con los contactos del negocio. Las
// plantillas solo presentan: reciben los datos ya leídos y formateados. Los estilos van
// en línea y sin fuentes web, porque Gmail y Outlook no admiten otra cosa.

const TINTA_SUAVE = "#3a3f45";
const TEXTO_MUTED = "#5b6068";
const BORDE = "#e3e5e0";
const FUENTE = "Figtree, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONOESPACIADA = "ui-monospace, Menlo, Consolas, monospace";

/** Quién firma el correo: el negocio (C-01 a C-06) o el producto (C-07 y C-08; S-16). */
export type Marca =
  | { tipo: "negocio"; nombre: string; /** URL absoluta, o `null` sin logo. */ logoUrl: string | null; acento: string }
  | { tipo: "producto"; nombre: string };

/** El acento de la marca; los correos del producto usan el botón primario de DESIGN, `tinta`. */
const acentoDe = (marca: Marca) => (marca.tipo === "negocio" ? marca.acento : TINTA);

export function Diseno({
  marca,
  vistaPrevia,
  pie,
  children,
}: {
  marca: Marca;
  /** El texto que el buzón muestra junto al asunto. */
  vistaPrevia: string;
  pie?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Html lang="es" dir="ltr">
      <Head>
        {/* Los clientes de correo del celular que usan una vista web lo dibujan al ancho de la pantalla (RNF-02). */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Preview>{vistaPrevia}</Preview>
      <Body style={{ backgroundColor: FONDO, color: TINTA, fontFamily: FUENTE, margin: 0, padding: "24px 12px" }}>
        <Container
          style={{
            backgroundColor: SUPERFICIE,
            border: `1px solid ${BORDE}`,
            borderRadius: 24,
            maxWidth: 560,
            padding: "24px 20px",
          }}
        >
          <Section style={{ marginBottom: 8 }}>
            {marca.tipo === "negocio" && marca.logoUrl && (
              <Img
                src={marca.logoUrl}
                alt=""
                width={56}
                height={56}
                style={{ borderRadius: 16, display: "block", marginBottom: 12, objectFit: "cover" }}
              />
            )}
            <Text style={{ color: TINTA, fontSize: 18, fontWeight: 700, lineHeight: "24px", margin: 0 }}>{marca.nombre}</Text>
          </Section>
          {children}
          {pie && (
            <>
              <Hr style={{ borderColor: BORDE, margin: "24px 0 16px" }} />
              {pie}
            </>
          )}
        </Container>
      </Body>
    </Html>
  );
}

export function Titulo({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" style={{ color: TINTA, fontSize: 24, fontWeight: 700, lineHeight: "30px", margin: "16px 0 8px" }}>
      {children}
    </Heading>
  );
}

export function Parrafo({ children, suave = false }: { children: ReactNode; suave?: boolean }) {
  return (
    <Text style={{ color: suave ? TEXTO_MUTED : TINTA_SUAVE, fontSize: suave ? 14 : 15, lineHeight: "22px", margin: "8px 0" }}>
      {children}
    </Text>
  );
}

/** Un dato de la cita: la etiqueta en mayúsculas pequeñas y el valor debajo (DESIGN §2.2). */
export function Dato({ etiqueta, children, codigo = false }: { etiqueta: string; children: ReactNode; codigo?: boolean }) {
  const valor: CSSProperties = codigo
    ? { fontFamily: MONOESPACIADA, fontSize: 16, letterSpacing: "0.04em" }
    : { fontSize: 15 };
  return (
    <Section style={{ margin: "12px 0" }}>
      <Text style={{ color: TEXTO_MUTED, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", lineHeight: "16px", margin: 0, textTransform: "uppercase" }}>
        {etiqueta}
      </Text>
      <Text style={{ color: TINTA, fontWeight: 600, lineHeight: "22px", margin: "2px 0 0", ...valor }}>{children}</Text>
    </Section>
  );
}

/** El botón principal: el acento de fondo y blanco, `tinta` o negro encima, el que dé 4.5:1 (RNF-03; Q-42). */
export function Boton({ marca, href, children }: { marca: Marca; href: string; children: ReactNode }) {
  const acento = acentoDe(marca);
  return (
    <Section style={{ margin: "20px 0 8px" }}>
      <Button
        href={href}
        style={{
          backgroundColor: acento,
          borderRadius: 14,
          color: textoSobre(acento),
          display: "inline-block",
          fontSize: 15,
          fontWeight: 700,
          lineHeight: "20px",
          padding: "14px 22px",
          textAlign: "center",
          textDecoration: "none",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

/** Un enlace secundario, subrayado para no depender del color (RNF-03). */
export function Enlace({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={{ color: TINTA, textDecoration: "underline" }}>
      {children}
    </Link>
  );
}

/** "Cómo llegar": la dirección en Google Maps (D-30). */
export function ComoLlegar({ direccion }: { direccion: string }) {
  return <Enlace href={enlaceMapa(direccion)}>Cómo llegar</Enlace>;
}

const TIPO: Record<Contacto["tipo"], string> = { whatsapp: "WhatsApp", telefono: "Teléfono", correo: "Correo" };

/** El pie con los contactos del negocio (D-29; Q-65: al pie de C-01 a C-04). Sin contactos, solo el nombre. */
export function PieNegocio({ nombre, contactos }: { nombre: string; contactos: readonly Contacto[] }) {
  return (
    <Section>
      <Parrafo suave>
        {contactos.length > 0 ? `¿Dudas? Comunícate con ${nombre}:` : `Este correo lo envía ${nombre}.`}
      </Parrafo>
      {contactos.map((c) => (
        <Text key={`${c.tipo}-${c.valor}`} style={{ color: TINTA_SUAVE, fontSize: 14, lineHeight: "20px", margin: "4px 0" }}>
          {c.etiqueta ?? TIPO[c.tipo]}: <Enlace href={enlaceContacto(c)}>{valorVisible(c)}</Enlace>
        </Text>
      ))}
    </Section>
  );
}
