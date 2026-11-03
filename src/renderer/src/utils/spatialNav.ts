// Navegação espacial do controle e das setas: anda pelo que está na tela, em qualquer página ou janela aberta
export type NavDirection = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex="0"]';
const OVERLAY = '.fixed.inset-0, [data-nav-scope]';
const OVERLAP_TOLERANCE = 12;       // A capa focada cresce um pouco e encosta na vizinha
const CROSS_AXIS_WEIGHT = 3;        // Prefere o que está alinhado a o que está só mais perto
const SCROLL_STEP = 160;

let lastPageFocus: HTMLElement | null = null;

export function setNavActive(active: boolean): void {
  if (active) document.documentElement.dataset.nav = 'on';
  else delete document.documentElement.dataset.nav;
}

export const isNavActive = () => document.documentElement.dataset.nav === 'on';

export function topOverlay(): HTMLElement | null {
  const overlays = document.querySelectorAll<HTMLElement>(OVERLAY);
  return overlays[overlays.length - 1] ?? null;
}

function isNavigable(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled || el.closest('[data-no-nav]')) return false;
  // Os botões dentro da capa são atalhos de mouse: no controle, a capa é um item só
  if (el.parentElement?.closest('[data-game-id]')) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.opacity !== '0';
}

const navigableIn = (scope: HTMLElement) => [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isNavigable);

function focusElement(el: HTMLElement): void {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (!topOverlay()) lastPageFocus = el;
}

// Ponto de partida: o jogo pedido, o marcado pela tela, onde estava antes ou o primeiro item
export function focusStart(gameId?: string): boolean {
  const overlay = topOverlay();
  const main = document.querySelector('main');
  const scope = overlay ?? main ?? document.body;
  const items = navigableIn(scope);
  const wanted = gameId ? items.find((el) => el.dataset.gameId === gameId) : undefined;
  const marked = items.find((el) => el.dataset.navStart !== undefined);
  const previous = !overlay && lastPageFocus && lastPageFocus.isConnected && isNavigable(lastPageFocus) ? lastPageFocus : undefined;
  const target = wanted ?? marked ?? previous ?? items[0] ?? (overlay ? undefined : navigableIn(document.body)[0]);
  if (target) focusElement(target);
  return !!target;
}

function currentElement(scope: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body && scope.contains(active) && isNavigable(active) ? active : null;
}

function stepSelect(select: HTMLSelectElement, step: number): void {
  const next = Math.min(select.options.length - 1, Math.max(0, select.selectedIndex + step));
  if (next === select.selectedIndex) return;
  select.selectedIndex = next;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function scrollNearest(from: HTMLElement, direction: NavDirection): void {
  for (let el: HTMLElement | null = from; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
      if (direction === 'up' || direction === 'down') el.scrollBy({ top: direction === 'down' ? SCROLL_STEP : -SCROLL_STEP });
      return;
    }
  }
}

// Devolve true quando o foco mudou
export function moveFocus(direction: NavDirection): boolean {
  setNavActive(true);
  const scope = topOverlay() ?? document.body;
  const current = currentElement(scope);
  if (!current) return focusStart();

  if (current instanceof HTMLSelectElement && (direction === 'left' || direction === 'right')) {
    stepSelect(current, direction === 'right' ? 1 : -1);
    return true;
  }

  const from = current.getBoundingClientRect();
  const horizontal = direction === 'left' || direction === 'right';
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of navigableIn(scope)) {
    if (el === current) continue;
    const to = el.getBoundingClientRect();
    const along =
      direction === 'right' ? to.left - from.right : direction === 'left' ? from.left - to.right : direction === 'down' ? to.top - from.bottom : from.top - to.bottom;
    if (along < -OVERLAP_TOLERANCE) continue;
    const cross = horizontal
      ? Math.max(0, to.top - from.bottom, from.top - to.bottom)
      : Math.max(0, to.left - from.right, from.left - to.right);
    const centerOffset = horizontal
      ? Math.abs(to.top + to.height / 2 - from.top - from.height / 2)
      : Math.abs(to.left + to.width / 2 - from.left - from.width / 2);
    const score = Math.max(0, along) + cross * CROSS_AXIS_WEIGHT + centerOffset * 0.1;
    if (score < bestScore) {
      best = el;
      bestScore = score;
    }
  }

  if (best) {
    focusElement(best);
    return true;
  }
  scrollNearest(current, direction);
  return false;
}

// Botão A / Enter: age sobre o item focado. Sem foco, só mostra onde está: nada dispara às cegas
export function activateFocused(): void {
  setNavActive(true);
  const current = currentElement(topOverlay() ?? document.body);
  if (!current) {
    focusStart();
    return;
  }
  if (current instanceof HTMLSelectElement || current instanceof HTMLTextAreaElement) return;
  if (current instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(current.type)) return;
  current.click();
}

export const focusedGameId = () => (document.activeElement as HTMLElement | null)?.dataset?.gameId;

// As janelas fecham pelo clique no fundo; a de boas-vindas não tem esse clique e continua aberta
export function closeTopOverlay(): boolean {
  const overlay = topOverlay();
  if (!overlay) return false;
  overlay.click();
  return true;
}
