import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f97316" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL('https://elitepronospro.vercel.app'),
  title: "Steo Élite Predictor - Pronostics Sportifs Intelligents",
  description: "Application de pronostics sportifs avec analyses statistiques en temps réel. Football, NBA, NFL, NHL.",
  keywords: ["pronostics", "paris sportifs", "football", "NBA", "NFL", "NHL", "prédictions"],
  authors: [{ name: "Steo Élite" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Steo Élite",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "Steo Élite Predictor",
    title: "Steo Élite - Pronostics Sportifs Intelligents",
    description: "Application de pronostics sportifs avec analyses statistiques en temps réel",
    images: [
      {
        url: "/icons/icon-512x512.png",
        width: 512,
        height: 512,
        alt: "Steo Élite Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Steo Élite - Pronostics Sportifs",
    description: "Application de pronostics sportifs avec analyses statistiques",
    images: ["/icons/icon-512x512.png"],
  },
  other: {
    "build-version": "20260331-v2-forex-removed",
    "app-type": "pronostics",
    "cache-bust": Date.now().toString(),
  },
};

// Service Worker Registration Script
const SW_REGISTER = `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Clear old caches on first load
      if (caches) {
        caches.keys().then((names) => {
          names.forEach((name) => {
            if (!name.includes('v5')) {
              console.log('Clearing old cache:', name);
              caches.delete(name);
            }
          });
        });
      }

      navigator.serviceWorker.register('/sw.js?v=5')
        .then((registration) => {
          console.log('SW v5 registered');
          
          // Force immediate update
          registration.update();
          
          // Listen for new version
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // Show update notification
                  if (confirm('🔄 Nouvelle version disponible! Mettre à jour?')) {
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                  }
                }
              });
            }
          });
        })
        .catch((error) => {
          console.log('SW registration failed:', error);
        });
      
      // Listen for force reload from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'FORCE_RELOAD') {
          console.log('Force reload requested');
          window.location.reload();
        }
      });
      
      // Auto reload on controller change
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
      
      // Background ML update (every 30 minutes)
      const updateMLResults = () => {
        fetch('/api/ml/update-results')
          .then(res => res.json())
          .then(data => console.log('ML update:', data.message))
          .catch(e => console.log('ML update error:', e));
      };
      
      // Run once on load
      setTimeout(updateMLResults, 5000);
      
      // Then every 30 minutes
      setInterval(updateMLResults, 30 * 60 * 1000);
    });
  }
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <head>
        {/* PWA Meta Tags */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="Steo Élite" />
        <meta name="apple-mobile-web-app-title" content="Steo Élite" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="msapplication-TileColor" content="#f97316" />
        <meta name="msapplication-tap-highlight" content="no" />
        
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png" />
        
        {/* Favicon */}
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16x16.png" />
        
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        
        {/* Theme Color for Address Bar */}
        <meta name="theme-color" content="#0a0a0a" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
        </Providers>
        
        {/* Service Worker Registration */}
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER }} />
      </body>
    </html>
  );
}
// v1774226431
