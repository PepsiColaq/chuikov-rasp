/* Синхронно до отрисовки body: не мигать заставкой при F5.
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
})()
