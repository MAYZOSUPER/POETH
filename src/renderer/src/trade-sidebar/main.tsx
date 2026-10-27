import React from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/globals.css'

// Сайдбар трейд-окна (sidebarView рядом с siteView pathofexile.com).
// TODO S5: папки избранного, сохранить текущий поиск, импорт/экспорт Better Trading.
function TradeSidebarApp() {
  return <div className="stub-page">POETH trade sidebar — TODO S5</div>
}

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <TradeSidebarApp />
    </React.StrictMode>
  )
}
