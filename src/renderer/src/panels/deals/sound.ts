// Звук входящей сделки: короткий двухтоновый сигнал на WebAudio (без файлов). Играет оверлей
// (карточки поверх игры); в компаньоне — только кнопка «Проверить звук».

let audio: AudioContext | null = null
let lastChime = 0

/** Короткий двухтоновый сигнал (WebAudio, без файлов). Не чаще раза в 1.5 с. */
export function playChime(volume: number): void {
  const now = Date.now()
  if (now - lastChime < 1500 || volume <= 0) return
  lastChime = now
  try {
    audio ??= new AudioContext()
    const ctx = audio
    const t0 = ctx.currentTime
    for (const [i, freq] of [660, 990].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = t0 + i * 0.12
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.25 * volume, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.4)
    }
  } catch {
    // нет аудиоустройства — молча
  }
}
