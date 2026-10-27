// Звук новой находки live (WebAudio, без файлов): короткое восходящее «динь-динь»,
// отличается от сигнала входящей сделки. Не чаще раза в 1.2 с, сколько бы ни пришло находок.

let audio: AudioContext | null = null
let last = 0

export function playLiveChime(volume: number): void {
  const now = Date.now()
  if (volume <= 0 || now - last < 1200) return
  last = now
  try {
    audio ??= new AudioContext()
    const ctx = audio
    const t0 = ctx.currentTime
    for (const [i, freq] of [784, 1047].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      const start = t0 + i * 0.09
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.22 * volume, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.3)
    }
  } catch {
    // нет аудиоустройства — молча
  }
}
