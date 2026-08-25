'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Navigation, 
  Play, 
  Square, 
  Smartphone, 
  Battery, 
  BatteryCharging, 
  Radio, 
  MapPin, 
  Compass, 
  Sliders, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw,
  Sun,
  Activity,
  ArrowRight,
  ShieldAlert,
  Globe,
  MapPinOff
} from 'lucide-react';
import { Vehicle, PingResponse } from '@/lib/types';

interface PingLogItem {
  id: string;
  time: string;
  lat: number;
  lng: number;
  accuracy: number;
  tehsil: string | null;
  status: 'success' | 'error';
  crossing: boolean;
  message?: string;
}

export default function DriverPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('v-truck-12');
  const [customVehicleName, setCustomVehicleName] = useState<string>('');
  const [showAddVehicle, setShowAddVehicle] = useState(false);

  // Security & context check
  const [isInsecureContext, setIsInsecureContext] = useState<boolean>(false);
  const [permissionStatus, setPermissionStatus] = useState<string>('prompt');

  // Tracking state
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [backgroundAudioActive, setBackgroundAudioActive] = useState<boolean>(false);
  const [enableBackgroundKeepAlive, setEnableBackgroundKeepAlive] = useState<boolean>(true);

  // Current Geolocation reading
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);

  // Resolved Tehsil & crossing state
  const [currentTehsil, setCurrentTehsil] = useState<string | null>(null);
  const [currentDistrict, setCurrentDistrict] = useState<string | null>(null);
  const [lastCrossingAlert, setLastCrossingAlert] = useState<{
    from: string | null;
    to: string;
    time: string;
  } | null>(null);

  // Settings & Throttling
  const [pingIntervalSeconds, setPingIntervalSeconds] = useState<number>(10);
  const [minDistanceMeters, setMinDistanceMeters] = useState<number>(20);
  const [highAccuracy, setHighAccuracy] = useState<boolean>(true);

  // Ping statistics and log
  const [stats, setStats] = useState({ sent: 0, successful: 0, failed: 0 });
  const [pingLogs, setPingLogs] = useState<PingLogItem[]>([]);

  // Refs for tracking throttle & background handlers
  const lastPingTimeRef = useRef<number>(0);
  const lastPingCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const wakeLockRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioOscillatorRef = useRef<OscillatorNode | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const isTrackingRef = useRef<boolean>(false);

  // Keep isTrackingRef synchronized
  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

  // Visibility change auto-reacquire WakeLock and resume location query
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isTrackingRef.current) {
        requestWakeLock();
        triggerLocationPrompt();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Detect insecure context on mobile
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!window.isSecureContext && !isLocalhost) {
        setIsInsecureContext(true);
      }

      // Check permission if query API supported
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' as PermissionName })
          .then((res) => {
            setPermissionStatus(res.state);
            res.onchange = () => setPermissionStatus(res.state);
          })
          .catch(() => {});
      }
    }
  }, []);

  // URL Params auto-selection for WhatsApp 1-Click Dispatch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const vParam = params.get('v') || params.get('vehicle_id');
      const dParam = params.get('driver') || params.get('d');
      const pParam = params.get('plate');
      
      if (vParam) {
        setSelectedVehicleId(vParam);
        // Ensure vehicle is registered on server
        fetch('/api/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: vParam,
            label: dParam ? `Truck (${dParam})` : `Truck ${vParam}`,
            driver_name: dParam || undefined,
            plate_number: pParam || undefined
          })
        })
          .then(res => res.json())
          .then(data => {
            if (data.vehicle) {
              setVehicles(prev => [data.vehicle, ...prev.filter(v => v.id !== data.vehicle.id)]);
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  // Offline queue auto-flush on internet reconnection
  const flushOfflineQueue = async () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('logisticx_offline_pings');
      if (!stored) return;
      const queuedPings = JSON.parse(stored);
      if (!Array.isArray(queuedPings) || queuedPings.length === 0) return;

      for (const payload of queuedPings) {
        await fetch('/api/tracking/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      localStorage.removeItem('logisticx_offline_pings');
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    window.addEventListener('online', flushOfflineQueue);
    return () => window.removeEventListener('online', flushOfflineQueue);
  }, []);

  // Fetch registered vehicles
  useEffect(() => {
    fetchVehicles();
    initBattery();
    flushOfflineQueue();
  }, []);

  const fetchVehicles = async () => {
    try {
      const res = await fetch('/api/vehicles');
      const data = await res.json();
      if (data.vehicles && data.vehicles.length > 0) {
        setVehicles(data.vehicles);
        if (!selectedVehicleId) {
          setSelectedVehicleId(data.vehicles[0].id);
        }
      }
    } catch (e) {
      console.error('Error fetching vehicles:', e);
    }
  };

  const initBattery = async () => {
    try {
      // @ts-expect-error Battery API
      if (navigator.getBattery) {
        // @ts-expect-error Battery API
        const battery = await navigator.getBattery();
        setBatteryLevel(Math.round(battery.level * 100));
        setIsCharging(battery.charging);

        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
        battery.addEventListener('chargingchange', () => {
          setIsCharging(battery.charging);
        });
      }
    } catch {
      // Battery API not supported
    }
  };

  // Screen Wake Lock API management
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener('release', () => {
          setWakeLockActive(false);
        });
      }
    } catch (err) {
      console.warn('Wake Lock error:', err);
      setWakeLockActive(false);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  // Distance calculation helper (Haversine formula in meters)
  const calculateDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  // Ingest location ping to server
  const sendLocationPing = async (pos: GeolocationPosition) => {
    const now = Date.now();
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    const speed = pos.coords.speed;
    const heading = pos.coords.heading;

    // Check throttle rules: time interval and distance threshold
    const timeSinceLastPing = (now - lastPingTimeRef.current) / 1000;
    let distanceMoved = 9999;
    if (lastPingCoordsRef.current) {
      distanceMoved = calculateDistanceMeters(
        lastPingCoordsRef.current.lat,
        lastPingCoordsRef.current.lng,
        lat,
        lng
      );
    }

    const shouldSend = !lastPingCoordsRef.current || 
                       timeSinceLastPing >= pingIntervalSeconds || 
                       distanceMoved >= minDistanceMeters;

    if (!shouldSend) {
      return;
    }

    lastPingTimeRef.current = now;
    lastPingCoordsRef.current = { lat, lng };

    setStats(prev => ({ ...prev, sent: prev.sent + 1 }));

    try {
      const payload = {
        vehicle_id: selectedVehicleId,
        lat,
        lng,
        accuracy_m: accuracy,
        speed: speed !== null && speed !== undefined ? speed * 3.6 : null, // km/h
        heading: heading !== null && heading !== undefined ? heading : null,
        battery_level: batteryLevel !== null ? batteryLevel / 100 : null,
        timestamp: new Date(pos.timestamp).toISOString()
      };

      const res = await fetch('/api/tracking/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data: PingResponse = await res.json();

      setStats(prev => ({ ...prev, successful: prev.successful + 1 }));
      if (data.current_tehsil) {
        setCurrentTehsil(data.current_tehsil);
      }
      if (data.current_district) {
        setCurrentDistrict(data.current_district);
      }

      if (data.crossing_detected && data.crossing) {
        setLastCrossingAlert({
          from: data.crossing.from_tehsil,
          to: data.crossing.to_tehsil,
          time: new Date().toLocaleTimeString()
        });
      }

      // Append to local log
      const logEntry: PingLogItem = {
        id: Math.random().toString(36).substring(2, 9),
        time: new Date().toLocaleTimeString(),
        lat,
        lng,
        accuracy,
        tehsil: data.current_tehsil,
        status: 'success',
        crossing: data.crossing_detected,
        message: data.message
      };
      setPingLogs(prev => [logEntry, ...prev.slice(0, 49)]);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ping transmission failed';
      setStats(prev => ({ ...prev, failed: prev.failed + 1 }));
      const logEntry: PingLogItem = {
        id: Math.random().toString(36).substring(2, 9),
        time: new Date().toLocaleTimeString(),
        lat,
        lng,
        accuracy,
        tehsil: null,
        status: 'error',
        crossing: false,
        message: msg
      };
      setPingLogs(prev => [logEntry, ...prev.slice(0, 49)]);
    }
  };

  // Immediate Single-Shot Location Request (Triggers Permission Dialog)
  const triggerLocationPrompt = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser.');
      return;
    }

    setIsLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        setCurrentPosition(position);
        setGpsError(null);
        sendLocationPing(position);
      },
      (error) => {
        setIsLocating(false);
        console.warn('High accuracy error, retrying standard accuracy...', error);
        // Retry with low accuracy (common fix for indoor GPS timeouts)
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setCurrentPosition(position);
            setGpsError(null);
            sendLocationPing(position);
          },
          (fallbackErr) => {
            let detail = fallbackErr.message;
            if (fallbackErr.code === 1) {
              detail = 'Location Permission Denied. Please enable GPS in your browser or phone Settings.';
            } else if (fallbackErr.code === 2) {
              detail = 'Position Unavailable. Ensure phone GPS/Location service is turned ON.';
            } else if (fallbackErr.code === 3) {
              detail = 'GPS Timeout. Try stepping outside or moving near a window.';
            }
            setGpsError(detail);
          },
          { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // HUD Dimmer Mode (AMOLED Screen Blackout to track without battery drain)
  const [isHudMode, setIsHudMode] = useState<boolean>(false);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Start background audio keep-alive (HTML5 Audio Loop + MediaSession)
  const startBackgroundAudio = () => {
    try {
      if (!silentAudioRef.current) {
        const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        audio.loop = true;
        audio.volume = 0.05;
        silentAudioRef.current = audio;
      }
      silentAudioRef.current.play()
        .then(() => {
          setBackgroundAudioActive(true);
        })
        .catch((e) => {
          console.warn('Silent audio playback prevented:', e);
        });

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'LogisticX Driver GPS Active',
          artist: 'Live Telematics Stream',
          album: 'Boundary Detection Engine',
        });
        navigator.mediaSession.playbackState = 'playing';
      }
    } catch (e) {
      console.warn('Background audio keep-alive could not be initialized:', e);
    }
  };

  const stopBackgroundAudio = () => {
    try {
      if (silentAudioRef.current) {
        silentAudioRef.current.pause();
        silentAudioRef.current = null;
      }
      if (audioOscillatorRef.current) {
        audioOscillatorRef.current.stop();
        audioOscillatorRef.current.disconnect();
        audioOscillatorRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
      }
      setBackgroundAudioActive(false);
    } catch (e) {
      console.warn('Error stopping background audio:', e);
    }
  };

  // Dedicated Web Worker timer for reliable heartbeat tick even when UI is inactive
  const startBackgroundWorker = (intervalSec: number) => {
    try {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      const blob = new Blob([
        `let intervalId = null;
        self.onmessage = function(e) {
          if (e.data.action === 'start') {
            if (intervalId) clearInterval(intervalId);
            intervalId = setInterval(() => {
              self.postMessage({ type: 'TICK' });
            }, (e.data.interval || 10) * 1000);
          } else if (e.data.action === 'stop') {
            if (intervalId) clearInterval(intervalId);
            intervalId = null;
          }
        };`
      ], { type: 'application/javascript' });

      const worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = (e) => {
        if (e.data.type === 'TICK' && isTrackingRef.current) {
          // Force location query in background
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => sendLocationPing(pos),
              (err) => console.warn('Worker background GPS tick warning:', err),
              { enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: 5000 }
            );
          }
        }
      };

      worker.postMessage({ action: 'start', interval: intervalSec });
      workerRef.current = worker;
    } catch (e) {
      console.warn('Web Worker initialization error:', e);
    }
  };

  const stopBackgroundWorker = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ action: 'stop' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
  };

  // Start Tracking Handler
  const startTracking = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser/device.');
      return;
    }

    setGpsError(null);
    setIsTracking(true);
    requestWakeLock();

    if (enableBackgroundKeepAlive) {
      startBackgroundAudio();
    }
    startBackgroundWorker(pingIntervalSeconds);

    // 1. First trigger an immediate prompt
    triggerLocationPrompt();

    // 2. Then attach continuous watchPosition
    const id = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentPosition(position);
        setGpsError(null);
        sendLocationPing(position);
      },
      (error) => {
        console.error('WatchPosition GPS error:', error);
        if (error.code === 1) {
          setGpsError('Location Permission Denied. Please enable Location in browser site settings.');
          stopTracking();
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: 20000,
        maximumAge: 3000
      }
    );

    setWatchId(id);
  };

  // Stop Tracking Handler
  const stopTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    releaseWakeLock();
    stopBackgroundAudio();
    stopBackgroundWorker();
    setIsTracking(false);
  };

  // Handle new vehicle creation
  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customVehicleName.trim()) return;

    const newId = `v-${customVehicleName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.floor(Math.random() * 1000)}`;
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newId,
          label: customVehicleName
        })
      });
      const data = await res.json();
      if (data.vehicle) {
        setVehicles(prev => [data.vehicle, ...prev]);
        setSelectedVehicleId(data.vehicle.id);
        setShowAddVehicle(false);
        setCustomVehicleName('');
      }
    } catch (err) {
      console.error('Failed to create vehicle:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Insecure Context (HTTP over Wi-Fi) Warning Banner */}
      {isInsecureContext && (
        <div className="p-4 rounded-2xl bg-amber-950/70 border border-amber-500/60 text-amber-200 text-xs sm:text-sm space-y-2 shadow-lg">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-400" />
            <span>Mobile Browser Security Notice: Insecure HTTP Detected</span>
          </div>
          <p className="text-amber-200/90 leading-relaxed">
            Modern mobile browsers (iOS Safari, Android Chrome) <strong>strictly block GPS permission requests</strong> over plain local network HTTP (<code className="bg-black/40 px-1.5 py-0.5 rounded text-amber-100">{typeof window !== 'undefined' ? window.location.origin : 'http://192.168...'}</code>).
          </p>
          <div className="pt-1 text-xs text-amber-300 font-medium">
            💡 <strong>Solutions for Mobile GPS Testing:</strong>
            <ul className="list-disc list-inside mt-1 space-y-1 text-amber-200/80">
              <li><strong>Deploy to Vercel (Recommended):</strong> Provides automatic free <strong>HTTPS</strong> where mobile GPS works immediately.</li>
              <li><strong>Chrome Flag (Android):</strong> In Chrome on phone, go to <code className="bg-black/40 px-1 rounded">chrome://flags#unsafely-treat-insecure-origin-as-secure</code>, add your PC URL, and restart.</li>
              <li><strong>ngrok tunnel:</strong> Run <code className="bg-black/40 px-1 rounded">ngrok http 3000</code> on your PC to get a free temporary HTTPS link for your phone.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isTracking ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Driver Phone Tracker
              {isTracking && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-normal">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live GPS Stream Active
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400">PWA Ingest Client with Screen WakeLock & Background Resilience</p>
          </div>
        </div>

        {/* Battery & WakeLock Status */}
        <div className="flex items-center gap-2 flex-wrap">
          {wakeLockActive && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium" title="Screen will remain awake while tracking">
              <Sun className="w-3.5 h-3.5" />
              <span>WakeLock ON</span>
            </div>
          )}
          {backgroundAudioActive && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-medium" title="Background Audio Keep-Alive active to allow screen-off tracking">
              <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span>Screen-Off Guard ON</span>
            </div>
          )}
          {batteryLevel !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium">
              {isCharging ? <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" /> : <Battery className="w-3.5 h-3.5 text-slate-400" />}
              <span>{batteryLevel}%</span>
            </div>
          )}
        </div>
      </div>

      {/* 1-Click Driver Dispatch Guide (Urdu & English) */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-slate-900/80 to-blue-950/40 border border-emerald-500/40 text-slate-200 text-xs sm:text-sm space-y-3 shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 font-bold text-emerald-300">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span>1-Click Dispatch Link Active • No App Installation Required</span>
          </div>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
            Zero-Login Web Tracking
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs leading-relaxed">
          <div className="p-3 rounded-xl bg-black/40 border border-slate-800 space-y-1.5">
            <p className="font-bold text-emerald-400">🇵🇰 ڈرائیور حضرات کے لیے آسان ہدایات:</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300">
              <li>نیچے سبز بٹن <strong>&quot;START TRACKING&quot;</strong> پر کلک کریں۔</li>
              <li>فون کو گاڑی کے ڈیش بورڈ، ہولڈر یا چارجر میں لگا دیں۔</li>
              <li>اسکرین خود آن رہے گی اور آپ کی گاڑی کا سفر لائیو ٹریک ہوتا رہے گا۔</li>
            </ol>
          </div>

          <div className="p-3 rounded-xl bg-black/40 border border-slate-800 space-y-1.5">
            <p className="font-bold text-blue-400">🇬🇧 Instructions for Driver:</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300">
              <li>Tap the green <strong>&quot;START TRACKING&quot;</strong> button below.</li>
              <li>Mount your phone or leave it plugged in while driving.</li>
              <li>Screen will stay awake with WakeLock. Do not close this browser tab.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Vehicle Selector */}
      <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-blue-400" />
            <span>Assigned Vehicle</span>
          </label>
          <button
            type="button"
            disabled={isTracking}
            onClick={() => setShowAddVehicle(!showAddVehicle)}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
          >
            {showAddVehicle ? 'Cancel' : '+ New Vehicle'}
          </button>
        </div>

        {showAddVehicle ? (
          <form onSubmit={handleCreateVehicle} className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. Mazda Truck 09 - Driver Ali"
              value={customVehicleName}
              onChange={(e) => setCustomVehicleName(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Save
            </button>
          </form>
        ) : (
          <select
            disabled={isTracking}
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:outline-none focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} {v.plate_number ? `(${v.plate_number})` : ''} — ID: {v.id}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Main Tracking Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 py-2">
        {!isTracking ? (
          <>
            <button
              type="button"
              onClick={startTracking}
              className="w-full sm:w-72 py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-lg shadow-xl shadow-emerald-600/30 hover:shadow-emerald-600/40 transform hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-3"
            >
              <Play className="w-6 h-6 fill-current" />
              <span>START TRACKING</span>
            </button>

            <button
              type="button"
              onClick={triggerLocationPrompt}
              disabled={isLocating}
              className="w-full sm:w-auto py-4 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold border border-slate-700 transition-all flex items-center justify-center gap-2"
            >
              <Navigation className={`w-4 h-4 text-blue-400 ${isLocating ? 'animate-spin' : ''}`} />
              <span>{isLocating ? 'Locating...' : 'Request Single GPS Ping'}</span>
            </button>
          </>
        ) : (
          <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={stopTracking}
              className="w-full sm:w-72 py-4 px-6 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-lg shadow-xl shadow-rose-600/30 hover:shadow-rose-600/40 transform hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-3"
            >
              <Square className="w-6 h-6 fill-current" />
              <span>STOP TRACKING</span>
            </button>

            <button
              type="button"
              onClick={() => setIsHudMode(true)}
              className="w-full sm:w-auto py-4 px-5 rounded-2xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-200 text-sm font-semibold hover:text-white transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <Sun className="w-4 h-4 text-amber-400" />
              <span>AMOLED Blackout HUD</span>
            </button>
          </div>
        )}
      </div>

      {/* AMOLED Blackout HUD Overlay for zero battery burn while keeping screen on */}
      {isHudMode && (
        <div 
          onClick={() => setIsHudMode(false)}
          className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-between p-8 text-center cursor-pointer select-none"
        >
          <div className="pt-8 space-y-1 text-slate-600">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950 border border-slate-900 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>GPS Tracking Live (WakeLock Active)</span>
            </div>
            <p className="text-[11px] text-slate-700 pt-1">Screen is black to conserve battery • Mount phone and drive</p>
          </div>

          <div className="space-y-4">
            <div className="text-6xl font-mono font-black text-slate-200">
              {currentPosition?.coords.speed !== null && currentPosition?.coords.speed !== undefined 
                ? `${Math.round((currentPosition.coords.speed || 0) * 3.6)}` 
                : '0'}
              <span className="text-xl font-normal text-slate-600 ml-2">km/h</span>
            </div>
            <div className="text-lg font-bold text-emerald-400">
              {currentTehsil || 'Resolving Tehsil...'}
            </div>
            <div className="text-xs text-slate-600 font-mono">
              Pings Streamed: {stats.successful} / {stats.sent} • {currentDistrict || ''}
            </div>
          </div>

          <div className="pb-8 text-xs text-slate-600 animate-pulse">
            👆 Tap anywhere on screen to exit Blackout HUD
          </div>
        </div>
      )}

      {/* GPS Error Alert */}
      {gpsError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">GPS / Permission Notice</p>
            <p className="text-xs text-rose-300/80 leading-relaxed">{gpsError}</p>
            {isInsecureContext && (
              <p className="text-[11px] text-amber-300 font-medium">
                Tip: Mobile browsers block GPS over HTTP local IP. Deploy to Vercel HTTPS or use ngrok.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Boundary Crossing Alert Banner */}
      {lastCrossingAlert && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-blue-900/60 to-indigo-900/60 border border-blue-500/50 text-white flex items-center justify-between gap-4 animate-bounce">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs uppercase font-bold text-blue-300 tracking-wider">Tehsil Boundary Crossed!</span>
              <p className="text-sm font-semibold">
                {lastCrossingAlert.from || 'Entry'} <ArrowRight className="inline w-3.5 h-3.5 text-blue-400 mx-1" /> {lastCrossingAlert.to}
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-400">{lastCrossingAlert.time}</span>
        </div>
      )}

      {/* Current Location & Tehsil Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Tehsil Detection Status */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <span className="text-xs uppercase font-semibold tracking-wider text-slate-400 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span>Current Resolved Tehsil</span>
          </span>
          <div>
            <div className="text-2xl font-black text-white">
              {currentTehsil || (isTracking ? 'Resolving boundary...' : 'Idle')}
            </div>
            <p className="text-sm text-slate-400 font-medium mt-0.5">
              District: {currentDistrict || '—'}
            </p>
          </div>
        </div>

        {/* GPS Coordinates & Accuracy */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <span className="text-xs uppercase font-semibold tracking-wider text-slate-400 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-blue-400" />
            <span>Live Coordinates</span>
          </span>
          {currentPosition ? (
            <div>
              <div className="text-lg font-mono font-bold text-white">
                {currentPosition.coords.latitude.toFixed(6)}, {currentPosition.coords.longitude.toFixed(6)}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                <span>Accuracy: <strong className={currentPosition.coords.accuracy < 20 ? 'text-emerald-400' : 'text-amber-400'}>±{Math.round(currentPosition.coords.accuracy)}m</strong></span>
                {currentPosition.coords.speed !== null && (
                  <span>Speed: <strong>{Math.round((currentPosition.coords.speed || 0) * 3.6)} km/h</strong></span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">No GPS coordinates yet. Click "START TRACKING" above.</p>
          )}
        </div>
      </div>

      {/* Transmission Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 text-center">
          <span className="text-xs text-slate-400">Total Pings</span>
          <div className="text-xl font-bold text-white mt-0.5">{stats.sent}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 text-center">
          <span className="text-xs text-slate-400">Ingested OK</span>
          <div className="text-xl font-bold text-emerald-400 mt-0.5">{stats.successful}</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 text-center">
          <span className="text-xs text-slate-400">Failures</span>
          <div className="text-xl font-bold text-rose-400 mt-0.5">{stats.failed}</div>
        </div>
      </div>

      {/* Throttling & Geolocation Settings */}
      <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span>Throttling & Battery Optimization Settings</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">
              Ping Interval: <strong>{pingIntervalSeconds} seconds</strong>
            </label>
            <input
              type="range"
              min="3"
              max="60"
              step="1"
              value={pingIntervalSeconds}
              onChange={(e) => setPingIntervalSeconds(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <span className="text-[11px] text-slate-500">Lower = faster detection; Higher = saves battery</span>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">
              Min Distance Threshold: <strong>{minDistanceMeters} meters</strong>
            </label>
            <input
              type="range"
              min="5"
              max="200"
              step="5"
              value={minDistanceMeters}
              onChange={(e) => setMinDistanceMeters(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <span className="text-[11px] text-slate-500">Only send ping when vehicle moves at least this far</span>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800/60">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-slate-300 font-medium flex items-center gap-1.5 cursor-pointer text-xs" onClick={() => setEnableBackgroundKeepAlive(!enableBackgroundKeepAlive)}>
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                <span>Screen-Off Background Guard (Audio Keep-Alive)</span>
              </label>
              <p className="text-[11px] text-slate-500">
                Prevents Android & iOS from pausing GPS pings when phone is locked or browser is minimized.
              </p>
            </div>
            <input
              type="checkbox"
              checked={enableBackgroundKeepAlive}
              onChange={(e) => setEnableBackgroundKeepAlive(e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Real-time Ping Stream Terminal */}
      <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 font-mono">
        <div className="flex items-center justify-between text-xs text-slate-400 font-sans border-b border-slate-900 pb-2">
          <span className="font-semibold flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Ingest Stream Feed ({pingLogs.length})</span>
          </span>
          <button
            type="button"
            onClick={() => setPingLogs([])}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear Log
          </button>
        </div>

        <div className="max-h-60 overflow-y-auto space-y-2 text-xs">
          {pingLogs.length === 0 ? (
            <p className="text-slate-600 text-center py-6 italic font-sans">
              Waiting for pings... Press "START TRACKING" above.
            </p>
          ) : (
            pingLogs.map((log) => (
              <div
                key={log.id}
                className={`p-2.5 rounded-lg border flex items-start justify-between gap-2 ${
                  log.crossing 
                    ? 'bg-blue-950/60 border-blue-600 text-blue-200' 
                    : log.status === 'success' 
                    ? 'bg-slate-900/60 border-slate-800 text-slate-300' 
                    : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">[{log.time}]</span>
                    <span className="font-semibold">{log.lat.toFixed(5)}, {log.lng.toFixed(5)}</span>
                    <span className="text-slate-400 text-[10px]">±{Math.round(log.accuracy)}m</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Tehsil: <span className="text-emerald-400 font-medium">{log.tehsil || 'Unknown'}</span>
                    {log.message && <span className="ml-2 text-slate-500">({log.message})</span>}
                  </div>
                </div>
                {log.crossing && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500 text-white font-bold tracking-wider uppercase">
                    Crossing
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
