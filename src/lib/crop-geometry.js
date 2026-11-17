// Геометрия рамки кадрирования: чистые функции, без DOM и canvas.
//
// Зачем отдельно: редактор используется в двух местах — аватар в профиле
// (круг) и фото события в ленте (прямоугольник 16:10). Пропорции легко
// перепутать местами, а проверить внутри DOM-кода нельзя. Здесь — можно.

/** Привести соотношение сторон к безопасному числу. Кривое → квадрат. */
export function normalizeRatio(ratio) {
  const n = Number(ratio)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * Размер рамки предпросмотра.
 * Длинная сторона фиксирована, короткая — по соотношению.
 *
 * @param {number} ratio ширина / высота
 * @param {number} [long] длинная сторона в пикселях
 */
export function frameSize(ratio, long = 260) {
  const ar = normalizeRatio(ratio)
  return ar >= 1
    ? { width: long, height: Math.round(long / ar) }
    : { width: Math.round(long * ar), height: long }
}

/**
 * Размер выходного файла. Тоже с сохранением пропорций.
 *
 * @param {number} ratio ширина / высота
 * @param {number} [long] длинная сторона в пикселях (320…2400)
 */
export function outputSize(ratio, long = 1600) {
  const ar = normalizeRatio(ratio)
  const safeLong = Math.max(320, Math.min(2400, Number(long) || 1600))
  return ar >= 1
    ? { width: safeLong, height: Math.round(safeLong / ar) }
    : { width: Math.round(safeLong * ar), height: safeLong }
}

/** Круглая ли рамка: только когда это аватар и соотношение ровно 1:1. */
export function isRoundFrame(shape, ratio) {
  return shape !== 'square' && Math.abs(normalizeRatio(ratio) - 1) < 0.001
}
