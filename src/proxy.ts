import { clerkMiddleware } from "@clerk/nextjs/server";

// En Next.js 16 el middleware se llama proxy (ARCH §7.3). Solo autentica: a qué negocio
// pertenece el usuario y si es admin se verifica de nuevo en cada página, Server Action
// y ruta (requireMiembro y requireSuperadmin), que son la defensa real.
//
// Sin `createRouteMatcher`, que Clerk 7 marca como obsoleto porque comparar rutas puede
// diferir de cómo Next las resuelve. Aquí la comparación es solo una comodidad: lleva a
// /login a quien llega sin sesión, en lugar del 404 de requireSuperadmin en /admin.
const RUTA_PRIVADA = /^\/(panel|admin)(\/|$)/;

export default clerkMiddleware(async (auth, req) => {
  if (RUTA_PRIVADA.test(req.nextUrl.pathname)) await auth.protect(); // Sin sesión: redirige a NEXT_PUBLIC_CLERK_SIGN_IN_URL (/login)
});

// Solo las rutas que usan Clerk (Q-51 de TASKS-04): el panel, el admin y las páginas de
// ingreso, con sus Server Actions, que son POST a la misma ruta. La página pública
// (`/{slug}`), su política y la API no pasan por Clerk: así no hacen la redirección de
// "handshake" a su dominio, que en cada primera visita sumaba tres viajes y la mitad del
// LCP (RNF-01; ARCH §7.2). Ninguna de esas rutas llama a `auth()`.
export const config = {
  matcher: ["/panel/:path*", "/admin/:path*", "/login/:path*", "/registro/:path*", "/sin-acceso"],
};
