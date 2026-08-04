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
  targetScale: number; // 1 right here, shrinking with real distance
  scale: number; // eased current size
  color: string | null;
  phase: number;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  r: number;
  g: number;
  b: number;
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

/*
 * Kilometres to a size. Someone standing next to you is as big as you are;
 * someone across the world is a sliver. They grow as they come closer.
 */
function kmToScale(km: number): number {
  return Math.max(0.22, 1 - 0.175 * Math.log10(1 + km));
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
    const placed: Array<{
      key: string;
      frac: number;
      scale: number;
      color: string | null;
    }> = [{ key: 'self', frac: 0, scale: 1, color: myColor }];
    let unknown = 0;
    for (const o of others) {
      let frac: number;
      let scale: number;
      if (myLat !== null && myLng !== null && o.lat !== null && o.lng !== null) {
        const km = haversineKm(myLat, myLng, o.lat, o.lng);
        const dir = o.lng >= myLng ? 1 : -1;
        frac = dir * kmToFrac(km);
        scale = kmToScale(km);
      } else {
        // No fix on one side or the other: stand them at a calm default,
        // alternating sides so the picture stays balanced.
        const side = unknown % 2 === 0 ? 1 : -1;
        frac = side * (0.16 + 0.07 * Math.floor(unknown / 2));
        scale = 0.5;
        unknown++;
      }
      placed.push({ key: o.key, frac, scale, color: o.color });
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
    const prev = new Map(bandsRef.current.map((b) => [b.key, b]));
    bandsRef.current = targets.map((t) => ({
      key: t.key,
      targetFrac: t.frac,
      frac: prev.get(t.key)?.frac ?? t.frac,
      targetScale: t.scale,
      scale: prev.get(t.key)?.scale ?? t.scale,
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

    const sparks: Spark[] = [];
    const MAX_SPARKS = 240;

    function drawBand(b: DrawnBand, t: number, dt: number) {
      const x = width / 2 + b.frac * width;
      const mouse = mouseRef.current;
      const size = b.scale;

      // How near is the cursor to this band, horizontally. Wide bands have a
      // wider reach.
      const sigma = 90 + 120 * size;
      const near = mouse.inside
        ? Math.exp(-((mouse.x - x) ** 2) / (2 * sigma ** 2))
        : 0;

      // Shimmer: two slow sines beating against each other, never zero.
      const shimmer =
        0.62 +
        0.22 * Math.sin(t * 0.7 + b.phase) * Math.sin(t * 1.31 + b.phase * 2.7) +
        0.14 * near;

      const [r, g, bl] = hexToRgb(b.color ?? DEFAULT_BAND_COLOR);
      const isDefault = b.color === null;

      // Straight and upright. It drifts a hair as one piece, but it does not
      // bend for anything. That is the whole point of the band.
      const sway = Math.sin(t * 0.22 + b.phase) * 2.5;
      const bx = x + sway;

      // Far bands are short as well as thin: they take up less of the sky.
      const half = 0.5 * (0.45 + 0.55 * size);
      const top = 0.5 - half;
      const bottom = 0.5 + half;
      const inTop = 0.5 - half * 0.58;
      const inBottom = 0.5 + half * 0.58;

      function trace() {
        ctx!.beginPath();
        ctx!.moveTo(bx, height * top);
        ctx!.lineTo(bx, height * bottom);
      }

      const fade = ctx!.createLinearGradient(0, 0, 0, height);
      const stop = (a: number) => `rgba(${r}, ${g}, ${bl}, ${a})`;
      fade.addColorStop(top, stop(0));
      fade.addColorStop(inTop, stop(1));
      fade.addColorStop(inBottom, stop(1));
      fade.addColorStop(bottom, stop(0));

      ctx!.lineCap = 'round';

      // Outer glow, mid glow, then the core, all scaled by how close the
      // person really is. The default colour keeps an orange glow and a white
      // heart: the blend of orange and white.
      const w = 5 * size;

      ctx!.globalAlpha = shimmer * (0.09 + near * 0.07);
      ctx!.lineWidth = 26 * w;
      ctx!.strokeStyle = fade;
      trace();
      ctx!.stroke();

      ctx!.globalAlpha = shimmer * (0.26 + near * 0.14);
      ctx!.lineWidth = 7 * w;
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
      core.addColorStop(top, coreColor(0));
      core.addColorStop(Math.min(0.5, inTop + 0.02), coreColor(1));
      core.addColorStop(Math.max(0.5, inBottom - 0.02), coreColor(1));
      core.addColorStop(bottom, coreColor(0));

      ctx!.globalAlpha = shimmer * (0.75 + near * 0.25);
      ctx!.lineWidth = 1.6 * w;
      ctx!.strokeStyle = core;
      trace();
      ctx!.stroke();

      ctx!.globalAlpha = 1;

      // Sparkles where the cursor meets the light. Little embers that drift
      // off the band and wink out.
      const onBand =
        mouse.inside &&
        mouse.y > height * top &&
        mouse.y < height * bottom;
      if (onBand && near > 0.12 && sparks.length < MAX_SPARKS) {
        const expected = near * dt * 90;
        let count = Math.floor(expected);
        if (Math.random() < expected - count) count++;
        for (let i = 0; i < count; i++) {
          const away = Math.sign(Math.random() - 0.5) || 1;
          sparks.push({
            x: bx + (Math.random() - 0.5) * 4 * w,
            y: mouse.y + (Math.random() - 0.5) * 46,
            vx: away * (8 + Math.random() * 42),
            vy: -10 + (Math.random() - 0.5) * 44,
            age: 0,
            life: 0.5 + Math.random() * 0.9,
            size: 0.7 + Math.random() * 1.5,
            r: isDefault ? 255 : Math.min(255, r + 90),
            g: isDefault ? 244 : Math.min(255, g + 90),
            b: isDefault ? 224 : Math.min(255, bl + 90),
            phase: Math.random() * Math.PI * 2,
          });
        }
      }

      return near;
    }

    function drawSparks(dt: number) {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.age += dt;
        if (s.age >= s.life) {
          sparks.splice(i, 1);
          continue;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 1 - 1.4 * dt;
        s.vy = s.vy * (1 - 1.4 * dt) - 14 * dt; // a faint lift, like embers

        const fade = 1 - s.age / s.life;
        const twinkle = 0.55 + 0.45 * Math.sin(s.age * 22 + s.phase);
        ctx!.globalAlpha = fade * twinkle;
        ctx!.fillStyle = `rgba(${s.r}, ${s.g}, ${s.b}, 1)`;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.size * (0.6 + 0.4 * fade), 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
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
        b.scale += (b.targetScale - b.scale) * Math.min(1, dt * 2.2);
        maxNear = Math.max(maxNear, drawBand(b, t, dt));
      }
      drawSparks(dt);

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
