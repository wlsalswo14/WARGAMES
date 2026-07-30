import type { FactionId, ProjectileAttackMode, UnitKind } from '../types';

export class BattleAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicTimer = 0;
  private beat = 0;
  private shotGate = 0;
  private explosionGate = 0;

  resume(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.19;
      this.master.connect(this.context.destination);
    }
    void this.context.resume();
  }

  update(delta: number, running: boolean, intense: boolean): void {
    this.shotGate = Math.max(0, this.shotGate - delta);
    this.explosionGate = Math.max(0, this.explosionGate - delta);
    if (!running || !this.context) {
      return;
    }
    this.musicTimer -= delta;
    if (this.musicTimer > 0) {
      return;
    }
    this.musicTimer = intense ? 0.32 : 0.48;
    const sequence = intense
      ? [55, 65.41, 73.42, 82.41]
      : [55, 55, 49, 61.74];
    const note = sequence[this.beat % sequence.length] ?? 55;
    this.tone(note, 0.1, 'sawtooth', 0.028, -12);
    if (this.beat % 4 === 2) {
      this.noise(0.035, 0.015, 1500);
    }
    this.beat += 1;
  }

  command(): void {
    this.tone(310, 0.07, 'triangle', 0.05, 120);
    window.setTimeout(() => this.tone(455, 0.08, 'triangle', 0.045, 80), 65);
  }

  link(connected: boolean): void {
    const notes = connected ? [190, 285, 420] : [420, 285, 190];
    notes.forEach((note, index) => {
      window.setTimeout(
        () => this.tone(note, 0.12, 'sine', 0.055, connected ? 100 : -50),
        index * 55,
      );
    });
  }

  fire(kind: UnitKind, mode: ProjectileAttackMode): void {
    if (this.shotGate > 0) {
      return;
    }
    this.shotGate = mode === 'special' ? 0.08 : 0.035;
    if (mode === 'special') {
      this.tone(kind === 'tank' ? 78 : 108, 0.24, 'sawtooth', 0.13, 520);
      this.noise(0.13, 0.09, 900);
      return;
    }
    const frequency = kind === 'tank'
      ? 145
      : kind === 'infantry'
        ? 310
        : kind === 'general'
          ? 265
          : 220;
    this.tone(frequency, 0.055, 'square', 0.035, -80);
  }

  explosion(scale: number): void {
    if (this.explosionGate > 0) {
      return;
    }
    this.explosionGate = 0.08;
    const volume = Math.min(0.15, 0.045 + scale * 0.008);
    this.tone(72, 0.25, 'sawtooth', volume, -32);
    this.noise(0.2, volume * 0.72, 700);
  }

  capture(faction: FactionId): void {
    const base = faction === 'azure' ? 246.94 : faction === 'crimson' ? 174.61 : 220;
    [base, base * 1.25, base * 1.5].forEach((note, index) => {
      window.setTimeout(
        () => this.tone(note, 0.18, 'triangle', 0.065, 40),
        index * 85,
      );
    });
  }

  result(victory: boolean): void {
    const notes = victory
      ? [261.63, 329.63, 392, 523.25]
      : [196, 164.81, 130.81, 98];
    notes.forEach((note, index) => {
      window.setTimeout(
        () => this.tone(note, 0.28, victory ? 'triangle' : 'sawtooth', 0.075, 25),
        index * 120,
      );
    });
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    sweep: number,
  ): void {
    if (!this.context || !this.master) {
      return;
    }
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(24, frequency + sweep),
      now + duration,
    );
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private noise(duration: number, volume: number, cutoff: number): void {
    if (!this.context || !this.master) {
      return;
    }
    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
  }
}
