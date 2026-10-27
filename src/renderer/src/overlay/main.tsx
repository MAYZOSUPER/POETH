import React from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/globals.css'

// Игровой оверлей (прозрачное окно поверх игры, attach к окну PoE).
// TODO S1: окно прайс-чека (сырой текст предмета → S4), тосты live (S6),
// карточки сделок и подсветка стэша (S8); Esc/Shift+Space → фокус в игру.
function OverlayApp() {
  return <div className="stub-page">POETH overlay — TODO S1</div>
}

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <OverlayApp />
    </React.StrictMode>
  )
}
