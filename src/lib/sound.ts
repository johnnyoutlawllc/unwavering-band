/*
 * One low, peaceful drone. Two sine waves a fifth apart over a sub octave,
 * breathing slowly, behind a lowpass filter. Proximity to a band opens the
 * filter and lifts the level a little, so moving the mouse toward the light
 * feels like leaning toward it. Nothing in here is loud and nothing is sudden:
 * every parameter change goes through setTargetAtTime so it glides.
 */

export class Drone {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private near: GainNode | null = null;

  get running(): boolean {
    return this.ctx !== null;
  }

  start() {
    if (this.ctx) return;
    const ctx = new AudioContext();

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 0.4;
    filter.connect(master);

    // Proximity level rides on top of a quiet floor.
    const near = ctx.createGain();
    near.gain.value = 0;
    near.connect(filter);

    const voices: Array<[number, number]> = [
      [55, 0.5], // sub
      [110, 0.35], // root
      [164.81, 0.22], // fifth
    ];
    for (const [freq, level] of voices) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g);
      g.connect(near);

      // A hair of slow detune so the voices beat gently against each other.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.06 + Math.random() * 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.9;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      lfo.start();
      osc.start();
    }

    // Slow breathing on the whole thing.
    const breath = ctx.createOscillator();
    breath.frequency.value = 0.08;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.012;
    breath.connect(breathGain);
    breathGain.connect(master.gain);
    breath.start();

    master.gain.setTargetAtTime(0.05, ctx.currentTime, 1.2);

    this.ctx = ctx;
    this.master = master;
    this.filter = filter;
    this.near = near;
  }

  /** p is 0 far from any band, 1 right on one. */
  setProximity(p: number) {
    if (!this.ctx || !this.filter || !this.near) return;
    const t = this.ctx.currentTime;
    this.near.gain.setTargetAtTime(0.25 + p * 0.75, t, 0.25);
    this.filter.frequency.setTargetAtTime(180 + p * 720, t, 0.25);
  }

  stop() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    this.ctx = null;
    this.master = null;
    this.filter = null;
    this.near = null;
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 2000);
  }
}
