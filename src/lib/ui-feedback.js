// Мелкие отклики интерфейса: тосты, вибрация, анимации, паузы.
// Вынесено из main.js: этим пользуются почти все экраны, и держать их
// в одном файле с версткой было неудобно.
//
// Важно: flash() раньше вызывал render() напрямую — теперь функция
// отрисовки внедряется из main.js через setRenderFn(), иначе получился бы
// циклический импорт main ⇄ ui-feedback.

import { el } from './security.js'

// render() остаётся в main.js — внедряется снаружи, чтобы не было циклического импорта.
let renderImpl = null
export function setRenderFn(fn) {
  renderImpl = fn
}

/**
 * false = без лёгких анимаций (бэкап: ui-backups/ui-motion-before-2026-10-01.md)
 * — резкое раскрытие ДЗ, фото в новой вкладке, прежняя смена вкладок
 */
export const UI_MOTION = true

/** false = без вибро-отклика и pull-to-refresh (бэкап: ui-backups/ui-feel-before-2026-10-02.md) */
export const UI_FEEL = true

export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function motionOk() {
  return UI_MOTION && !prefersReducedMotion()
}

/** Короткая тактильная отдача на нажатие (телефоны, где поддерживается) */
export function hapticTap(ms = 10) {
  if (!UI_FEEL) return
  try {
    if (navigator.vibrate) navigator.vibrate(ms)
  } catch {
    /* ignore */
  }
}

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export function textNode(s) {
  return document.createTextNode(s == null ? '' : String(s))
}

// Тосты живут поверх layout (на body), поэтому не сдвигают контент и переживают render().
let toastWrap = null

export function ensureToastWrap() {
  if (toastWrap && document.body.contains(toastWrap)) return toastWrap
  toastWrap = el('div', { className: 'toast-wrap', 'aria-live': 'polite', 'aria-atomic': 'true' })
  document.body.append(toastWrap)
  return toastWrap
}

export function showToast(text, isError = false) {
  const msg = (text || '').toString().trim()
  if (!msg) return
  const wrap = ensureToastWrap()
  const toast = el('div', { className: `toast${isError ? ' toast-error' : ''}`, role: 'status' }, [
    textNode(msg),
  ])
  wrap.append(toast)
  if (motionOk()) {
    requestAnimationFrame(() => toast.classList.add('is-in'))
  } else {
    toast.classList.add('is-in')
  }
  const dismiss = () => {
    if (toast.dataset.gone === '1') return
    toast.dataset.gone = '1'
    toast.classList.remove('is-in')
    toast.classList.add('is-out')
    window.setTimeout(() => toast.remove(), 280)
  }
  toast.addEventListener('click', dismiss)
  window.setTimeout(dismiss, 2800)
}

// Оставлено для совместимости: баннер больше не рисуем, сообщения идут тостами.
export function paintFlashSlot() {
  const slot = document.getElementById('flash-slot')
  if (slot) slot.replaceChildren()
}

export function flash(text, isError = false) {
  showToast(text, isError)
  renderImpl({ force: true })
}
