// Тест геометрии кадрирования: рамка 16:10 должна давать ровно 16:10.
//
// Отдельно от DOM: считаем те же формулы, что в openImageCropEditor,
// и проверяем, что выходной файл пропорционален рамке. Если кто-то
// поменяет коэффициенты местами, тест это поймает.
import { frameSize, isRoundFrame, normalizeRatio, outputSize } from '../src/lib/crop-geometry.js'

const results = []
function check(label, ok, extra = '') {
  results.push({ label, ok: !!ok })
  console.log((ok ? '✅ ' : '❌ ') + label + (extra && !ok ? '  — ' + extra : ''))
}

console.log('Кадрирование фото — геометрия рамки\n')

// 1. Лента новостей: 16:10.
{
  const { width: VIEWW, height: VIEWH } = frameSize(16 / 10)
  check('рамка 16:10 — ширина больше высоты', VIEWW > VIEWH)
  check('рамка 16:10 — пропорция верная', Math.abs(VIEWW / VIEWH - 1.6) < 0.02, `${VIEWW}/${VIEWH}`)

  const { width: OUTW, height: OUTH } = outputSize(16 / 10)
  check('выход 16:10 — пропорция верная', Math.abs(OUTW / OUTH - 1.6) < 0.01, `${OUTW}/${OUTH}`)
  check('выход длинной стороной 1600', OUTW === 1600 && OUTH === 1000, `${OUTW}x${OUTH}`)
}

// 2. Вертикальное фото 9:16 — рамка должна перевернуться.
{
  const { width: VIEWW, height: VIEWH } = frameSize(9 / 16)
  check('рамка 9:16 — высота больше ширины', VIEWH > VIEWW)
  const { width: OUTW, height: OUTH } = outputSize(9 / 16)
  check('выход 9:16 — высота больше ширины', OUTH > OUTW)
}

// 3. Аватар и квадратная обложка не сломались.
{
  const { width: VIEWW, height: VIEWH } = frameSize(1)
  check('квадрат остался квадратом', VIEWW === VIEWH && VIEWW === 260)
  const { width: OUTW, height: OUTH } = outputSize(1, 512)
  check('аватар 512×512', OUTW === 512 && OUTH === 512, `${OUTW}x${OUTH}`)
}

// 4. Кривое соотношение не роняет редактор.
{
  const { width: VIEWW, height: VIEWH } = frameSize(NaN)
  check('NaN превращается в квадрат', VIEWW === VIEWH)
  const z = frameSize(0)
  check('ноль превращается в квадрат', z.width === z.height)
  check('normalizeRatio(NaN) = 1', normalizeRatio(NaN) === 1)
}

// 5. Размеры не выходят за границы.
{
  const small = outputSize(16 / 10, 50)
  check('слишком маленький размер поднят до минимума', small.width >= 320, `${small.width}`)
  const big = outputSize(16 / 10, 99999)
  check('слишком большой размер ограничен', big.width <= 2400, `${big.width}`)
}

// 6. Круг только для аватара.
{
  check('аватар с ratio 1 — круг', isRoundFrame('circle', 1) === true)
  check('лента 16:10 — не круг', isRoundFrame('square', 16 / 10) === false)
  check('circle с ratio 16:10 — не круг (лента важнее)', isRoundFrame('circle', 16 / 10) === false)
}

const failed = results.filter((r) => !r.ok)
console.log('')
if (failed.length) {
  console.log(`❌ Провалено ${failed.length} из ${results.length}`)
  process.exit(1)
}
console.log(`✅ Все ${results.length} проверок прошли`)
