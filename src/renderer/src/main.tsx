import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SplashView, UpdateView } from './updates/ServiceViews'
import './styles/globals.css'

// index.html — окно компаньона; ?view=splash | ?view=update — служебные окна запуска и
// обновлений (S10a, src/main/windows/serviceWindows.ts).
const view = new URLSearchParams(window.location.search).get('view')
const Root = view === 'splash' ? SplashView : view === 'update' ? UpdateView : App
if (Root !== App) document.body.classList.add('svc-body')

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>
  )
}
