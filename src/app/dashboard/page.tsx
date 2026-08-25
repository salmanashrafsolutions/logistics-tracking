'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { 
  MapPin, 
  Layers, 
  Activity, 
  RefreshCw, 
  ArrowRight, 
  Compass, 
  PlayCircle, 
  ShieldAlert, 
  Truck,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { Vehicle, RawPing, BoundaryCrossing } from '@/lib/types';
import RouteSimulator from '@/components/RouteSimulator';

// Dynamic import for Leaflet LiveMap to disable SSR
const LiveMap = dynamic(() => import('@/components/LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[550px] sm:h-[650px] rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-3">
      <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      <span className="text-sm font-medium">Loading Pakistan Tehsil Spatial Map...</span>
    </div>
  ),
});

export default function DashboardPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('v-truck-12');
  const [pings, setPings] = useState<RawPing[]>([]);
  const [crossings, setCrossings] = useState<BoundaryCrossing[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [showSimulator, setShowSimulator] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'crossings' | 'pings'>('crossings');

  // Load cached vehicle pings and crossings from localStorage
  useEffect(() => {
    if (!selectedVehicleId || typeof window === 'undefined') return;
    try {
      const cachedPings = localStorage.getItem(`logisticx_pings_${selectedVehicleId}`);
      if (cachedPings) {
        const parsed = JSON.parse(cachedPings);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPings(parsed);
        }
      }
      const cachedCrossings = localStorage.getItem(`logisticx_crossings_${selectedVehicleId}`);
      if (cachedCrossings) {
        const parsed = JSON.parse(cachedCrossings);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCrossings(parsed);
        }
      }
    } catch {
      // ignore localStorage parse errors
    }
  }, [selectedVehicleId]);

  // Load vehicles
  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch('/api/vehicles');
      const data = await res.json();
      if (data.vehicles && data.vehicles.length > 0) {
        setVehicles((prev) => {
          const map = new Map<string, Vehicle>();
          prev.forEach((v) => map.set(v.id, v));
          data.vehicles.forEach((v: Vehicle) => map.set(v.id, v));
          return Array.from(map.values());
        });
        if (!selectedVehicleId) {
          setSelectedVehicleId(data.vehicles[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching vehicles:', err);
    }
  }, [selectedVehicleId]);

  // Load vehicle pings and crossings with resilient deduplication & merge
  const fetchVehicleData = useCallback(async (vehicleId: string) => {
    if (!vehicleId) return;
    try {
      const [pingsRes, crossingsRes] = await Promise.all([
        fetch(`/api/tracking/ping?vehicle_id=${vehicleId}&limit=100`),
        fetch(`/api/crossings?vehicle_id=${vehicleId}&limit=50`),
      ]);

      const pingsData = await pingsRes.json();
      const crossingsData = await crossingsRes.json();

      if (pingsData.pings && Array.isArray(pingsData.pings) && pingsData.pings.length > 0) {
        setPings((prevPings) => {
          const map = new Map<string, RawPing>();
          prevPings.forEach((p) => {
            const key = p.id ? `id_${p.id}` : `${p.lat.toFixed(6)}_${p.lng.toFixed(6)}_${p.recorded_at}`;
            map.set(key, p);
          });
          pingsData.pings.forEach((p: RawPing) => {
            const key = p.id ? `id_${p.id}` : `${p.lat.toFixed(6)}_${p.lng.toFixed(6)}_${p.recorded_at}`;
            map.set(key, p);
          });
          const merged = Array.from(map.values()).sort(
            (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
          );
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(`logisticx_pings_${vehicleId}`, JSON.stringify(merged.slice(-200)));
            } catch {}
          }
          return merged;
        });
      }

      if (crossingsData.crossings && Array.isArray(crossingsData.crossings) && crossingsData.crossings.length > 0) {
        setCrossings((prevCrossings) => {
          const map = new Map<string, BoundaryCrossing>();
          prevCrossings.forEach((c) => {
            const key = c.id ? `id_${c.id}` : `${c.vehicle_id}_${c.from_tehsil}_${c.to_tehsil}_${c.crossed_at}`;
            map.set(key, c);
          });
          crossingsData.crossings.forEach((c: BoundaryCrossing) => {
            const key = c.id ? `id_${c.id}` : `${c.vehicle_id}_${c.from_tehsil}_${c.to_tehsil}_${c.crossed_at}`;
            map.set(key, c);
          });
          const merged = Array.from(map.values()).sort(
            (a, b) => new Date(b.crossed_at).getTime() - new Date(a.crossed_at).getTime()
          );
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(`logisticx_crossings_${vehicleId}`, JSON.stringify(merged.slice(-100)));
            } catch {}
          }
          return merged;
        });
      }
    } catch (err) {
      console.error('Error loading vehicle telemetry:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  useEffect(() => {
    if (selectedVehicleId) {
      fetchVehicleData(selectedVehicleId);
    }
  }, [selectedVehicleId, fetchVehicleData]);

  // Polling interval for live map updates
  useEffect(() => {
    if (!autoRefresh || !selectedVehicleId) return;

    const interval = setInterval(() => {
      fetchVehicleData(selectedVehicleId);
      fetchVehicles();
    }, 3000);

    return () => clearInterval(interval);
  }, [autoRefresh, selectedVehicleId, fetchVehicleData, fetchVehicles]);

  const currentVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const latestPing = pings[pings.length - 1];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Top Controls & Vehicle Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Live Fleet Map & Boundary Crossing Log
            </h1>
            <p className="text-xs text-slate-400">
              Visualizing point-in-polygon Tehsil transitions & breadcrumb history
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Vehicle Dropdown */}
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 font-medium">Vehicle:</span>
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="bg-transparent text-sm text-white font-semibold focus:outline-none cursor-pointer"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id} className="bg-slate-900 text-white">
                  {v.label} {v.plate_number ? `(${v.plate_number})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Simulator Toggle */}
          <button
            type="button"
            onClick={() => setShowSimulator(!showSimulator)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md transition-all ${
              showSimulator
                ? 'bg-blue-600 text-white shadow-blue-600/25'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            <PlayCircle className="w-4 h-4 text-emerald-400" />
            <span>{showSimulator ? 'Hide Simulator' : 'Open Route Simulator'}</span>
          </button>

          {/* Auto Refresh Toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-2 rounded-xl border text-xs font-medium transition-all ${
              autoRefresh
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title={autoRefresh ? 'Live Polling Active (3s)' : 'Polling Paused'}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400 font-medium">Current Tehsil</span>
          <div className="text-xl font-bold text-white mt-1">
            {currentVehicle?.current_tehsil || 'Detecting...'}
          </div>
          <span className="text-[11px] text-slate-500">
            District: {currentVehicle?.current_district || '—'}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400 font-medium">Boundary Crossings</span>
          <div className="text-xl font-bold text-amber-400 mt-1">
            {crossings.length}
          </div>
          <span className="text-[11px] text-slate-500">Recorded transitions</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400 font-medium">Total Pings</span>
          <div className="text-xl font-bold text-blue-400 mt-1">
            {pings.length}
          </div>
          <span className="text-[11px] text-slate-500">Breadcrumbs in track</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400 font-medium">Last Location</span>
          <div className="text-sm font-mono font-semibold text-slate-200 mt-1 truncate">
            {latestPing ? `${latestPing.lat.toFixed(4)}, ${latestPing.lng.toFixed(4)}` : 'Waiting...'}
          </div>
          <span className="text-[11px] text-slate-500">
            {latestPing ? new Date(latestPing.recorded_at).toLocaleTimeString() : 'No data'}
          </span>
        </div>
      </div>

      {/* Simulator Drawer if opened */}
      {showSimulator && (
        <div className="transition-all animate-fadeIn">
          <RouteSimulator
            vehicleId={selectedVehicleId}
            onPingSent={() => {
              fetchVehicleData(selectedVehicleId);
              fetchVehicles();
            }}
          />
        </div>
      )}

      {/* Interactive Map */}
      <div className="relative">
        <LiveMap
          vehicleId={selectedVehicleId}
          vehicleLabel={currentVehicle?.label}
          currentTehsil={currentVehicle?.current_tehsil}
          pings={pings}
          crossings={crossings}
          showBoundaries={true}
          onLocationFound={async (lat, lng, accuracy) => {
            try {
              await fetch('/api/tracking/ping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  vehicle_id: selectedVehicleId,
                  lat,
                  lng,
                  accuracy_m: accuracy,
                  timestamp: new Date().toISOString()
                })
              });
              fetchVehicleData(selectedVehicleId);
              fetchVehicles();
            } catch (err) {
              console.error('Failed to ingest found location:', err);
            }
          }}
        />
      </div>

      {/* Telemetry Tabs: Boundary Crossings & Raw Pings Table */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('crossings')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'crossings'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Boundary Crossings ({crossings.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pings')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'pings'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Raw Ingest Pings ({pings.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {(pings.length > 0 || crossings.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setPings([]);
                  setCrossings([]);
                  if (typeof window !== 'undefined' && selectedVehicleId) {
                    try {
                      localStorage.removeItem(`logisticx_pings_${selectedVehicleId}`);
                      localStorage.removeItem(`logisticx_crossings_${selectedVehicleId}`);
                    } catch {}
                  }
                }}
                className="text-xs text-slate-500 hover:text-rose-400 transition-colors px-2 py-1 rounded-lg hover:bg-rose-500/10"
              >
                Clear History
              </button>
            )}
          </div>
        </div>

        {/* Crossings Feed */}
        {activeTab === 'crossings' && (
          <div className="space-y-3">
            {crossings.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm space-y-2">
                <Compass className="w-8 h-8 mx-auto text-slate-600" />
                <p>No boundary crossings recorded for this vehicle yet.</p>
                <p className="text-xs text-slate-600">
                  Drive across Tehsil boundaries or launch the Route Simulator to trigger crossings.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                {crossings.map((c, idx) => (
                  <div
                    key={c.id || idx}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                        <ShieldAlert className="w-4 h-4" />
                        <span>Crossing Event #{crossings.length - idx}</span>
                      </span>
                      <span>{new Date(c.crossed_at).toLocaleTimeString()}</span>
                    </div>

                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <span className="text-slate-400">{c.from_tehsil || 'Initial Entry'}</span>
                      <ArrowRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <span className="text-emerald-400">{c.to_tehsil}</span>
                    </div>

                    <div className="text-xs text-slate-500 font-mono flex items-center justify-between">
                      <span>Coords: {c.lat.toFixed(5)}, {c.lng.toFixed(5)}</span>
                      <span>District: {c.to_district || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Raw Pings History Table */}
        {activeTab === 'pings' && (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Latitude</th>
                  <th className="py-2.5 px-3">Longitude</th>
                  <th className="py-2.5 px-3">Accuracy</th>
                  <th className="py-2.5 px-3">Speed</th>
                  <th className="py-2.5 px-3">Battery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {pings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-slate-500">
                      No location pings recorded yet.
                    </td>
                  </tr>
                ) : (
                  [...pings].reverse().map((p, idx) => (
                    <tr key={p.id || idx} className="hover:bg-slate-800/40 text-slate-300">
                      <td className="py-2 px-3 text-slate-400">{new Date(p.recorded_at).toLocaleTimeString()}</td>
                      <td className="py-2 px-3">{p.lat.toFixed(6)}</td>
                      <td className="py-2 px-3">{p.lng.toFixed(6)}</td>
                      <td className="py-2 px-3 text-emerald-400">±{Math.round(p.accuracy_m || 0)}m</td>
                      <td className="py-2 px-3">{p.speed !== null && p.speed !== undefined ? `${Math.round(p.speed)} km/h` : '—'}</td>
                      <td className="py-2 px-3">{p.battery_level !== null && p.battery_level !== undefined ? `${Math.round(p.battery_level * 100)}%` : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
