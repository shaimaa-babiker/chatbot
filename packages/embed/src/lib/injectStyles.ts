/* Styles are injected once per page. We hash the CSS string and key the
 * <style> tag with `data-assistly-style="<hash>"` so HMR and multiple
 * mounts don't duplicate it. */

let injected = false;
let injectedHash: string | null = null;

function hashCss(css: string): string {
  let h = 5381;
  for (let i = 0; i < css.length; i++) {
    h = ((h << 5) + h) ^ css.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

export function ensureAssistlyStyles(css: string): void {
  if (typeof document === 'undefined') return;
  const h = hashCss(css);
  if (injected && injectedHash === h) return;
  injected = true;
  injectedHash = h;

  document.querySelectorAll('style[data-assistly-style]').forEach((el) => el.remove());

  const style = document.createElement('style');
  style.setAttribute('data-assistly-style', h);
  style.textContent = css;
  document.head.appendChild(style);
}

/** Test-only: clear the dedup state so a fresh <style> tag is created
 *  on the next call. Do not use in production. */
export function __resetAssistlyStylesForTests(): void {
  injected = false;
  injectedHash = null;
}

let fontsInjected = false;
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';

export function ensureAssistlyFonts(): void {
  if (typeof document === 'undefined') return;
  if (fontsInjected) return;
  if (document.querySelector('link[data-assistly-fonts]')) {
    fontsInjected = true;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  link.setAttribute('data-assistly-fonts', 'true');
  document.head.appendChild(link);
  fontsInjected = true;
}
