/**
 * AudioSystem.ts - Síntese procedural de efeitos sonoros sci-fi via Web Audio API.
 * Não requer arquivos externos de áudio, garantindo carregamento instantâneo e livre de falhas de rede.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    // AudioContext é iniciado sob demanda após interação do usuário
  }

  private initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  /**
   * Disparo Sci-Fi de Plasma/Laser estilo Leon RE4 tático
   * Transiente percussivo com sweep de frequência descendente e harmônicos
   */
  public playLaserShot() {
    if (this.isMuted) return;
    const ctx = this.initContext();
    const now = ctx.currentTime;

    // 1. Oscilador principal de plasma (Sawtooth com queda de pitch)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    // Filtro passa-baixa para dar calor metálico
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4500, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.14);

    // 2. Ruído de transiente mecânico (Muzzle Blast)
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.015));
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    noiseSource.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noiseSource.start(now);
  }

  /**
   * Impacto padrão em alvos holográficos
   */
  public playHit() {
    if (this.isMuted) return;
    const ctx = this.initContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Bullseye / Headshot: Tom triunfante cristalino
   */
  public playBullseye() {
    if (this.isMuted) return;
    const ctx = this.initContext();
    const now = ctx.currentTime;

    const freqs = [1046.5, 1318.5, 1567.98]; // Acorde C6, E6, G6
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.02);

      gain.gain.setValueAtTime(0.18, now + idx * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.02 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.02);
      osc.stop(now + idx * 0.02 + 0.36);
    });
  }

  /**
   * Recarga de célula de energia: sweep ascendente com trava mecânica no final
   */
  public playReload() {
    if (this.isMuted) return;
    const ctx = this.initContext();
    const now = ctx.currentTime;

    // Sweep ascendente de capacitor
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(960, now + 0.6);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.65);

    // Trava de encaixe mecânico (Lock Click)
    setTimeout(() => {
      if (this.isMuted || !this.ctx) return;
      const c = this.ctx;
      const t = c.currentTime;
      const clickOsc = c.createOscillator();
      const clickGain = c.createGain();

      clickOsc.type = 'square';
      clickOsc.frequency.setValueAtTime(1400, t);
      clickOsc.frequency.exponentialRampToValueAtTime(300, t + 0.05);

      clickGain.gain.setValueAtTime(0.3, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      clickOsc.connect(clickGain);
      clickGain.connect(c.destination);

      clickOsc.start(t);
      clickOsc.stop(t + 0.06);
    }, 600);
  }

  /**
   * Clique de munição esgotada (Dry Fire)
   */
  public playEmptyClick() {
    if (this.isMuted) return;
    const ctx = this.initContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.035);
  }

  /**
   * Efeito ao atingir marco de combo alto
   */
  public playComboUp() {
    if (this.isMuted) return;
    const ctx = this.initContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(659.25, now); // E5
    osc.frequency.setValueAtTime(880.00, now + 0.07); // A5

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }
}
