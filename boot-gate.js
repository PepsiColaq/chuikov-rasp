/* Синхронно до отрисовки body: не мигать заставкой при F5 */
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
    if (sessionStorage.getItem('rasp_splash_seen_v1') === '1') {
      document.documentElement.classList.add('boot-skip-splash')
    }
  } catch (_) {
    /* ignore */
  }
})()
