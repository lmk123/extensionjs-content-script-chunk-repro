// Stands in for the real payload (React, a UI bundle, a parser...): anything
// too heavy to ship in the entry bundle, so it is pulled in with a dynamic import().
export function mount() {
  console.log('[repro] chunk loaded and executed')

  const banner = document.createElement('div')
  banner.textContent = 'chunk loaded ✓'
  banner.style.cssText =
    'position: fixed; top: 12px; right: 12px; z-index: 2147483647;' +
    'padding: 8px 14px; border-radius: 6px; font: 14px/1.4 system-ui;' +
    'background: #0a7d32; color: #fff;'
  document.documentElement.appendChild(banner)
}
