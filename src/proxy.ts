import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// En Next.js 16 el middleware se llama proxy (ARCH §7.3). Solo autentica: a qué negocio
// pertenece el usuario y si es admin se verifica de nuevo en cada página, Server Action y ruta.

const esPrivada = createRouteMatcher(["/panel(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (esPrivada(req)) await auth.protect(); // Sin sesión: redirige a NEXT_PUBLIC_CLERK_SIGN_IN_URL (/login)
});

export const config = {
  matcher: [
    // Todo excepto los internos de Next y los archivos estáticos (patrón recomendado por Clerk)
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api)(.*)",
  ],
};
