import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { RecordLinks } from '../../shared/navigation/record-links';
import { money } from '../evaluation/evaluation-format';
import { lifecycleLabel, outcomeTypeLabel } from '../performance/performance-labels';
import type { AwardOutcomeSummary } from '../tendering/tendering.api';
import { awardStateLabel } from './decision-labels';

/**
 * Phase 3 SI-058: the outcome a tender or work package leads with once it has an award — the firm (linked to its profile), where
 * the award stands now, its value and the closeout's status and result. Every field is shown only as the server sent it: the value
 * is absent for readers without commercial outcomes and the closeout for readers without performance; nothing is inferred.
 */
@Component({
  selector: 'app-award-summary',
  imports: [RouterLink, BusinessDatePipe],
  template: `
    @let item = summary();
    <section class="prj-section" aria-labelledby="award-summary-title" data-testid="award-summary">
      <h2 id="award-summary-title" class="dc-heading">
        <span i18n="@@outcome.title">Outcome</span>
        <span
          class="prj-chip dc-state"
          [class.dc-state--good]="item.awardState === 'Accepted'"
          [class.dc-state--warn]="!item.inForce || item.awardState === 'WithdrawalPending'"
          data-testid="award-summary-state"
          >{{ stateLabel(item.awardState) }}</span
        >
      </h2>
      <dl class="dc-facts">
        <div>
          @if (item.inForce) {
            <dt i18n="@@outcome.awardedTo">Awarded to</dt>
          } @else {
            <dt i18n="@@outcome.lastAwardedTo">Last award to</dt>
          }
          <dd>
            <a
              [routerLink]="links.subcontractor(item.subcontractorId)"
              data-testid="award-summary-firm"
              ><bdi dir="ltr" class="tnd-code">{{ item.subcontractorCode }}</bdi
              >{{ ' ' }}<bdi>{{ item.subcontractorName }}</bdi></a
            >
          </dd>
        </div>
        @if (item.awardValue !== null && item.awardValue !== undefined) {
          <div>
            <dt i18n="@@outcome.value">Award value</dt>
            <dd>
              <bdi dir="ltr" data-testid="award-summary-value"
                >{{ amount(item.awardValue) }} {{ item.currency }}</bdi
              >
            </dd>
          </div>
        }
        <div>
          <dt i18n="@@outcome.issued">Issued</dt>
          <dd>
            {{ item.awardedAtUtc | businessDate: 'instant' }}
            @if (showTender()) {
              ·
              <a [routerLink]="links.tender(item.tenderId)"
                ><bdi dir="ltr">{{ item.tenderReference }}</bdi></a
              >
            }
            @if (item.awardSequence > 1) {
              <small class="prj-hint tnd-block" i18n="@@outcome.sequence"
                >award <bdi dir="ltr">{{ item.awardSequence }}</bdi> of this tender</small
              >
            }
          </dd>
        </div>
        @if (item.acceptedOn) {
          <div>
            <dt i18n="@@outcome.acceptedOn">Accepted by the firm</dt>
            <dd>{{ item.acceptedOn | businessDate }}</dd>
          </div>
        }
        @if (item.closeoutStatus) {
          <div>
            <dt i18n="@@outcome.closeout">Performance closeout</dt>
            <dd>
              <a [routerLink]="links.closeout(item.awardId)" data-testid="award-summary-closeout">{{
                closeoutLabel(item.closeoutStatus)
              }}</a>
              @if (item.closeoutStatus === 'Closed' && item.closeoutOutcomeType) {
                <small class="prj-hint tnd-block"
                  >{{ outcomeLabel(item.closeoutOutcomeType) }}
                  @if (item.closeoutClosedAtUtc) {
                    · {{ item.closeoutClosedAtUtc | businessDate: 'instant' }}
                  }
                </small>
              }
            </dd>
          </div>
        } @else if (closeoutApplies(item) && links.closeout(item.awardId); as closeout) {
          <!-- A Performance.View reader is sent the closeout fields: none here means none was started. -->
          <div>
            <dt i18n="@@outcome.closeout">Performance closeout</dt>
            <dd>
              <a [routerLink]="closeout" i18n="@@outcome.closeoutNotStarted">Not started</a>
            </dd>
          </div>
        }
      </dl>
      @if (links.award(item.tenderId); as award) {
        <p>
          <a [routerLink]="award" [queryParams]="{ tab: 'award' }" i18n="@@outcome.openAward"
            >Open the award</a
          >
        </p>
      }
    </section>
  `,
})
export class AwardSummaryBlock {
  readonly summary = input.required<AwardOutcomeSummary>();
  /** The work-package page names the tender the award came from; the tender page does not repeat itself. */
  readonly showTender = input(false);
  readonly links = inject(RecordLinks);
  private readonly locale = inject(LocaleService).locale;
  readonly stateLabel = awardStateLabel;
  readonly closeoutLabel = lifecycleLabel;
  readonly outcomeLabel = outcomeTypeLabel;

  amount(value: string): string {
    return money(value, this.locale);
  }

  /** As the server's start rule (ADR-110): an accepted award, or one issued before answers were tracked. */
  closeoutApplies(item: AwardOutcomeSummary): boolean {
    return item.awardState === 'Accepted' || item.awardState === 'NotRecorded';
  }
}
