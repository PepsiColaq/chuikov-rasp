# Бэкап нижнего меню (до иконок, 30.09.2026)

Текстовый вариант без SVG-иконок. Чтобы вернуть:

1. В `src/main.js` поставь `const NAV_WITH_ICONS = false`
2. Пересобери / задеплой сайт

Либо вручную: в `renderNav` снова только `text: item.label` без `innerHTML` с иконками, а в CSS убери правила `.nav-ico` / `.nav.nav-with-icons`.

## Бывший `renderNav` (текст)

```js
function renderNav() {
  const items = [
    { id: 'schedule', label: 'Пары' },
    { id: 'hw', label: 'ДЗ' },
    { id: 'teachers', label: 'Преп.' },
    { id: 'overrides', label: 'Замены' },
    { id: 'more', label: 'Ещё' },
  ]
  return el(
    'nav',
    { className: 'nav' },
    items.map((item) =>
      el('button', {
        type: 'button',
        className: state.tab === item.id ? 'active' : '',
        text: item.label,
        onClick: () => {
          state.tab = item.id
          render()
          if (item.id === 'schedule' || item.id === 'hw') scheduleSync('tab')
          else tryFlushPendingRedraw()
        },
      }),
    ),
  )
}
```

## Бывший CSS нижнего меню

```css
.nav {
  --nav-font: 12px;
  --nav-pad-y: 8px;
  --nav-pad-x: 2px;
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: min(480px, 100%);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  background: var(--surface);
  border-top: 1px solid var(--line);
  padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
  z-index: 20;
}

.nav.nav-size-sm {
  --nav-font: 10px;
  --nav-pad-y: 6px;
  --nav-pad-x: 2px;
}

.nav button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: var(--nav-font);
  color: var(--muted);
  padding: var(--nav-pad-y) var(--nav-pad-x);
}

.nav button.active {
  color: var(--accent);
  font-weight: 600;
}
```
