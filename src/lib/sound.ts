/*
 * The sound of being underwater with the lights. Two layers:
 *
 * Ocean: brown noise, deeply lowpassed, swelling on two slow out of phase
 * LFOs so the waves never repeat exactly. This is the floor that is always
 * there while sound is on.
 *
 * Whale: a single soft sine voice with a little vibrato and an echo, that
 * calls every so often: a slow pitch glide up or down, swelling in and
 * fading out. Never on a schedule you could set a watch by.
 *
 * Proximity to a band opens the lowpass and lifts the level, so leaning the
 * mouse toward the light brightens the water. Every parameter change glides
 * through setTargetAtTime or a ramp. Nothing clicks, nothing startles.
 */

export class Drone {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private brightness: BiquadFilterNode | null = null;
  private proximity: GainNode | null = null;
  private whaleOsc: OscillatorNode | null = null;
  private whaleGain: GainNode | null = null;
  private whaleTimer: ReturnType<typeof setTimeout> | null = null;

  // 0..1 from the volume slider, on top of the built in level.
  private baseVolume = 1;
  private static readonly LEVEL = 0.24;

  get running(): boolean {
    return this.ctx !== null;
  }

  start() {
    if (this.ctx) return;
    const ctx = new AudioContext();

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Everything passes through one brightness filter that proximity opens.
    const brightness = ctx.createBiquadFilter();
    brightness.type = 'lowpass';
    brightness.frequency.value = 480;
    brightness.Q.value = 0.4;

    const proximity = ctx.createGain();
    proximity.gain.value = 0.75;
    brightness.connect(proximity);
    proximity.connect(master);

    /* ---------- the ocean ---------- */

    // Brown noise: integrated white noise. Sounds like deep water, not static.
    const seconds = 6;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const oceanFilter = ctx.createBiquadFilter();
    oceanFilter.type = 'lowpass';
    oceanFilter.frequency.value = 420;
    oceanFilter.Q.value = 0.3;

    const swell = ctx.createGain();
    swell.gain.value = 0.5;

    noise.connect(oceanFilter);
    oceanFilter.connect(swell);
    swell.connect(brightness);
    noise.start();

    // Two slow tides at unrelated rates so the swells stay irregular.
    for (const [rate, depth] of [
      [0.071, 0.26],
      [0.113, 0.16],
    ] as const) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = depth;
      lfo.connect(lfoGain);
      lfoGain.connect(swell.gain);
      lfo.start();
    }

    /* ---------- the whale ---------- */

    const whaleOsc = ctx.createOscillator();
    whaleOsc.type = 'sine';
    whaleOsc.frequency.value = 220;

    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.2;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = 6;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(whaleOsc.detune);
    vibrato.start();

    const whaleGain = ctx.createGain();
    whaleGain.gain.value = 0;
    whaleOsc.connect(whaleGain);
    whaleOsc.start();

    // A soft echo so the call sounds like it crossed a lot of water.
    const echo = ctx.createDelay(1.5);
    echo.delayTime.value = 0.55;
    const echoLevel = ctx.createGain();
    echoLevel.gain.value = 0.35;
    whaleGain.connect(brightness);
    whaleGain.connect(echo);
    echo.connect(echoLevel);
    echoLevel.connect(echo);
    echoLevel.connect(brightness);

    master.gain.setTargetAtTime(Drone.LEVEL * this.baseVolume, ctx.currentTime, 1.2);

    this.ctx = ctx;
    this.master = master;
    this.brightness = brightness;
    this.proximity = proximity;
    this.whaleOsc = whaleOsc;
    this.whaleGain = whaleGain;

    this.scheduleWhale(3000 + Math.random() * 4000);
  }

  private scheduleWhale(delayMs: number) {
    this.whaleTimer = setTimeout(() => {
      this.whaleCall();
      this.scheduleWhale(8000 + Math.random() * 9000);
    }, delayMs);
  }

  private whaleCall() {
    const ctx = this.ctx;
    const osc = this.whaleOsc;
    const gain = this.whaleGain;
    if (!ctx || !osc || !gain) return;

    const t = ctx.currentTime;
    const dur = 2.2 + Math.random() * 1.8;
    const f0 = 150 + Math.random() * 160;
    const glide = 0.65 + Math.random() * 0.9; // below 1 falls, above 1 rises
    const f1 = Math.max(90, Math.min(420, f0 * glide));

    osc.frequency.cancelScheduledValues(t);
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);

    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0.11, t, dur * 0.28);
    gain.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.32);
  }

  /** v is the slider, 0..1. Glides like everything else. */
  setVolume(v: number) {
    this.baseVolume = Math.max(0, Math.min(1, v));
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(
      Drone.LEVEL * this.baseVolume,
      this.ctx.currentTime,
      0.15,
    );
  }

  /** p is 0 far from any band, 1 right on one. */
  setProximity(p: number) {
    if (!this.ctx || !this.brightness || !this.proximity) return;
    const t = this.ctx.currentTime;
    this.brightness.frequency.setTargetAtTime(480 + p * 1100, t, 0.3);
    this.proximity.gain.setTargetAtTime(0.75 + p * 0.55, t, 0.3);
  }

  stop() {
    const ctx = this.ctx;
    const master = this.master;
    if (this.whaleTimer) {
      clearTimeout(this.whaleTimer);
      this.whaleTimer = null;
    }
    if (!ctx || !master) return;
    this.ctx = null;
    this.master = null;
    this.brightness = null;
    this.proximity = null;
    this.whaleOsc = null;
    this.whaleGain = null;
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 2000);
  }
}
