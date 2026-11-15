// Утилита: обновить список, не давая странице прыгнуть наверх.
//
// Проблема: replaceChildren() опустошает контейнер на один кадр. Документ
// становится короче, браузер подрезает scrollTop — и человек оказывается
// наверху. На телефоне это выглядит как «сайт сам себя прокрутил».
//
// Решение: запомнить позицию прокрутки окна и панели до замены, вернуть
// сразу и ещё раз в следующем кадре (высота может измениться из-за шрифтов).

/** Кто сейчас в фокусе и где стоял курсор — чтобы вернуть после пересборки. */
export function captureFocus() {
  const node = document.activeElement
  if (!node || node === document.body) return null
  const isField =
    node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable
  if (!isField) return null
  return {
    node,
    value: node.value,
    start: typeof node.selectionStart === 'number' ? node.selectionStart : null,
    end: typeof node.selectionEnd === 'number' ? node.selectionEnd : null,
    id: node.id || '',
    name: node.getAttribute?.('name') || '',
    type: node.type || '',
    placeholder: node.getAttribute?.('placeholder') || '',
  }
}

/** Вернуть фокус и текст после пересборки (поиск — по id/name/типу/placeholder). */
export function restoreFocus(snap, root = document) {
  if (!snap) return
  let node = null
  if (snap.id) node = root.querySelector(`#${snap.id}`)
  if (!node && snap.name) node = root.querySelector(`[name="${snap.name}"]`)
  if (!node && snap.placeholder) node = root.querySelector(`[placeholder="${snap.placeholder}"]`)
  if (!node) return
  if (node.value !== snap.value) node.value = snap.value
  try {
    node.focus({ preventScroll: true })
    if (snap.start != null && typeof node.setSelectionRange === 'function') {
      node.setSelectionRange(snap.start, snap.end ?? snap.start)
    }
  } catch {
    /* ignore */
  }
}

/**
 * Заменить содержимое контейнера, сохранив прокрутку страницы и панели.
 * `build` — функция, возвращающая новые узлы (или сам массив узлов).
 */
export function swapKeepScroll(container, build, { pane } = {}) {
  if (!container) return
  const win = typeof window !== 'undefined' ? window : null
  const scrollY = win ? win.scrollY || win.document.documentElement.scrollTop || 0 : 0
  const paneEl = pane || container.closest?.('.tab-pane')
  const paneTop = paneEl ? paneEl.scrollTop : 0
  const focusSnap = captureFocus()

  const nodes = typeof build === 'function' ? build() : build
  if (Array.isArray(nodes)) container.replaceChildren(...nodes)
  else if (nodes) container.replaceChildren(nodes)
  else container.replaceChildren()

  const apply = () => {
    if (paneEl && paneEl.isConnected) paneEl.scrollTop = paneTop
    if (win) win.scrollTo(0, scrollY)
  }
  apply()
  if (win && typeof win.requestAnimationFrame === 'function') {
    win.requestAnimationFrame(() => {
      apply()
      win.requestAnimationFrame(apply)
    })
  }
  restoreFocus(focusSnap, container.ownerDocument || document)
}
