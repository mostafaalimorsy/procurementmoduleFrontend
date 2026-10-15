import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { knownProductProblem, problemMessage } from '../../core/localization/product-problem';

interface StandingIssue {
  readonly severity: string;
  readonly code: string;
  readonly column: string | null;
}

interface StandingRow {
  readonly row: number;
  readonly code: string | null;
  readonly actions: readonly string[];
  readonly outcome: 'Apply' | 'Nothing' | 'Error';
  readonly issues: readonly StandingIssue[];
}

interface StandingPreview {
  readonly sha256: string;
  readonly rows: number;
  readonly toApply: number;
  readonly errors: number;
  readonly items: readonly StandingRow[];
  readonly canConfirm: boolean;
}

interface StandingResult {
  readonly sha256: string;
  readonly applied: number;
  readonly failed: number;
  readonly failures: readonly StandingRow[];
}

/**
 * Phase 1 SI-023 (ADR-184, P1-D11 B): the company's Excel AVL beyond identity — a firm's status with its reason, its approved-vendor status in
 * a trade, a compliance document's details — checked first (nothing is written), then applied row by row through the same rules and rights as
 * entering them by hand. A row the user may not take is refused, never applied.
 */
@Component({
  selector: 'app-standing-import',
  imports: [RouterLink],
  template: `
    <section class="prj-page">
      <div class="prj-head">
        <div>
          <p>
            <a routerLink="/subcontractors" i18n="@@directory.backToList">Back to the directory</a>
          </p>
          <h1 i18n="@@standingImport.title">Import status, approved vendors and documents</h1>
          <p class="prj-hint" i18n="@@standingImport.intro">
            One row per change, named by the firm's code: a status (with its reason), an
            approved-vendor status in a trade (with its reason), or a compliance document's details.
            The file is checked first and nothing is written; each applied row is recorded as if it
            was entered by hand, and only with the rights you hold.
          </p>
          <p>
            <a
              href="/api/v1/subcontractors/standing-import/template"
              download
              i18n="@@standingImport.template"
              >Download the template</a
            >
          </p>
        </div>
      </div>
      <div class="prj-field">
        <label for="standing-file" i18n="@@standingImport.file">CSV or Excel file</label>
        <input id="standing-file" type="file" accept=".csv,.xlsx" (change)="choose($event)" />
      </div>
      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      }
      @if (result(); as done) {
        <p
          class="prj-note"
          role="status"
          data-testid="standing-result"
          i18n="@@standingImport.done"
        >
          {{ done.applied }} row(s) applied, {{ done.failed }} refused.
        </p>
      }
      @if (preview(); as checked) {
        <p i18n="@@standingImport.summary">
          {{ checked.rows }} rows: {{ checked.toApply }} to apply, {{ checked.errors }} refused.
        </p>
        <table class="prj-table">
          <thead>
            <tr>
              <th scope="col" i18n="@@standingImport.row">Row</th>
              <th scope="col" i18n="@@standingImport.code">Code</th>
              <th scope="col" i18n="@@standingImport.actions">Changes</th>
              <th scope="col" i18n="@@standingImport.outcome">Result</th>
            </tr>
          </thead>
          <tbody>
            @for (row of checked.items; track row.row) {
              <tr>
                <td>
                  <bdi dir="ltr">{{ row.row }}</bdi>
                </td>
                <td>
                  <bdi>{{ row.code ?? '—' }}</bdi>
                </td>
                <td>{{ row.actions.join(', ') || '—' }}</td>
                <td>
                  {{ outcomeLabel(row.outcome) }}
                  @for (issue of row.issues; track $index) {
                    <span class="prj-error-text tnd-block">{{ issueText(issue) }}</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (checked.canConfirm) {
          <button
            class="prj-btn"
            type="button"
            [disabled]="busy()"
            (click)="confirm()"
            i18n="@@standingImport.confirm"
          >
            Apply the valid rows
          </button>
        }
      }
    </section>
  `,
})
export class StandingImportPage {
  private readonly http = inject(HttpClient);
  readonly preview = signal<StandingPreview | null>(null);
  readonly result = signal<StandingResult | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  private file: File | null = null;

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
    this.preview.set(null);
    this.result.set(null);
    this.error.set('');
    if (!this.file) return;
    this.busy.set(true);
    this.http
      .post<StandingPreview>('/api/v1/subcontractors/standing-import/preview', this.form())
      .subscribe({
        next: (preview) => {
          this.busy.set(false);
          this.preview.set(preview);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(problemMessage(error));
        },
      });
  }

  confirm(): void {
    const preview = this.preview();
    if (!this.file || !preview || this.busy()) return;
    const form = this.form();
    form.append('sha256', preview.sha256);
    this.busy.set(true);
    this.http
      .post<StandingResult>('/api/v1/subcontractors/standing-import/confirm', form)
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.result.set(result);
          this.preview.set(null);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(problemMessage(error));
        },
      });
  }

  outcomeLabel(outcome: StandingRow['outcome']): string {
    switch (outcome) {
      case 'Apply':
        return $localize`:@@standingImport.apply:Will be applied`;
      case 'Nothing':
        return $localize`:@@standingImport.nothing:Nothing to change`;
      default:
        return $localize`:@@standingImport.refused:Refused`;
    }
  }

  issueText(issue: StandingIssue): string {
    const known = knownProductProblem({ code: issue.code });
    const message = known ?? issue.code;
    return issue.column ? `${message} (${issue.column})` : message;
  }

  private form(): FormData {
    const form = new FormData();
    if (this.file) form.append('file', this.file, this.file.name);
    return form;
  }
}
