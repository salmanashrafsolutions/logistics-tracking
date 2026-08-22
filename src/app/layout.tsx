import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { Navigation, MapPin, Gauge, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Vehicle Tracking & Boundary Crossing Test App',
  description: 'High-accuracy live GPS vehicle tracking and Tehsil administrative boundary crossing detection for Pakistan logistics.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#0b0f19',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col antialiased selection:bg-blue-600 selection:text-white">
        {/* Navigation Bar */}
        <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <Navigation className="w-5 h-5 text-white transform -rotate-45" />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight text-white flex items-center gap-2">
                  LogisticX <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">GPS Engine</span>
                </span>
                <p className="text-xs text-slate-400 font-normal">Boundary Crossing & Ingest Testbed</p>
              </div>
            </Link>

            <nav className="flex items-center gap-2 sm:gap-4">
              <Link
                href="/driver"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all border border-transparent hover:border-slate-700"
              >
                <Gauge className="w-4 h-4 text-emerald-400" />
                <span>Driver App</span>
              </Link>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 hover:shadow-blue-600/30 transition-all"
              >
                <MapPin className="w-4 h-4" />
                <span>Live Map & Crossings</span>
              </Link>
            </nav>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p>© {new Date().getFullYear()} LogisticX Telematics — Standardized Vercel & PostGIS Ready</p>
            <div className="flex items-center gap-4 text-slate-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> PostGIS Admin-3 Polygons
              </span>
              <span>•</span>
              <span>GADM / HDX Boundaries</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
