import { Component, afterNextRender } from '@angular/core';

/** What a form tells the page it navigates to (router navigation state). */
export type SavedKind = 'created' | 'updated';

/** Phase 3 SI-143: the navigation extras a form passes so the record's page confirms the save. */
export function savedState(kind: SavedKind): { state: { saved: SavedKind } } {
  return { state: { saved: kind } };
}

function readSaved(): SavedKind | null {
  const saved = (globalThis.history?.state as { saved?: unknown } | null)?.saved;
  return saved === 'created' || saved === 'updated' ? saved : null;
}

/**
 * Phase 3 SI-143: after a create or an edit the record's page says so (a polite status, not only the navigation) and moves the
 * focus to its heading, where a screen reader and a keyboard user continue — before, the focus was left on the page body. The
 * flag is cleared from the history entry so a reload does not repeat the notice.
 */
@Component({
  selector: 'app-saved-notice',
  template: `
    @if (kind) {
      <p class="prj-note" role="status" data-testid="saved-notice">
        @if (kind === 'created') {
          <span i18n="@@saved.created">Created and saved.</span>
        } @else {
          <span i18n="@@saved.updated">Changes saved.</span>
        }
      </p>
    }
  `,
})
export class SavedNotice {
  readonly kind = readSaved();

  constructor() {
    if (!this.kind) return;
    afterNextRender(() => {
      const heading = document.querySelector<HTMLElement>('main h1, h1');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
      try {
        const state = { ...(history.state as Record<string, unknown>) };
        delete state['saved'];
        history.replaceState(state, '');
      } catch {
        // A sandboxed history cannot be rewritten; the notice then shows once more after a reload.
      }
    });
  }
}
