'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { haversineKm } from '@/lib/geo';
import { Drone } from '@/lib/sound';
import { DEFAULT_BAND_COLOR } from './SettingsModal';

/*
 * The heart of the site. Every signed in person on the page right now is one
 * vertical band of light on a shared canvas. You are the band in the middle.
 * Everyone else stands to your left or right, and how far away they stand is
 * how far away they really are: kilometres, log scaled so that across town
 * and across the ocean both fit on one screen.
 *
 * Presence rides Supabase Realtime. Nobody's coordinates touch a table for
 * this: each client announces name, colour and last reading into the channel,
 * and the channel is only readable by other signed in clients on the page.
 */

type PresencePayload = {
  name: string;
  color: string | null;
  lat: number | null;
  lng: number | null;
};

type OtherBand = PresencePayload & { key: string };

type DrawnBand = {
  key: string;
  targetFrac: number; // -0.5..0.5 offset from centre, as a fraction of width
  frac: number; // eased current position
  color: string | null;
  phase: number;
};

function hashPhase(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000 * Math.PI * 2;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [255, 176, 102];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Kilometres to a screen offset fraction. Log scale, capped at the edges. */
function kmToFrac(km: number): number {
  return Math.min(0.42, 0.02 + 0.085 * Math.log10(1 + km));
}

export function Bandscape() {
  const { user, profile, displayName } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [others, setOthers] = useState<OtherBand[]>([]);
  const [soundOn, setSoundOn] = useState(false);

  const droneRef = useRef<Drone | null>(null);
  const mouseRef = useRef<{ x: number; y: number; inside: boolean }>({
    x: -1,
    y: -1,
    inside: false,
  });

  const myColor = profile?.band_color ?? null;
  const myLat = profile?.location_sharing ? profile?.last_lat ?? null : null;
  const myLng = profile?.location_sharing ? profile?.last_lng ?? null : null;

  /* ---------- presence ---------- */

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('bands', {
      config: { presence: { key: user.id } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresencePayload>();
      const list: OtherBand[] = [];
      for (const [key, metas] of Object.entries(state)) {
        if (key === user.id || metas.length === 0) continue;
        const m = metas[metas.length - 1];
        list.push({
          key,
          name: m.name,
          color: m.color ?? null,
          lat: m.lat ?? null,
          lng: m.lng ?? null,
        });
      }
      list.sort((a, b) => a.key.localeCompare(b.key));
      setOthers(list);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          name: displayName ?? 'someone',
          color: myColor,
          lat: myLat,
          lng: myLng,
        } satisfies PresencePayload);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, displayName, myColor, myLat, myLng]);

  /* ---------- layout: geography to screen positions ---------- */

  const targets = useMemo(() => {
    const placed: Array<{ key: string; frac: number; color: string | null }> = [
      { key: 'self', frac: 0, color: myColor },
    ];
    let unknown = 0;
    for (const o of others) {
      let frac: number;
      if (myLat !== null && myLng !== null && o.lat !== null && o.lng !== null) {
        const km = haversineKm(myLat, myLng, o.lat, o.lng);
        const dir = o.lng >= myLng ? 1 : -1;
        frac = dir * kmToFrac(km);
      } else {
        // No fix on one side or the other: stand them at a calm default,
        // alternating sides so the picture stays balanced.
        const side = unknown % 2 === 0 ? 1 : -1;
        frac = side * (0.16 + 0.07 * Math.floor(unknown / 2));
        unknown++;
      }
      placed.push({ key: o.key, frac, color: o.color });
    }

    // Keep neighbours from standing inside each other.
    placed.sort((a, b) => a.frac - b.frac);
    for (let i = 1; i < placed.length; i++) {
      if (placed[i].frac - placed[i - 1].frac < 0.04) {
        placed[i].frac = placed[i - 1].frac + 0.04;
      }
    }
    for (const p of placed) p.frac = Math.max(-0.46, Math.min(0.46, p.frac));
    return placed;
  }, [others, myLat, myLng, myColor]);

  /* ---------- sound ---------- */

  useEffect(() => {
    if (soundOn) {
      const d = new Drone();
      d.start();
      droneRef.current = d;
      return () => {
        d.stop();
        droneRef.current = null;
      };
    }
  }, [soundOn]);

  /* ---------- the canvas ---------- */

  const bandsRef = useRef<DrawnBand[]>([]);

  useEffect(() => {
    const prev = new Map(bandsRef.current.map((b) => [b.key, b.frac]));
    bandsRef.current = targets.map((t) => ({
      key: t.key,
      targetFrac: t.frac,
      frac: prev.get(t.key) ?? t.frac,
      color: t.color,
      phase: hashPhase(t.key),
    }));
  }, [targets]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function onMove(e: PointerEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY, inside: true };
    }
    function onLeave() {
      mouseRef.current.inside = false;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerout', onLeave);

    const SEGMENTS = 30;

    function drawBand(b: DrawnBand, t: number) {
      const x = width / 2 + b.frac * width;
      const mouse = mouseRef.current;

      // How near is the cursor to this band, horizontally.
      const near = mouse.inside
        ? Math.exp(-((mouse.x - x) ** 2) / (2 * 120 ** 2))
        : 0;

      // Shimmer: two slow sines beating against each other, never zero.
      const shimmer =
        0.62 +
        0.22 * Math.sin(t * 0.7 + b.phase) * Math.sin(t * 1.31 + b.phase * 2.7) +
        0.16 * near;

      const [r, g, bl] = hexToRgb(b.color ?? DEFAULT_BAND_COLOR);
      const isDefault = b.color === null;

      // The band bends softly away from the cursor around the cursor's height.
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= SEGMENTS; i++) {
        const y = (height * i) / SEGMENTS;
        let dx =
          Math.sin(y * 0.006 + t * 0.5 + b.phase) * 1.4 +
          Math.sin(y * 0.013 - t * 0.33 + b.phase * 3) * 0.8;
        if (mouse.inside && near > 0.01) {
          const along = Math.exp(-((mouse.y - y) ** 2) / (2 * 150 ** 2));
          dx += Math.sign(x - mouse.x || 1) * near * along * 14;
        }
        pts.push([x + dx, y]);
      }

      function trace() {
        ctx!.beginPath();
        ctx!.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i <= SEGMENTS; i++) ctx!.lineTo(pts[i][0], pts[i][1]);
      }

      const fade = ctx!.createLinearGradient(0, 0, 0, height);
      const stop = (a: number) => `rgba(${r}, ${g}, ${bl}, ${a})`;
      fade.addColorStop(0, stop(0));
      fade.addColorStop(0.22, stop(1));
      fade.addColorStop(0.78, stop(1));
      fade.addColorStop(1, stop(0));

      ctx!.lineCap = 'round';

      // Outer glow, mid glow, then the core. The default colour keeps an
      // orange glow and a white heart: the blend of orange and white.
      ctx!.globalAlpha = shimmer * (0.10 + near * 0.10);
      ctx!.lineWidth = 26 + near * 10;
      ctx!.strokeStyle = fade;
      trace();
      ctx!.stroke();

      ctx!.globalAlpha = shimmer * (0.3 + near * 0.2);
      ctx!.lineWidth = 7 + near * 3;
      ctx!.strokeStyle = fade;
      trace();
      ctx!.stroke();

      const core = ctx!.createLinearGradient(0, 0, 0, height);
      const coreColor = isDefault
        ? (a: number) => `rgba(255, 249, 240, ${a})`
        : (a: number) =>
            `rgba(${Math.min(255, r + 130)}, ${Math.min(255, g + 130)}, ${Math.min(
              255,
              bl + 130,
            )}, ${a})`;
      core.addColorStop(0, coreColor(0));
      core.addColorStop(0.24, coreColor(1));
      core.addColorStop(0.76, coreColor(1));
      core.addColorStop(1, coreColor(0));

      ctx!.globalAlpha = shimmer * (0.75 + near * 0.25);
      ctx!.lineWidth = 1.6 + near * 1.2;
      ctx!.strokeStyle = core;
      trace();
      ctx!.stroke();

      ctx!.globalAlpha = 1;
      return near;
    }

    let last = performance.now();
    function frame(now: number) {
      const t = now / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      ctx!.clearRect(0, 0, width, height);
      ctx!.globalCompositeOperation = 'lighter';

      let maxNear = 0;
      for (const b of bandsRef.current) {
        // Ease each band toward where it belongs, so joins and moves glide.
        b.frac += (b.targetFrac - b.frac) * Math.min(1, dt * 2.2);
        maxNear = Math.max(maxNear, drawBand(b, t));
      }

      ctx!.globalCompositeOperation = 'source-over';
      droneRef.current?.setProximity(maxNear);

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerout', onLeave);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="bandscape" aria-hidden="true" />
      <button
        className="sound-toggle"
        onClick={() => setSoundOn((v) => !v)}
        aria-pressed={soundOn}
        title={soundOn ? 'Turn sound off' : 'Turn sound on'}
      >
        {soundOn ? (
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 9v6h4l5 4V5L8 9H4z"
              fill="currentColor"
            />
            <path
              d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
            <path
              d="M16 9l6 6M22 9l-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
    </>
  );
}
