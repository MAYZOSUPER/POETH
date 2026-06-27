import { useAppStore } from '../store/useAppStore'

export function SettingsPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const settings = useAppStore((s) => s.settings)
  const meta = dataset?.meta

  return (
    <section className="panel settings">
      <div className="panel-head">
        <span>Настройки</span>
      </div>

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
        <div className="block-title">Автоопределение (скоро)</div>
        <div className="small muted">
          Чтение лог-файла игры (Client.txt) для авто-подсветки текущей зоны и уровня появится в
          следующей версии. Завершение квестов всегда отмечается вручную — в логе/API игры нет
          такого сигнала.
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
