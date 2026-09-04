'use client';

import { useMemo, useState } from 'react';
import { distanceLabel } from '@/lib/geo';
import type { DistancePoint } from '@/lib/supabase';

type Props = {
  points: DistancePoint[];
  peerName: string;
};

export function DistanceChart({ points, peerName }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const { maxKm, path, width, height, pad } = useMemo(() => {
    const w = 720;
    const h = 280;
    const p = { top: 24, right: 16, bottom: 36, left: 48 };
    const max = Math.max(...points.map((pt) => pt.distance_km), 1);
    const innerW = w - p.left - p.right;
    const innerH = h - p.top - p.bottom;
    const coords = points.map((pt, i) => {
      const x = p.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
      const y = p.top + innerH - (pt.distance_km / max) * innerH;
      return { x, y };
    });
    const d = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');
    return { maxKm: max, path: d, width: w, height: h, pad: p, coords };
  }, [points]);

  if (points.length === 0) {
    return (
      <p className="field-help">
        No overlapping visit days yet. Import timeline history for both of you, then
        come back.
      </p>
    );
  }

  const active = hover !== null ? points[hover] : null;
  const tip = active
    ? buildTip(active, peerName)
    : 'Hover the line to see what their privacy allows.';

  return (
    <div className="chart-wrap">
      <svg
        className="distance-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Distance from ${peerName} over time`}
        onMouseLeave={() => setHover(null)}
      >
        <line
          className="chart-axis"
          x1={pad.left}
          y1={height - pad.bottom}
          x2={width - pad.right}
          y2={height - pad.bottom}
        />
        <line
          className="chart-axis"
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={height - pad.bottom}
        />
        <text className="chart-label" x={pad.left - 8} y={pad.top + 4} textAnchor="end">
          {Math.round(maxKm * 0.621371).toLocaleString()} mi
        </text>
        <text
          className="chart-label"
          x={pad.left - 8}
          y={height - pad.bottom}
          textAnchor="end"
        >
          0
        </text>
        <path className="chart-line" d={path} fill="none" />
        {points.map((pt, i) => {
          const x =
            pad.left +
            (points.length <= 1
              ? (width - pad.left - pad.right) / 2
              : (i / (points.length - 1)) * (width - pad.left - pad.right));
          const y =
            pad.top +
            (height - pad.top - pad.bottom) -
            (pt.distance_km / maxKm) * (height - pad.top - pad.bottom);
          return (
            <circle
              key={pt.day}
              className={hover === i ? 'chart-dot active' : 'chart-dot'}
              cx={x}
              cy={y}
              r={hover === i ? 5 : 3.5}
              onMouseEnter={() => setHover(i)}
            />
          );
        })}
        <text className="chart-label" x={pad.left} y={height - 10}>
          {points[0].day}
        </text>
        <text
          className="chart-label"
          x={width - pad.right}
          y={height - 10}
          textAnchor="end"
        >
          {points[points.length - 1].day}
        </text>
      </svg>
      <p className="chart-tip">{tip}</p>
    </div>
  );
}

function buildTip(pt: DistancePoint, peerName: string): string {
  const dist = distanceLabel(pt.distance_km);
  const day = pt.day;
  if (pt.their_tier === 'distance') {
    return `${day} · ${dist}`;
  }
  if (pt.their_place) {
    return `${day} · ${dist} · ${peerName} near ${pt.their_place}`;
  }
  if (pt.their_lat != null && pt.their_lng != null) {
    if (pt.their_tier === 'city') {
      return `${day} · ${dist} · near ${pt.their_lat.toFixed(2)}, ${pt.their_lng.toFixed(2)}`;
    }
    return `${day} · ${dist} · ${pt.their_lat.toFixed(4)}, ${pt.their_lng.toFixed(4)}`;
  }
  return `${day} · ${dist}`;
}
