'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward, Navigation2, CheckCircle2, AlertCircle, Compass } from 'lucide-react';
import { PingResponse } from '@/lib/types';

interface RouteWayPoint {
  lat: number;
  lng: number;
  expectedTehsil: string;
  note?: string;
}

interface SimulatedRoute {
  id: string;
  name: string;
  description: string;
  waypoints: RouteWayPoint[];
}

// Preconfigured Pakistan routes crossing distinct Tehsil boundaries
const PRESET_ROUTES: SimulatedRoute[] = [
  {
    id: 'lhr-kasur',
    name: 'Lahore Cantt ➔ Model Town ➔ Raiwind ➔ Kasur',
    description: 'Multi-tehsil inter-district route from Lahore DHA to Kasur city border.',
    waypoints: [
      { lat: 31.5150, lng: 74.4100, expectedTehsil: 'Lahore Cantt', note: 'Start: DHA Lahore' },
      { lat: 31.5000, lng: 74.3900, expectedTehsil: 'Lahore Cantt', note: 'Walton Road' },
      { lat: 31.4850, lng: 74.3500, expectedTehsil: 'Model Town', note: 'Cross into Model Town (Ferozepur Rd)' },
      { lat: 31.4600, lng: 74.3300, expectedTehsil: 'Model Town', note: 'Township Sector' },
      { lat: 31.3900, lng: 74.2700, expectedTehsil: 'Raiwind', note: 'Cross into Raiwind (Valencia/Lake City)' },
      { lat: 31.2800, lng: 74.2400, expectedTehsil: 'Raiwind', note: 'Raiwind Bypass' },
      { lat: 31.1800, lng: 74.3800, expectedTehsil: 'Kasur', note: 'Cross into Kasur District (Mustafabad)' },
      { lat: 31.1150, lng: 74.4500, expectedTehsil: 'Kasur', note: 'Finish: Kasur City Center' },
    ]
  },
  {
    id: 'rwp-isb-mre',
    name: 'Rawalpindi ➔ Islamabad Capital ➔ Murree Hills',
    description: 'Capital boundary transition from Rawalpindi Cantt into Islamabad ICT then Murree.',
    waypoints: [
      { lat: 33.5200, lng: 73.0500, expectedTehsil: 'Rawalpindi', note: 'Start: Rawalpindi Sadar' },
      { lat: 33.5800, lng: 73.0600, expectedTehsil: 'Rawalpindi', note: 'Faizabad Interchange' },
      { lat: 33.6800, lng: 73.0700, expectedTehsil: 'Islamabad', note: 'Cross into Islamabad (Blue Area/F-8)' },
      { lat: 33.7400, lng: 73.1500, expectedTehsil: 'Islamabad', note: 'Murree Road / Lake View' },
      { lat: 33.8800, lng: 73.3800, expectedTehsil: 'Murree', note: 'Cross into Murree Hills (Ghora Gali)' },
      { lat: 33.9100, lng: 73.4000, expectedTehsil: 'Murree', note: 'Finish: Murree Mall Road' },
    ]
  },
  {
    id: 'lhr-fzr',
    name: 'Lahore City ➔ Shalimar ➔ Ferozewala',
    description: 'Northern Lahore crossing GT Road into Sheikhupura district.',
    waypoints: [
      { lat: 31.5600, lng: 74.3100, expectedTehsil: 'Lahore City', note: 'Start: Lahore Fort / Circular Rd' },
      { lat: 31.5800, lng: 74.3700, expectedTehsil: 'Shalimar', note: 'Cross into Shalimar (Baghbanpura)' },
      { lat: 31.6200, lng: 74.3900, expectedTehsil: 'Shalimar', note: 'GT Road toward Ravi' },
      { lat: 31.6600, lng: 74.2800, expectedTehsil: 'Ferozewala', note: 'Cross into Sheikhupura (Shahdara/Ferozewala)' },
    ]
  }
];

interface RouteSimulatorProps {
  vehicleId: string;
  onPingSent?: (response: PingResponse) => void;
}

export default function RouteSimulator({ vehicleId, onPingSent }: RouteSimulatorProps) {
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [lastResponse, setLastResponse] = useState<PingResponse | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);

  const activeRoute = PRESET_ROUTES[selectedRouteIndex];
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Send a specific waypoint ping
  const sendWaypointPing = async (stepIndex: number) => {
    if (stepIndex >= activeRoute.waypoints.length) {
      setIsPlaying(false);
      return;
    }

    const wp = activeRoute.waypoints[stepIndex];
    setIsSending(true);

    try {
      const payload = {
        vehicle_id: vehicleId,
        lat: wp.lat + (Math.random() - 0.5) * 0.0005, // tiny natural jitter
        lng: wp.lng + (Math.random() - 0.5) * 0.0005,
        accuracy_m: 8.5,
        speed: 45.0,
        heading: 180,
        battery_level: 0.85,
        timestamp: new Date().toISOString()
      };

      const res = await fetch('/api/tracking/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data: PingResponse = await res.json();
      setLastResponse(data);
      if (onPingSent) {
        onPingSent(data);
      }
    } catch (e) {
      console.error('Simulator ping error:', e);
    } finally {
      setIsSending(false);
    }
  };

  // Playback timer
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const intervalMs = Math.max(1000, 3000 / speedMultiplier);

    timerRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        const next = prev + 1;
        if (next >= activeRoute.waypoints.length) {
          setIsPlaying(false);
          return prev;
        }
        sendWaypointPing(next);
        return next;
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speedMultiplier, activeRoute, vehicleId]);

  const handleStartPlay = () => {
    if (currentStep >= activeRoute.waypoints.length - 1) {
      setCurrentStep(0);
      sendWaypointPing(0);
    } else {
      sendWaypointPing(currentStep);
    }
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStep(0);
    setLastResponse(null);
  };

  const handleStepForward = () => {
    if (currentStep < activeRoute.waypoints.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      sendWaypointPing(next);
    }
  };

  return (
    <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Compass className="w-5 h-5 text-blue-400" />
            <span>Interactive GPS Route Simulator</span>
          </h3>
          <p className="text-xs text-slate-400">
            Inject synthetic GPS pings to verify Tehsil boundary crossing events in real-time.
          </p>
        </div>

        {/* Speed Multiplier */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          {[1, 2, 5].map((multiplier) => (
            <button
              key={multiplier}
              type="button"
              onClick={() => setSpeedMultiplier(multiplier)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                speedMultiplier === multiplier
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {multiplier}x
            </button>
          ))}
        </div>
      </div>

      {/* Route Selector */}
      <div className="space-y-1.5">
        <label className="text-xs text-slate-400 font-medium">Select Preset Test Route:</label>
        <select
          value={selectedRouteIndex}
          onChange={(e) => {
            setSelectedRouteIndex(Number(e.target.value));
            handleReset();
          }}
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-medium focus:outline-none focus:border-blue-500"
        >
          {PRESET_ROUTES.map((route, idx) => (
            <option key={route.id} value={idx}>
              {route.name} ({route.waypoints.length} waypoints)
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 italic">{activeRoute.description}</p>
      </div>

      {/* Progress & Controls */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-2">
          {!isPlaying ? (
            <button
              type="button"
              onClick={handleStartPlay}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{currentStep > 0 ? 'Resume' : 'Start Simulation'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePause}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md shadow-amber-600/20 transition-all"
            >
              <Pause className="w-4 h-4 fill-current" />
              <span>Pause</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleStepForward}
            disabled={isPlaying || currentStep >= activeRoute.waypoints.length - 1}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-medium border border-slate-700 transition-all"
            title="Step 1 waypoint forward"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>Step</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition-all"
            title="Reset to beginning"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Waypoint: <strong>{currentStep + 1}</strong> / {activeRoute.waypoints.length}
        </div>
      </div>

      {/* Waypoint Steps Visualizer */}
      <div className="space-y-1.5 pt-2">
        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
          <div
            className="bg-blue-500 h-full transition-all duration-300 rounded-full"
            style={{
              width: `${((currentStep + 1) / activeRoute.waypoints.length) * 100}%`,
            }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Active: {activeRoute.waypoints[currentStep]?.note || 'Ready'}</span>
          <span className="text-blue-400 font-semibold">
            Tehsil: {activeRoute.waypoints[currentStep]?.expectedTehsil}
          </span>
        </div>
      </div>

      {/* Server Ping Response Feedback */}
      {lastResponse && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 transition-all ${
            lastResponse.crossing_detected
              ? 'bg-blue-950/80 border-blue-500 text-blue-200 animate-pulse'
              : 'bg-slate-950 border-slate-800 text-slate-300'
          }`}
        >
          {lastResponse.crossing_detected ? (
            <Navigation2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            <div className="font-semibold text-white">
              {lastResponse.crossing_detected ? '⚡ Boundary Crossing Triggered!' : 'Location Ping Ingested'}
            </div>
            <div className="text-slate-400">
              Resolved: <strong className="text-emerald-400">{lastResponse.current_tehsil}</strong> ({lastResponse.current_district})
            </div>
            {lastResponse.crossing && (
              <div className="text-blue-300 font-medium text-[11px]">
                Transition: {lastResponse.crossing.from_tehsil || 'Origin'} ➔ {lastResponse.crossing.to_tehsil}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
