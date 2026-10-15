import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/** What a table container is when it scrolls sideways. */
export const SCROLL_CONTAINER = '.prj-table-wrap';
/** Marks the attributes this helper set, so it removes only its own when the container stops scrolling. */
const MARK = 'data-scroll-region';

/**
 * Phase 3 SI-144 / SI-142 (WCAG 2.1.1, axe scrollable-region-focusable): a table that scrolls sideways — on a phone, or a wide comparison
 * on a tablet — must be reachable by keyboard, or its hidden columns cannot be read without a mouse. While a table container actually
 * scrolls it becomes a named, focusable region (tab index 0 and the region role, named by the table's caption or the nearest heading);
 * when it fits again the attributes go, so desktop pages get no extra tab stops. A container whose template sets its own `tabindex` is
 * left alone. Installed once for the whole application; a page needs nothing to take part.
 */
@Injectable({ providedIn: 'root' })
export class ScrollRegions {
  private readonly document = inject(DOCUMENT);
  private started = false;
  private pending = false;

  start(): void {
    const view = this.document.defaultView;
    if (this.started || !view) return;
    this.started = true;
    const schedule = () => {
      if (this.pending) return;
      this.pending = true;
      view.requestAnimationFrame(() => {
        this.pending = false;
        markScrollRegions(this.document);
      });
    };
    new view.MutationObserver(schedule).observe(this.document.body, {
      childList: true,
      subtree: true,
    });
    view.addEventListener('resize', schedule);
    schedule();
  }
}

/** Marks every table container in `root` that scrolls sideways, and unmarks the ones it marked that no longer do. */
export function markScrollRegions(root: ParentNode): void {
  for (const container of Array.from(root.querySelectorAll<HTMLElement>(SCROLL_CONTAINER))) {
    const ours = container.hasAttribute(MARK);
    if (!ours && container.hasAttribute('tabindex')) continue;
    const scrolls = container.scrollWidth > container.clientWidth + 1;
    if (scrolls && !ours) {
      container.setAttribute(MARK, '');
      container.setAttribute('tabindex', '0');
      if (!container.hasAttribute('role')) {
        container.setAttribute('role', 'region');
        container.setAttribute(`${MARK}-role`, '');
      }
      if (!container.hasAttribute('aria-label') && !container.hasAttribute('aria-labelledby')) {
        const name = regionName(container);
        if (name) {
          container.setAttribute('aria-label', name);
          container.setAttribute(`${MARK}-label`, '');
        }
      }
    } else if (!scrolls && ours) {
      container.removeAttribute(MARK);
      container.removeAttribute('tabindex');
      if (container.hasAttribute(`${MARK}-role`)) container.removeAttribute('role');
      if (container.hasAttribute(`${MARK}-label`)) container.removeAttribute('aria-label');
      container.removeAttribute(`${MARK}-role`);
      container.removeAttribute(`${MARK}-label`);
    }
  }
}

/** The table's caption, else the nearest heading before the container (in its section). */
function regionName(container: HTMLElement): string | null {
  const caption = container.querySelector('caption')?.textContent?.trim();
  if (caption) return caption.replace(/\s+/g, ' ');
  for (let node: Element | null = container; node; node = node.parentElement) {
    for (
      let sibling = node.previousElementSibling;
      sibling;
      sibling = sibling.previousElementSibling
    ) {
      const heading = sibling.matches('h1, h2, h3, h4')
        ? sibling
        : sibling.querySelector('h1, h2, h3, h4');
      const text = heading?.textContent?.trim();
      if (text) return text.replace(/\s+/g, ' ');
    }
  }
  return null;
}
