import React from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/globals.css'
import './overlay.css'
import { OverlayApp } from './OverlayApp'

// Игровой оверлей (прозрачное окно поверх игры, attach к окну PoE; S1).
// Виджеты этапов подключаются через overlay/<функция>/widget.tsx (registry.ts):
// окно прайс-чека (S4), тосты live (S6), карточки сделок и подсветка стэша (S8).
const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <OverlayApp />
    </React.StrictMode>
  )
}
