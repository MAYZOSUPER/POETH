// Страница тестового окна «Path of Exile» (см. fake-game.cjs). Поведение как у игры:
// Ctrl+C над предметом → текст в буфер (CRLF), Enter — чат, Ctrl+F — поиск в стэше.
/* eslint-disable */
const { clipboard, ipcRenderer } = require('electron')

const COPY_DELAY = Number(new URLSearchParams(location.search).get('delay') || 30)
const items = window.FAKE_ITEMS
const byId = Object.fromEntries(items.map((it) => [it.id, it]))

let hovered = null
let virtualHover = null
let lastCopied = ''
const chatHistory = []
let historyPos = -1
const lastWhisper = 'TestBuyer'

const $ = (id) => document.getElementById(id)
const chatInput = $('chatInput')
const search = $('search')

function emit(e) {
  ipcRenderer.send('evt', e)
}

function log(s) {
  const el = $('log')
  el.textContent = `${new Date().toLocaleTimeString()} ${s}\n` + el.textContent.slice(0, 2000)
}

function cell(it) {
  const el = document.createElement('div')
  el.className = 'item'
  if (!it) {
    el.classList.add('empty')
    el.textContent = 'пусто / empty'
    return el
  }
  el.dataset.id = it.id
  el.innerHTML = `<span style="color:${it.color}">${it.label}</span><small>${it.lang.toUpperCase()} · ${it.text[0]}</small>`
  el.addEventListener('mouseenter', () => {
    hovered = it.id
    el.classList.add('hover')
  })
  el.addEventListener('mouseleave', () => {
    if (hovered === it.id) hovered = null
    el.classList.remove('hover')
  })
  return el
}

for (const panel of ['stash', 'inv']) {
  const grid = $(panel === 'stash' ? 'stashGrid' : 'invGrid')
  for (const it of items.filter((i) => i.panel === panel)) grid.appendChild(cell(it))
  grid.appendChild(cell(null))
}

function copyItem() {
  const id = virtualHover || hovered
  const it = id && byId[id]
  if (!it) {
    log('Ctrl+C: курсор не над предметом')
    emit({ evt: 'copy', id: null })
    return
  }
  // игра кладёт текст в буфер не мгновенно
  setTimeout(() => {
    const text = it.text.join('\r\n')
    clipboard.writeText(text)
    lastCopied = text
    $('copied').textContent = text
    log(`Ctrl+C: ${it.id}`)
    emit({ evt: 'copy', id: it.id })
  }, COPY_DELAY)
}

function openChat(prefill = '') {
  chatInput.hidden = false
  chatInput.value = prefill
  chatInput.focus()
  historyPos = -1
}

function closeChat() {
  chatInput.hidden = true
  chatInput.blur()
}

function sendChat() {
  const text = chatInput.value
  if (text) {
    chatHistory.unshift(text)
    const line = document.createElement('div')
    line.textContent = `> ${text}`
    $('chatLog').appendChild(line)
    emit({ evt: 'chat', text })
    log(`чат: ${text}`)
  }
  closeChat()
}

function applySearch() {
  const q = search.value.trim().toLowerCase()
  for (const el of document.querySelectorAll('.item[data-id]')) {
    const it = byId[el.dataset.id]
    el.classList.toggle('match', !!q && it.text.join('\n').toLowerCase().includes(q))
  }
  emit({ evt: 'search', value: search.value })
  log(`поиск: ${search.value}`)
}

// Синтетические нажатия (SendInput без скан-кода — так жмёт uiohook) приходят с пустым
// e.code; игра смотрит на виртуальные коды, поэтому и мы — на keyCode.
const KEYCODE_NAMES = { 13: 'Enter', 27: 'Escape', 32: 'Space', 36: 'Home', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 46: 'Delete', 16: 'ShiftLeft', 17: 'ControlLeft', 18: 'AltLeft' }
function keyCodeName(e) {
  if (e.code) return e.code
  const kc = e.keyCode
  if (kc >= 65 && kc <= 90) return 'Key' + String.fromCharCode(kc)
  if (kc >= 48 && kc <= 57) return 'Digit' + String.fromCharCode(kc)
  return KEYCODE_NAMES[kc] || `kc${kc}`
}

window.addEventListener(
  'keydown',
  (e) => {
    const code = keyCodeName(e)
    const name = (e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.altKey ? 'Alt+' : '') + code
    if (!/^(Control|Shift|Alt)(Left|Right)$/.test(code)) emit({ evt: 'key', win: 'game', key: name })
    const inChat = document.activeElement === chatInput
    const inSearch = document.activeElement === search
    if (e.ctrlKey && code === 'KeyC') {
      if (inChat || inSearch || String(window.getSelection())) return // обычное копирование
      e.preventDefault()
      copyItem()
      return
    }
    if (e.ctrlKey && code === 'KeyF') {
      e.preventDefault()
      closeChat()
      search.focus()
      search.select()
      return
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      e.preventDefault()
      if (inSearch) {
        applySearch()
        search.blur()
      } else if (inChat && !e.ctrlKey) {
        sendChat()
      } else {
        openChat(e.ctrlKey ? `@${lastWhisper} ` : '')
      }
      return
    }
    if (code === 'Escape') {
      closeChat()
      search.blur()
      return
    }
    if (inChat && code === 'ArrowUp' && chatHistory.length) {
      e.preventDefault()
      historyPos = Math.min(historyPos + 1, chatHistory.length - 1)
      chatInput.value = chatHistory[historyPos]
    }
  },
  true
)

ipcRenderer.on('hover', (_e, id) => {
  virtualHover = id && byId[id] ? id : null
  for (const el of document.querySelectorAll('.item[data-id]')) {
    el.classList.toggle('hover', el.dataset.id === virtualHover)
  }
})

ipcRenderer.on('get-state', (_e, id) => {
  ipcRenderer.send('state', {
    id,
    state: {
      focused: document.hasFocus(),
      hovered: virtualHover || hovered,
      chatOpen: !chatInput.hidden,
      chatValue: chatInput.value,
      chatLog: chatHistory.slice(0, 5),
      search: search.value,
      lastCopiedFirstLine: lastCopied.split('\r\n')[0] || null
    }
  })
})
