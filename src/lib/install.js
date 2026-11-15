// Установка сайта на телефон (ярлык на экран «Домой»).
// Chrome/Android умеет показать системное окно установки, iOS — только
// инструкцию словами. Отсюда отдельный набор текстов под каждую платформу.

import { flash, motionOk } from './ui-feedback.js'
import { state } from './app-state.js'
import { el } from './security.js'

export function isStandaloneApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function isIosDevice() {
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent || '')
}

export async function tryNativeInstall() {
  if (!deferredInstallPrompt) return false
  const promptEvent = deferredInstallPrompt
  deferredInstallPrompt = null
  installPromptReady = false
  promptEvent.prompt()
  const choice = await promptEvent.userChoice
  if (choice?.outcome === 'accepted') {
    flash('Добавляем на экран…')
    return true
  }
  flash('Установка отменена', true)
  return false
}

/** Шаги установки под платформу — без заголовка и кнопки. */
export function installStepsNode() {
  if (isIosDevice()) {
    return el('div', { className: 'install-steps' }, [
      el('p', { className: 'install-steps-title', text: 'iPhone (только Safari):' }),
      el('ol', {}, [
        el('li', { text: 'Открой этот сайт в Safari (не в Chrome).' }),
        el('li', { text: 'Нажми кнопку «Поделиться» (квадрат со стрелкой вверх) внизу.' }),
        el('li', { text: 'Пролистай и нажми «На экран «Домой»».' }),
        el('li', { text: 'Подтверди «Добавить» — появится иконка «Расписание».' }),
      ]),
      el('p', {
        className: 'muted',
        text: 'Apple не даёт сайтам сделать это автоматически — только через «Поделиться».',
      }),
    ])
  }
  if (isAndroidDevice()) {
    return el('div', { className: 'install-steps' }, [
      el('p', { className: 'install-steps-title', text: 'Android:' }),
      el('ol', {}, [
        el('li', { text: 'Нажми кнопку «Добавить на экран» выше — если браузер предложит установку, подтверди.' }),
        el('li', {
          text: 'Если окна не было: меню ⋮ справа сверху → «Установить приложение» или «Добавить на главный экран».',
        }),
        el('li', { text: 'Лучше открывать в Chrome.' }),
      ]),
    ])
  }
  return el('div', { className: 'install-steps' }, [
    el('p', {
      className: 'muted',
      text: 'На компьютере: в Chrome меню → «Установить Расписание…» или значок ⊕ в адресной строке.',
    }),
  ])
}

/**
 * Раскрыть/свернуть инструкцию на месте.
 *
 * Раньше кнопка вызывала render(): страница пересобиралась и прокрутка
 * прыгала наверх. Теперь сворачиваемый блок живёт в DOM постоянно,
 * а мы только переключаем класс — браузер анимирует высоту сам.
 */
export function setInstallHelpOpen(open, { animate = true } = {}) {
  state.showInstallHelp = !!open
  const folds = document.querySelectorAll('#tab-stage .tab-pane[data-tab="more"] .more-fold')
  const motion = animate && motionOk()
  for (const fold of folds) {
    if (motion) fold.classList.toggle('is-open', !!open)
    else {
      fold.classList.add('no-anim')
      fold.classList.toggle('is-open', !!open)
      void fold.offsetHeight
      fold.classList.remove('no-anim')
    }
  }
  const row = document.querySelector('#tab-stage .tab-pane[data-tab="more"] .more-row-install')
  row?.classList.toggle('is-open', !!open)
  row?.setAttribute('aria-expanded', open ? 'true' : 'false')
}

export function renderInstallCard() {
  if (isStandaloneApp()) {
    return el('p', { className: 'muted', text: 'Уже открыто как ярлык — всё ок.' })
  }
  return el('div', { className: 'install-help' }, [
    el('p', {
      className: 'muted',
      style: 'margin:0 0 8px',
      text: 'Не App Store — просто ярлык сайта. На Android часто откроется установка сразу, на iPhone покажем куда нажать. Если ярлык уже был со старым именем «Чуйков» — удали его и добавь снова.',
    }),
    el('button', {
      type: 'button',
      className: 'btn',
      text: isIosDevice() ? 'Как добавить на экран' : 'Добавить на экран',
      onClick: async () => {
        if (await tryNativeInstall()) return
        setInstallHelpOpen(true)
      },
    }),
    installPromptReady && !isIosDevice()
      ? el('p', {
          className: 'muted',
          style: 'margin:8px 0 0',
          text: 'Браузер готов установить ярлык одним нажатием.',
        })
      : null,
    installStepsNode(),
  ])
}

/** Chrome/Android native install prompt (iOS does not support this API) */
let deferredInstallPrompt = null

let installPromptReady = false

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredInstallPrompt = e
    installPromptReady = true
  })
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    installPromptReady = false
    state.showInstallHelp = false
    flash('Ярлык добавлен на экран')
  })
}
