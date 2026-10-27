import React from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/globals.css'
import './trade-sidebar.css'
import { TradeSidebarApp } from './App'

// Сайдбар трейд-окна (sidebarView рядом с siteView pathofexile.com), этап S5.

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <TradeSidebarApp />
    </React.StrictMode>
  )
}
