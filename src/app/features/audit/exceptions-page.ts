import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { problemMessage } from '../../core/localization/product-problem';

export interface ProcurementException {
  readonly occurredAtUtc: string;
  readonly kind: string;
  readonly reference: string | null;
  readonly tenderId: string | null;
  readonly actorName: string | null;
}

/** Phase 1 SI-068: what each exception is called. */
export function exceptionKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    override: $localize`:@@exceptions.override:Override of the recommendation`,
    outranked_by_removed: $localize`:@@exceptions.outranked:Proposed after a higher bid was withdrawn or excluded`,
    limited_competition: $localize`:@@exceptions.limited:Limited competition`,
    over_budget: $localize`:@@exceptions.overBudget:Over budget`,
    fast_path: $localize`:@@exceptions.fastPath:Small-value fast path`,
    outside_portal_bid: $localize`:@@exceptions.outside:Bid received outside the portal`,
    withdrawal_after_opening: $localize`:@@exceptions.withdrawal:Withdrawal after opening`,
    exclusion_after_opening: $localize`:@@exceptions.exclusion:Exclusion after opening`,
    cancellation_after_opening: $localize`:@@exceptions.cancellation:Cancellation after opening`,
    closed_for_retender: $localize`:@@exceptions.retender:Closed for re-tender`,
    post_opening_rejected: $localize`:@@exceptions.postOpeningRejected:Post-opening request rejected`,
    award_declined: $localize`:@@exceptions.declined:Award declined`,
    award_withdrawn: $localize`:@@exceptions.awardWithdrawn:Award withdrawn`,
    approval_rule_weakened: $localize`:@@exceptions.ruleWeakened:Approval rule loosened`,
    governance_weakened: $localize`:@@exceptions.governanceWeakened:Procurement controls loosened`,
    direct_award_requested: $localize`:@@exceptions.directRequested:Emergency direct award requested`,
    direct_award_approved: $localize`:@@exceptions.directApproved:Emergency direct award approved`,
    direct_award_rejected: $localize`:@@exceptions.directRejected:Emergency direct award rejected`,
    direct_award_ratified: $localize`:@@exceptions.directRatified:Emergency direct award ratified`,
    direct_award_ratified_late: $localize`:@@exceptions.directRatifiedLate:Emergency direct award ratified late`,
  };
  return labels[kind] ?? kind;
}

/**
 * Phase 1 SI-068 (ADR-184): the procurement exceptions register — one company-wide, read-only list of a period's exceptions composed from the
 * audit trail (kind, what, who, when; never a reason or an amount), with a CSV, for those who approve awards and the audit reader.
 */
@Component({
  selector: 'app-exceptions-page',
  imports: [FormsModule, RouterLink, BusinessDatePipe],
  template: `
    <section class="prj-page">
      <div class="prj-head">
        <div>
          <h1 i18n="@@exceptions.title">Procurement exceptions</h1>
          <p class="prj-hint" i18n="@@exceptions.intro">
            Every exception recorded in the period: overrides, limited competition, over-budget
            awards, fast-path shortlists, outside-portal bids, acts after opening, declined and
            withdrawn awards, and loosened rules. Open the tender for the reasons and evidence.
          </p>
        </div>
      </div>
      <div class="prj-field">
        <label for="exceptions-days" i18n="@@exceptions.period">Period</label>
        <select id="exceptions-days" name="days" [(ngModel)]="days" (ngModelChange)="load()">
          <option [ngValue]="30" i18n="@@exceptions.last30">Last 30 days</option>
          <option [ngValue]="90" i18n="@@exceptions.last90">Last 90 days</option>
          <option [ngValue]="365" i18n="@@exceptions.last365">Last 12 months</option>
        </select>
      </div>
      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      }
      <p>
        <a [href]="csvUrl()" download i18n="@@exceptions.csv">Download CSV</a>
      </p>
      @if (rows(); as items) {
        @if (!items.length) {
          <p class="prj-hint" i18n="@@exceptions.none">No exception was recorded in this period.</p>
        } @else {
          <table class="prj-table">
            <thead>
              <tr>
                <th scope="col" i18n="@@exceptions.when">When</th>
                <th scope="col" i18n="@@exceptions.kind">Exception</th>
                <th scope="col" i18n="@@exceptions.what">About</th>
                <th scope="col" i18n="@@exceptions.who">By</th>
              </tr>
            </thead>
            <tbody>
              @for (row of items; track $index) {
                <tr>
                  <td>{{ row.occurredAtUtc | businessDate: 'instant' }}</td>
                  <td>{{ kindLabel(row.kind) }}</td>
                  <td>
                    @if (row.tenderId) {
                      <a [routerLink]="['/tenders', row.tenderId]"
                        ><bdi dir="ltr">{{ row.reference }}</bdi></a
                      >
                    } @else {
                      <bdi dir="ltr">{{ row.reference ?? '—' }}</bdi>
                    }
                  </td>
                  <td>
                    <bdi>{{ row.actorName ?? '—' }}</bdi>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      }
    </section>
  `,
})
export class ExceptionsPage implements OnInit {
  private readonly http = inject(HttpClient);
  readonly rows = signal<readonly ProcurementException[] | null>(null);
  readonly error = signal('');
  readonly kindLabel = exceptionKindLabel;
  days = 30;

  ngOnInit(): void {
    this.load();
  }

  csvUrl(): string {
    const { from, to } = this.period();
    return `/api/v1/exceptions.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }

  load(): void {
    const { from, to } = this.period();
    this.http
      .get<ProcurementException[]>('/api/v1/exceptions', {
        params: new HttpParams().set('from', from).set('to', to),
      })
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.error.set('');
        },
        error: (error: unknown) => this.error.set(problemMessage(error)),
      });
  }

  private period(): { from: string; to: string } {
    const to = new Date(Date.now() + 60_000);
    const from = new Date(to.getTime() - Number(this.days) * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }
}
