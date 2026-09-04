'use client';

import { useEffect, useRef } from 'react';
import type { HistoryMapPoint } from '@/lib/history';
import { OWN_HISTORY_COLOR } from '@/lib/history';
import type { PlaceRow } from '@/lib/supabase';
import 'leaflet/dist/leaflet.css';

export type MapBounds = {
  south: number;
  north: number;
  west: number;
  east: number;
};

export type HistoryBasemap = 'street' | 'satellite';

type Props = {
  points: HistoryMapPoint[];
  places: PlaceRow[];
  bounds: MapBounds;
  selectedId: string | null;
  focusPoint?: HistoryMapPoint | null;
  basemap?: HistoryBasemap;
  onSelect: (point: HistoryMapPoint) => void;
};

type LeafletNS = typeof import('leaflet');

type MapHandle = {
  L: LeafletNS;
  map: import('leaflet').Map;
  canvas: HTMLCanvasElement;
  detailLayer: import('leaflet').LayerGroup;
  placeLayer: import('leaflet').LayerGroup;
  selectedLayer: import('leaflet').LayerGroup;
  streetLayer: import('leaflet').TileLayer;
  satelliteLayer: import('leaflet').TileLayer;
};

export function HistoryHeatmap({
  points,
  places,
  bounds,
  selectedId,
  focusPoint = null,
  basemap = 'street',
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MapHandle | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);
  const focusPointRef = useRef(focusPoint);
  const pointsRef = useRef(points);
  const placesRef = useRef(places);
  const boundsRef = useRef(bounds);
  onSelectRef.current = onSelect;
  selectedIdRef.current = selectedId;
  focusPointRef.current = focusPoint;
  pointsRef.current = points;
  placesRef.current = places;
  boundsRef.current = bounds;

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let map: import('leaflet').Map | null = null;
    let observer: ResizeObserver | null = null;

    void import('leaflet').then((L) => {
      if (disposed || !containerRef.current) return;

      map = L.map(containerRef.current, {
        preferCanvas: true,
        zoomControl: true,
        attributionControl: true,
      });

      const streetLayer = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        },
      );

      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution:
            'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
          maxZoom: 19,
        },
      );

      streetLayer.addTo(map);

      const canvas = L.DomUtil.create(
        'canvas',
        'history-heatmap-canvas',
      ) as HTMLCanvasElement;
      map.getPanes().overlayPane.appendChild(canvas);
      const detailLayer = L.layerGroup().addTo(map);
      const placeLayer = L.layerGroup().addTo(map);
      const selectedLayer = L.layerGroup().addTo(map);
      const handle: MapHandle = {
        L,
        map,
        canvas,
        detailLayer,
        placeLayer,
        selectedLayer,
        streetLayer,
        satelliteLayer,
      };
      handleRef.current = handle;

      const redraw = () => {
        paintMap(
          handle,
          pointsRef.current,
          placesRef.current,
          selectedIdRef.current,
          focusPointRef.current,
          onSelectRef.current,
        );
      };

      map.on('moveend zoomend resize', redraw);
      observer = new ResizeObserver(() => {
        map?.invalidateSize({ animate: false });
        redraw();
      });
      observer.observe(containerRef.current);

      const b = boundsRef.current;
      map.fitBounds(
        [
          [b.south, b.west],
          [b.north, b.east],
        ],
        { padding: [24, 24], animate: false, maxZoom: 15 },
      );
      redraw();
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      map?.remove();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    if (basemap === 'satellite') {
      if (handle.map.hasLayer(handle.streetLayer)) {
        handle.map.removeLayer(handle.streetLayer);
      }
      if (!handle.map.hasLayer(handle.satelliteLayer)) {
        handle.satelliteLayer.addTo(handle.map);
      }
    } else {
      if (handle.map.hasLayer(handle.satelliteLayer)) {
        handle.map.removeLayer(handle.satelliteLayer);
      }
      if (!handle.map.hasLayer(handle.streetLayer)) {
        handle.streetLayer.addTo(handle.map);
      }
    }
  }, [basemap]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      { padding: [28, 28], animate: true, maxZoom: 14 },
    );
  }, [bounds.south, bounds.north, bounds.west, bounds.east]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle || !focusPoint) return;
    handle.map.flyTo([focusPoint.lat, focusPoint.lng], 15, {
      duration: 0.55,
    });
  }, [focusPoint?.id, focusPoint?.lat, focusPoint?.lng]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    paintMap(handle, points, places, selectedId, focusPoint, onSelect);
  }, [points, places, selectedId, focusPoint, onSelect]);

  return (
    <div
      ref={containerRef}
      className="history-leaflet-map"
      aria-label="Interactive heatmap of your location history"
    />
  );
}

function paintMap(
  handle: MapHandle,
  points: HistoryMapPoint[],
  places: PlaceRow[],
  selectedId: string | null,
  focusPoint: HistoryMapPoint | null | undefined,
  onSelect: (point: HistoryMapPoint) => void,
) {
  const { L, map, canvas, detailLayer, placeLayer, selectedLayer } = handle;
  const size = map.getSize();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = size.x * ratio;
  canvas.height = size.y * ratio;
  canvas.style.width = `${size.x}px`;
  canvas.style.height = `${size.y}px`;
  const topLeft = map.containerPointToLayerPoint([0, 0]);
  L.DomUtil.setPosition(canvas, topLeft);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size.x, size.y);
  context.globalCompositeOperation = 'lighter';
  const radius = Math.max(16, Math.min(34, 13 + map.getZoom() * 1.25));
  for (const point of points) {
    const pixel = map.latLngToContainerPoint([point.lat, point.lng]);
    if (
      pixel.x < -radius ||
      pixel.y < -radius ||
      pixel.x > size.x + radius ||
      pixel.y > size.y + radius
    ) {
      continue;
    }
    const hex = point.color || OWN_HISTORY_COLOR;
    const rgb = hexToRgb(hex);
    const gradient = context.createRadialGradient(
      pixel.x,
      pixel.y,
      0,
      pixel.x,
      pixel.y,
      radius,
    );
    gradient.addColorStop(0, `rgba(${rgb},.28)`);
    gradient.addColorStop(0.35, `rgba(${rgb},.16)`);
    gradient.addColorStop(0.7, `rgba(${rgb},.08)`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    context.fillStyle = gradient;
    context.fillRect(pixel.x - radius, pixel.y - radius, radius * 2, radius * 2);
  }
  context.globalCompositeOperation = 'source-over';

  detailLayer.clearLayers();
  if (map.getZoom() >= 11) {
    const visible = map.getBounds();
    for (const point of points) {
      if (point.id === selectedId) continue;
      const latLng = L.latLng(point.lat, point.lng);
      if (!visible.contains(latLng)) continue;
      const fill = point.color || '#f1f1f1';
      L.circleMarker(latLng, {
        radius: 4,
        color: 'rgba(255,255,255,.9)',
        weight: 1,
        fillColor: fill,
        fillOpacity: 0.95,
      })
        .addTo(detailLayer)
        .on('click', () => onSelect(point));
    }
  }

  selectedLayer.clearLayers();
  const selected =
    (selectedId ? points.find((point) => point.id === selectedId) : null) ??
    (focusPoint && focusPoint.id === selectedId ? focusPoint : null) ??
    focusPoint ??
    null;
  if (selected) {
    const fill = selected.color || OWN_HISTORY_COLOR;
    const latLng = L.latLng(selected.lat, selected.lng);
    const inSeries = points.some((point) => point.id === selected.id);
    L.circleMarker(latLng, {
      radius: 11,
      color: '#fff',
      weight: 2,
      fillColor: fill,
      fillOpacity: 0.2,
    }).addTo(selectedLayer);
    const marker = L.circleMarker(latLng, {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: fill,
      fillOpacity: 1,
    }).addTo(selectedLayer);
    if (inSeries) {
      marker.on('click', () => onSelect(selected));
    }
  }

  placeLayer.clearLayers();
  for (const place of places) {
    L.circle([place.lat, place.lng], {
      radius: place.radius_m,
      color: 'rgba(110,231,255,.55)',
      weight: 1,
      fillColor: 'rgba(110,231,255,.12)',
      fillOpacity: 0.35,
    }).addTo(placeLayer);
    L.marker([place.lat, place.lng], {
      icon: L.divIcon({
        className: 'history-place-label',
        html: `<span>${escapeHtml(place.name)}</span>`,
        iconSize: [0, 0],
      }),
    }).addTo(placeLayer);
  }
}

function hexToRgb(hex: string): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return '255,179,71';
  const n = Number.parseInt(raw, 16);
  if (!Number.isFinite(n)) return '255,179,71';
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
