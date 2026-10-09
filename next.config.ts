import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Da acceso a los bindings de Cloudflare (`getCloudflareContext()`) en `next dev` (ARCH §21.1).
initOpenNextCloudflareForDev();
