import Link from 'next/link';
import { 
  Smartphone, 
  Map, 
  Layers, 
  ShieldCheck, 
  Zap, 
  ArrowRight, 
  Compass, 
  Activity, 
  PlayCircle,
  Database,
  CheckCircle2
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-between">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-12 lg:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        {/* Background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none -z-10" />

        <div className="text-center max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Standalone Testbed for LogisticX Telematics</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Vehicle Tracking & <br />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">
              Tehsil Boundary Detection
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto font-normal">
            Validating high-accuracy driver GPS streaming, point-in-polygon sub-district (Tehsil) reverse geocoding, and real-time administrative boundary crossing triggers before production deployment.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/driver"
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/35 transition-all group"
            >
              <Smartphone className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span>Launch Driver Tracker (Phone PWA)</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href="/dashboard"
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 hover:border-slate-600 shadow-md transition-all group"
            >
              <Map className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
              <span>Open Live Map & Event Log</span>
            </Link>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4">
              <Compass className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">High-Accuracy GPS Ingest</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Throttled GPS streaming with Wake Lock API, distance filtering, and battery status capture. Designed for minimal battery drain.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Tehsil Boundary Detection</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              PostGIS spatial point-in-polygon queries against Pakistan admin-3 boundary polygons (GADM/HDX). Instant sub-district resolution.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Anti-Flicker Crossings</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Automated crossing event logging when moving across borders (e.g. Lahore Cantt → Model Town → Kasur) with hysteresis filtering.
            </p>
          </div>
        </div>

        {/* Built-in Route Simulator Highlight */}
        <div className="mt-12 p-8 rounded-2xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-slate-900/60 border border-blue-800/40 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
              <PlayCircle className="w-4 h-4" />
              <span>Interactive GPS Simulator Included</span>
            </div>
            <h4 className="text-xl font-bold text-white">Test Crossings Without Physical Driving</h4>
            <p className="text-sm text-slate-400 max-w-xl">
              Use our pre-configured route simulator to test boundary transitions across Lahore, Kasur, Rawalpindi, and Islamabad directly from the live map dashboard.
            </p>
          </div>
          <Link
            href="/dashboard?simulator=open"
            className="whitespace-nowrap px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-md shadow-blue-600/25 transition-all flex items-center gap-2"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Try Route Simulator</span>
          </Link>
        </div>

        {/* Deployment & Architecture Checklist */}
        <div className="mt-12 p-6 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
          <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>Architecture & Standardized Deployment Checklist</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Next.js 14 App Router + Vercel Ready</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>PostGIS ST_Contains Queries</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Offline / GeoJSON Fallback</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>TypeScript Strict Type Safety</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
