import { useAppStore } from '../store/useAppStore'

export function SettingsPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const settings = useAppStore((s) => s.settings)
  const tailerStatus = useAppStore((s) => s.tailerStatus)
  const patchSettings = useAppStore((s) => s.patchSettings)
  const tailerStart = useAppStore((s) => s.tailerStart)
  const tailerStop = useAppStore((s) => s.tailerStop)
  const tailerPickFile = useAppStore((s) => s.tailerPickFile)
  const meta = dataset?.meta

  return (
    <section className="panel settings">
      <div className="panel-head">
        <span>Настройки</span>
      </div>

      <div className="setting">
        <label>Прозрачность</label>
        <input
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={settings?.opacity ?? 0.95}
          onChange={(e) => void patchSettings({ opacity: Number(e.target.value) })}
        />
      </div>

      <label className="row-toggle">
        <input
          type="checkbox"
          checked={settings?.showInTaskbar ?? true}
          onChange={(e) => void patchSettings({ showInTaskbar: e.target.checked })}
        />
        Показывать на панели задач
      </label>

      <div className="hint small muted">
        Игра должна работать в режиме «Окно» или «Окно без рамки». В эксклюзивном полноэкранном
        режиме оверлей не отображается.
      </div>

      <div className="block">
        <div className="block-title">Горячие клавиши</div>
        <ul className="kv">
          <li>
            <span>Показать/скрыть</span>
            <code>{settings?.hotkeys.toggleVisible}</code>
          </li>
          <li>
            <span>Блокировка кликов</span>
            <code>{settings?.hotkeys.toggleLock}</code>
          </li>
          <li>
            <span>Пред. зона</span>
            <code>{settings?.hotkeys.prevStep}</code>
          </li>
          <li>
            <span>След. зона</span>
            <code>{settings?.hotkeys.nextStep}</code>
          </li>
        </ul>
      </div>

      <div className="block">
        <div className="block-title">Автоопределение зоны (Client.txt)</div>
        <label className="row-toggle">
          <input
            type="checkbox"
            checked={settings?.tailerEnabled ?? false}
            onChange={(e) => void (e.target.checked ? tailerStart() : tailerStop())}
          />
          Читать лог игры (подсветка текущей зоны и уровня)
        </label>
        <div className="small muted">
          {tailerStatus?.running
            ? tailerStatus.found
              ? `✓ Лог найден: ${tailerStatus.logPath}`
              : '⚠ Client.txt не найден — укажите файл вручную'
            : 'Выключено'}
        </div>
        <button className="btn" onClick={() => void tailerPickFile()}>
          Указать Client.txt…
        </button>
        <label className="row-toggle">
          <input
            type="checkbox"
            checked={settings?.autoAdvanceZone ?? true}
            onChange={(e) => void patchSettings({ autoAdvanceZone: e.target.checked })}
          />
          Авто-переход к текущей зоне
        </label>
        <div className="small muted">
          Подсвечивает зону и уровень из лога (безопасно, только чтение). Завершение квестов всегда
          отмечается вручную — в игре нет такого сигнала.
        </div>
      </div>

      <div className="block">
        <div className="block-title">Данные</div>
        <div className="small muted">Версия данных: {meta?.gameVersionLabel}</div>
        <div className="small muted">
          Схема {meta?.schemaVersion} · актов: {meta?.actCount}
        </div>
        <ul className="sources small muted">
          {meta?.sources.map((s, i) => (
            <li key={i}>
              {s.name} — {s.license}
            </li>
          ))}
        </ul>
      </div>

      <div className="disclaimer small muted">
        Неофициальный фанатский инструмент. Не связан с Grinding Gear Games. Path of Exile 2 и все
        ассеты © GGG.
      </div>
    </section>
  )
}
