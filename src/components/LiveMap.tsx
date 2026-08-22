'use client';

import React, { useEffect, useState, useRef } from 'react';
import { RawPing, BoundaryCrossing, TehsilFeatureCollection } from '@/lib/types';
import { Layers, Locate, Maximize2, Compass, Navigation, Crosshair, AlertCircle } from 'lucide-react';
import L from 'leaflet';

interface LiveMapProps {
  vehicleId: string;
  vehicleLabel?: string;
  currentTehsil?: string | null;
  pings: RawPing[];
  crossings: BoundaryCrossing[];
  showBoundaries?: boolean;
  onLocationFound?: (lat: number, lng: number, accuracy: number) => void;
}

export default function LiveMap({
  vehicleId,
  vehicleLabel,
  currentTehsil,
  pings,
  crossings,
  showBoundaries = true,
  onLocationFound,
}: LiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const boundaryLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const vehicleMarkerRef = useRef<L.Marker | null>(null);
  const userLocationMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const crossingsGroupRef = useRef<L.LayerGroup | null>(null);

  const [tehsilsData, setTehsilsData] = useState<TehsilFeatureCollection | null>(null);
  const [boundariesVisible, setBoundariesVisible] = useState<boolean>(showBoundaries);
  const [autoCenter, setAutoCenter] = useState<boolean>(true);
  const [isLocatingUser, setIsLocatingUser] = useState<boolean>(false);
  const [userLocError, setUserLocError] = useState<string | null>(null);
  const [tappedLocation, setTappedLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Load Tehsil Boundaries GeoJSON
  useEffect(() => {
    fetch('/api/tehsils')
      .then((res) => res.json())
      .then((data) => setTehsilsData(data))
      .catch((err) => console.error('Failed to load tehsils GeoJSON:', err));
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center on Pakistan
    const map = L.map(mapContainerRef.current, {
      center: [31.5204, 74.3587],
      zoom: 12,
      zoomControl: false,
    });

    // CartoDB Dark Matter / OpenStreetMap tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> | &copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    boundaryLayerGroupRef.current = L.layerGroup().addTo(map);
    crossingsGroupRef.current = L.layerGroup().addTo(map);

    // Map Click Listener to inspect or test coordinates
    map.on('click', (e: L.LeafletMouseEvent) => {
      setTappedLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Locate User Phone / Device directly
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setUserLocError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocatingUser(true);
    setUserLocError(null);

    const onPosSuccess = (position: GeolocationPosition) => {
      setIsLocatingUser(false);
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([lat, lng], 15, { animate: true });

        const userIcon = L.divIcon({
          className: 'user-loc-marker',
          html: `
            <div style="
              width: 22px;
              height: 22px;
              border-radius: 50%;
              background-color: #10b981;
              border: 3px solid #ffffff;
              box-shadow: 0 0 12px rgba(16, 185, 129, 0.9);
              display: flex;
              align-items: center;
              justify-content: center;
            ">
            </div>
          `,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        if (userLocationMarkerRef.current) {
          userLocationMarkerRef.current.setLatLng([lat, lng]);
          userLocationMarkerRef.current.setIcon(userIcon);
        } else {
          userLocationMarkerRef.current = L.marker([lat, lng], { icon: userIcon }).addTo(mapInstanceRef.current);
        }

        userLocationMarkerRef.current.bindPopup(
          `<div class="text-xs p-1">
            <strong class="text-emerald-400 font-bold">📍 Your Device Location</strong><br/>
            <div class="mt-1 text-slate-300">
              <div>Coords: ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
              <div>Accuracy: ±${Math.round(accuracy)}m</div>
            </div>
          </div>`
        ).openPopup();
      }

      if (onLocationFound) {
        onLocationFound(lat, lng, accuracy);
      }
    };

    const onPosError = (error: GeolocationPositionError) => {
      // Retry with standard accuracy
      navigator.geolocation.getCurrentPosition(
        onPosSuccess,
        (fallbackErr) => {
          setIsLocatingUser(false);
          let msg = fallbackErr.message;
          if (fallbackErr.code === 1) {
            msg = 'Permission Denied. (Note: Mobile browsers require HTTPS to grant GPS permissions)';
          }
          setUserLocError(msg);
        },
        { enableHighAccuracy: false, timeout: 20000 }
      );
    };

    navigator.geolocation.getCurrentPosition(onPosSuccess, onPosError, {
      enableHighAccuracy: true,
      timeout: 10000,
    });
  };

  // Render Tehsil Boundaries
  useEffect(() => {
    if (!mapInstanceRef.current || !boundaryLayerGroupRef.current || !tehsilsData) return;

    boundaryLayerGroupRef.current.clearLayers();

    if (boundariesVisible) {
      const geoJsonLayer = L.geoJSON(tehsilsData as any, {
        style: (feature) => {
          const isCurrent = feature?.properties?.name === currentTehsil;
          return {
            color: isCurrent ? '#2563eb' : '#64748b',
            weight: isCurrent ? 3 : 1.5,
            opacity: 0.8,
            fillColor: isCurrent ? '#3b82f6' : '#94a3b8',
            fillOpacity: isCurrent ? 0.25 : 0.08,
            dashArray: isCurrent ? undefined : '4, 4',
          };
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties;
          layer.bindTooltip(
            `<div class="text-xs font-sans">
              <strong class="text-blue-400 font-bold">${props.name}</strong><br/>
              <span class="text-slate-400">District: ${props.district}</span><br/>
              <span class="text-slate-500 text-[10px]">${props.province}</span>
            </div>`,
            { sticky: true, className: 'leaflet-popup-content-wrapper' }
          );
        },
      });

      boundaryLayerGroupRef.current.addLayer(geoJsonLayer);
    }
  }, [tehsilsData, boundariesVisible, currentTehsil]);

  // Render Track Polyline & Vehicle Position Marker
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Track Coordinates
    if (pings.length > 0) {
      const latLngs: [number, number][] = pings.map((p) => [p.lat, p.lng]);

      if (polylineRef.current) {
        polylineRef.current.setLatLngs(latLngs);
      } else {
        polylineRef.current = L.polyline(latLngs, {
          color: '#3b82f6',
          weight: 4,
          opacity: 0.85,
          lineJoin: 'round',
        }).addTo(map);
      }

      // Latest ping is vehicle location
      const latestPing = pings[pings.length - 1];
      const vehiclePos: [number, number] = [latestPing.lat, latestPing.lng];

      const customIcon = L.divIcon({
        className: 'vehicle-pulse-marker',
        html: `
          <div class="pulse-ring"></div>
          <div style="
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background-color: #2563eb;
            border: 3px solid #ffffff;
            box-shadow: 0 0 10px rgba(37, 99, 235, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      if (vehicleMarkerRef.current) {
        vehicleMarkerRef.current.setLatLng(vehiclePos);
        vehicleMarkerRef.current.setIcon(customIcon);
      } else {
        vehicleMarkerRef.current = L.marker(vehiclePos, { icon: customIcon }).addTo(map);
      }

      vehicleMarkerRef.current.bindPopup(
        `<div class="text-xs p-1">
          <strong class="text-sm font-bold text-white">${vehicleLabel || vehicleId}</strong><br/>
          <div class="mt-1 text-slate-300">
            <div>Tehsil: <strong class="text-blue-400">${currentTehsil || 'Detecting...'}</strong></div>
            <div>Coords: ${latestPing.lat.toFixed(5)}, ${latestPing.lng.toFixed(5)}</div>
            <div>Accuracy: ±${Math.round(latestPing.accuracy_m || 0)}m</div>
            <div>Time: ${new Date(latestPing.recorded_at).toLocaleTimeString()}</div>
          </div>
        </div>`
      );

      if (autoCenter) {
        map.panTo(vehiclePos, { animate: true });
      }
    }
  }, [pings, vehicleLabel, vehicleId, currentTehsil, autoCenter]);

  // Render Boundary Crossing Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !crossingsGroupRef.current) return;
    const group = crossingsGroupRef.current;
    group.clearLayers();

    crossings.forEach((c) => {
      const crossingIcon = L.divIcon({
        className: 'crossing-marker',
        html: `
          <div style="
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background-color: #f59e0b;
            border: 2px solid #ffffff;
            color: #000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: bold;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5);
          ">
            ⚡
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([c.lat, c.lng], { icon: crossingIcon });
      marker.bindPopup(
        `<div class="text-xs p-1">
          <strong class="text-amber-400 font-bold">⚡ Boundary Crossing Event</strong><br/>
          <div class="mt-1 text-slate-300">
            <div>From: <strong>${c.from_tehsil || 'Initial Entry'}</strong></div>
            <div>To: <strong class="text-emerald-400">${c.to_tehsil}</strong> (${c.to_district || ''})</div>
            <div>Time: ${new Date(c.crossed_at).toLocaleTimeString()}</div>
          </div>
        </div>`
      );
      group.addLayer(marker);
    });
  }, [crossings]);

  // Center on Vehicle Handler
  const handleRecenter = () => {
    if (mapInstanceRef.current && pings.length > 0) {
      const latest = pings[pings.length - 1];
      mapInstanceRef.current.setView([latest.lat, latest.lng], 14, { animate: true });
      setAutoCenter(true);
    }
  };

  // Fit All Bounds Handler
  const handleFitBounds = () => {
    if (mapInstanceRef.current && pings.length > 0) {
      const bounds = L.latLngBounds(pings.map((p) => [p.lat, p.lng]));
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
      setAutoCenter(false);
    }
  };

  return (
    <div className="relative w-full h-[550px] sm:h-[650px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Map Controls - Top Left */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setBoundariesVisible(!boundariesVisible)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-md shadow-lg border transition-all ${
            boundariesVisible
              ? 'bg-blue-600/90 text-white border-blue-500 shadow-blue-600/30'
              : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{boundariesVisible ? 'Tehsil Polygons ON' : 'Tehsil Polygons OFF'}</span>
        </button>

        {/* Locate Device Button */}
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={isLocatingUser}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-400 backdrop-blur-md shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
        >
          <Navigation className={`w-3.5 h-3.5 ${isLocatingUser ? 'animate-spin' : ''}`} />
          <span>{isLocatingUser ? 'Locating...' : 'Locate My Device'}</span>
        </button>
      </div>

      {/* Locate Error Floating Alert */}
      {userLocError && (
        <div className="absolute top-16 left-4 right-4 z-10 p-3 rounded-xl bg-rose-950/90 border border-rose-500 text-rose-200 text-xs flex items-center justify-between backdrop-blur-md shadow-xl">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{userLocError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUserLocError(null)}
            className="text-rose-400 hover:text-white font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Floating Bottom Right Controls */}
      <div className="absolute bottom-6 right-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleRecenter}
          title="Center on Vehicle"
          className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 shadow-lg backdrop-blur-md transition-all active:scale-95"
        >
          <Locate className="w-4 h-4 text-blue-400" />
        </button>
        <button
          type="button"
          onClick={handleFitBounds}
          title="Fit Track Bounds"
          className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 shadow-lg backdrop-blur-md transition-all active:scale-95"
        >
          <Maximize2 className="w-4 h-4 text-slate-300" />
        </button>
      </div>

      {/* Current Tehsil Overlay Pill */}
      <div className="absolute top-4 right-14 z-10 hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 backdrop-blur-md text-xs shadow-lg">
        <Compass className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-slate-400">Current Zone:</span>
        <strong className="text-white font-semibold">{currentTehsil || 'Resolving...'}</strong>
      </div>
    </div>
  );
}
