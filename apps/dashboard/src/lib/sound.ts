// Bipe curto via Web Audio (sem arquivo) para alertas sonoros.
let ctx: AudioContext | null = null;

export function beep(times = 2): void {
  try {
    ctx = ctx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    let t = ctx.currentTime;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
      t += 0.22;
    }
  } catch {
    /* áudio bloqueado até interação do usuário */
  }
}
