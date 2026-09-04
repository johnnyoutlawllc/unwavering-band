'use client';

import { useEffect, useRef } from 'react';
import type { HistoryMapPoint } from '@/lib/history';
import type { PlaceRow } from '@/lib/supabase';
import 'leaflet/dist/leaflet.css';

export type MapBounds = {
  south: number;
  north: number;
  west: number;
  east: number;
};

type Props = {
  points: HistoryMapPoint[];
  places: PlaceRow[];
  bounds: MapBounds;
  selectedId: string | null;
  onSelect: (point: HistoryMapPoint) => void;
};

type LeafletNS = typeof import('leaflet');

type MapHandle = {
  L: LeafletNS;
  map: import('leaflet').Map;
  canvas: HTMLCanvasElement;
  detailLayer: import('leaflet').LayerGroup;
  placeLayer: import('leaflet').LayerGroup;
};

export function HistoryHeatmap({
  points,
  places,
  bounds,
  selectedId,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MapHandle | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);
  const pointsRef = useRef(points);
  const placesRef = useRef(places);
  const boundsRef = useRef(bounds);
  onSelectRef.current = onSelect;
  selectedIdRef.current = selectedId;
  pointsRef.current = points;
  placesRef.current = places;
  boundsRef.current = bounds;

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let map: import('leaflet').Map | null = null;

    void import('leaflet').then((L) => {
      if (disposed || !containerRef.current) return;

      map = L.map(containerRef.current, {
        preferCanvas: true,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const canvas = L.DomUtil.create(
        'canvas',
        'history-heatmap-canvas',
      ) as HTMLCanvasElement;
      map.getPanes().overlayPane.appendChild(canvas);
      const detailLayer = L.layerGroup().addTo(map);
      const placeLayer = L.layerGroup().addTo(map);
      const handle: MapHandle = { L, map, canvas, detailLayer, placeLayer };
      handleRef.current = handle;

      const redraw = () => {
        paintMap(
          handle,
          pointsRef.current,
          placesRef.current,
          selectedIdRef.current,
          onSelectRef.current,
        );
      };

      map.on('moveend zoomend resize', redraw);
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
      map?.remove();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      { padding: [24, 24], animate: false, maxZoom: 15 },
    );
  }, [bounds]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    paintMap(handle, points, places, selectedId, onSelect);
  }, [points, places, selectedId, onSelect]);

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
  onSelect: (point: HistoryMapPoint) => void,
) {
  const { L, map, canvas, detailLayer, placeLayer } = handle;
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
    const gradient = context.createRadialGradient(
      pixel.x,
      pixel.y,
      0,
      pixel.x,
      pixel.y,
      radius,
    );
    gradient.addColorStop(0, 'rgba(255,244,158,.24)');
    gradient.addColorStop(0.32, 'rgba(255,179,71,.16)');
    gradient.addColorStop(0.68, 'rgba(167,139,250,.10)');
    gradient.addColorStop(1, 'rgba(90,22,120,0)');
    context.fillStyle = gradient;
    context.fillRect(pixel.x - radius, pixel.y - radius, radius * 2, radius * 2);
  }
  context.globalCompositeOperation = 'source-over';

  detailLayer.clearLayers();
  if (map.getZoom() >= 11) {
    const visible = map.getBounds();
    for (const point of points) {
      const latLng = L.latLng(point.lat, point.lng);
      if (!visible.contains(latLng)) continue;
      const selected = point.id === selectedId;
      L.circleMarker(latLng, {
        radius: selected ? 7 : 4,
        color: selected ? '#ffb347' : 'rgba(255,255,255,.9)',
        weight: selected ? 2 : 1,
        fillColor: selected ? '#ffb347' : '#f1f1f1',
        fillOpacity: 0.95,
      })
        .addTo(detailLayer)
        .on('click', () => onSelect(point));
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
