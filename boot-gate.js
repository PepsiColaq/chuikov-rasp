/* Синхронно до отрисовки body: тема, skip-splash, сразу класс ПК (без мигания 480px).
   Не используем sessionStorage: после «убить Chrome» Android часто
   восстанавливает вкладку вместе с sessionStorage — и заставка тогда
   ошибочно скрывалась, оставался пустой экран / «Загрузка…». */
;(function () {
  try {
    var theme = localStorage.getItem('rasp_theme_v1')
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme)
    }
  } catch (_) {
    /* ignore */
  }
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0]
    var isReload = nav
      ? nav.type === 'reload'
      : performance.navigation && performance.navigation.type === 1
    if (isReload) {
      document.documentElement.classList.add('boot-skip-splash')
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      document.documentElement.classList.add('is-desktop')
    }
  } catch (_) {
    /* ignore */
  }
})()
