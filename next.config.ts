import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Utiliser standalone pour éviter les problèmes de prérendu
  output: 'standalone',
  // Désactiver le cache statique pour forcer le re-render
  generateEtags: false,
  // Désactiver le React Compiler qui cause des erreurs
  experimental: {
    reactCompiler: false,
    optimizePackageImports: ['next-themes', 'lucide-react'],
  },
  // Ignorer les erreurs ESLint pendant le build
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Headers de sécurité et cache
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Sécurité - Protection contre le clickjacking
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          // Sécurité - Prévention du MIME type sniffing
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Sécurité - Protection XSS
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          // Sécurité - Politique de référer
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Sécurité - Permissions du navigateur
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Cache
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          // Sécurité API
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Cache désactivé pour l'API
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
