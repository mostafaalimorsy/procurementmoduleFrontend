import { Component, computed, inject, input } from '@angular/core';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { money, score as formatScore, signedMoney } from '../evaluation/evaluation-format';
import { DecisionWorkspace, RecommendationCandidate } from './decision.api';
import { outcomeLabel } from './decision-labels';

/** Exact difference of two decimal amounts (b − a) as a decimal string with their own decimals ("-124800.00") — never floating point. */
export function amountDelta(a: string, b: string): string {
  const decimals = Math.max(...[a, b].map((value) => (value.split('.')[1] ?? '').length));
  const units = (value: string): bigint => {
    const negative = value.trim().startsWith('-');
    const [whole, fraction = ''] = value.trim().replace('-', '').split('.');
    const magnitude = BigInt((whole || '0') + fraction.padEnd(decimals, '0'));
    return negative ? -magnitude : magnitude;
  };
  const diff = units(b) - units(a);
  const abs = (diff < 0n ? -diff : diff).toString().padStart(decimals + 1, '0');
  const text = decimals ? `${abs.slice(0, -decimals)}.${abs.slice(-decimals)}` : abs;
  return diff < 0n ? `-${text}` : text;
}

/**
 * Phase 3 SI-053: the approver's brief, first on the approval tab — what is asked (firm, value, version, by whom), how the
 * proposed bid compares with the next-ranked one (price, score and the difference), the value against the package estimate
 * where the reader may see it, the flags an approver must weigh and the rationale. It shows only what the workspace already
 * gives this reader (the server gates commercial and estimate values); the comparison is shown only when the decision was
 * prepared on the recommendation the workspace holds.
 */
@Component({
  selector: 'app-decision-brief',
  imports: [BusinessDatePipe],
  template: `
    @let view = workspace();
    @if (view.currentSubmission; as request) {
      <section class="prj-section dbr" aria-labelledby="brief-title" data-testid="approver-brief">
        <h2 id="brief-title" i18n="@@brief.title">What is asked</h2>
        <p class="dbr-ask">
          <span i18n="@@brief.ask"
            >Award <bdi dir="ltr" class="tnd-code">{{ request.subcontractorCode }}</bdi
            >&ngsp;<bdi>{{ request.subcontractorName }}</bdi> for
            <strong
              ><bdi dir="ltr">{{ amount(request.awardValue) }} {{ request.currency }}</bdi></strong
            ></span
          >
          <small class="prj-hint tnd-block" i18n="@@brief.version"
            >Decision version {{ request.number }} · {{ outcome(request.outcome) }} · submitted
            {{ request.submittedAtUtc | businessDate: 'instant' }} by
            <bdi>{{ request.submittedByName }}</bdi></small
          >
        </p>

        @if (comparison(); as rows) {
          <div
            class="prj-table-wrap"
            role="region"
            tabindex="0"
            aria-labelledby="brief-compare-caption"
          >
            <table class="prj-table">
              <caption id="brief-compare-caption" i18n="@@brief.compareCaption">
                The proposed bid beside the next-ranked one, on recommendation
                {{
                  request.recommendationNumber
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col" i18n="@@brief.colFirm">Firm</th>
                  <th scope="col" class="dc-num" i18n="@@brief.colRank">Rank</th>
                  <th scope="col" class="dc-num" i18n="@@brief.colScore">Score</th>
                  <th scope="col" class="dc-num" i18n="@@brief.colLeveled">Leveled total</th>
                  <th scope="col" class="dc-num" i18n="@@brief.colDelta">Against the proposed</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows; track row.candidate.openingBidId; let first = $first) {
                  <tr>
                    <th scope="row">
                      <bdi dir="ltr" class="tnd-code">{{ row.candidate.subcontractorCode }}</bdi>
                      <bdi>{{ row.candidate.subcontractorName }}</bdi>
                      @if (first) {
                        <small class="prj-hint tnd-block" i18n="@@brief.proposed">proposed</small>
                      }
                    </th>
                    <td class="dc-num">
                      <bdi dir="ltr">{{ row.candidate.rank ?? '—' }}</bdi>
                    </td>
                    <td class="dc-num">
                      <bdi dir="ltr">{{ score(row.candidate.total) }}</bdi>
                    </td>
                    <td class="dc-num">
                      <bdi dir="ltr">{{ amount(row.candidate.leveledTotal) }}</bdi>
                    </td>
                    <td class="dc-num">
                      @if (first) {
                        <span class="prj-hint">—</span>
                      } @else {
                        <bdi dir="ltr">{{ signedAmount(row.priceDelta) }}</bdi>
                        @if (row.scoreDelta !== null) {
                          <small class="prj-hint tnd-block" i18n="@@brief.scoreDelta"
                            >score <bdi dir="ltr">{{ row.scoreDelta }}</bdi></small
                          >
                        }
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (view.recommendation) {
          <p class="prj-hint" i18n="@@brief.noCompare">
            This decision was prepared on recommendation {{ request.recommendationNumber }}; its
            comparison is on the Recommendation tab.
          </p>
        }

        <dl class="dc-facts">
          @if (view.controls?.estimate; as estimate) {
            <div>
              <dt i18n="@@brief.estimate">Against the package estimate</dt>
              <dd>
                @if (view.controls?.proposedVariancePercent; as variance) {
                  <bdi dir="ltr">{{ signed(variance) }} %</bdi>
                  <small class="prj-hint tnd-block" i18n="@@brief.estimateOf"
                    >estimate
                    <bdi dir="ltr"
                      >{{ amount(estimate) }} {{ view.controls?.estimateCurrency }}</bdi
                    ></small
                  >
                } @else {
                  <span class="prj-hint" i18n="@@brief.notComparable">not compared</span>
                }
              </dd>
            </div>
          }
          @if (request.leveledTotal !== request.awardValue) {
            <div>
              <dt i18n="@@brief.leveled">Leveled total of this bid</dt>
              <dd>
                <bdi dir="ltr">{{ amount(request.leveledTotal) }} {{ request.currency }}</bdi>
                @if (request.valueReason) {
                  <small class="tnd-block"
                    ><bdi>{{ request.valueReason }}</bdi></small
                  >
                }
              </dd>
            </div>
          }
        </dl>

        @if (flags(); as list) {
          @if (list.length) {
            <ul class="prj-note tnd-attention-box dbr-flags" role="list" data-testid="brief-flags">
              @for (flag of list; track flag.kind) {
                <li>
                  <strong>{{ flag.label }}</strong>
                  @if (flag.reason) {
                    — <bdi>{{ flag.reason }}</bdi>
                  }
                </li>
              }
            </ul>
          }
        }

        @if (request.rationale) {
          <h3 i18n="@@brief.rationale">Rationale</h3>
          <p class="tnd-prewrap">
            <bdi>{{ request.rationale }}</bdi>
          </p>
        }
      </section>
    }
  `,
  styles: `
    .dbr-ask {
      margin: 0 0 1rem;
      font-size: 1.05rem;
    }
    .dbr-flags {
      margin: 1rem 0;
      padding-inline-start: 1.75rem;
    }
  `,
})
export class DecisionBrief {
  private readonly locale = inject(LocaleService).locale;
  readonly workspace = input.required<DecisionWorkspace>();

  /** The proposed candidate and the best-ranked other eligible one, on the recommendation this decision was prepared on. */
  readonly comparison = computed(() => {
    const view = this.workspace();
    const request = view.currentSubmission;
    const recommendation = view.recommendation;
    if (!request || !recommendation || recommendation.id !== request.recommendationId) return null;
    const proposed = recommendation.candidates.find(
      (c) => c.openingBidId === request.proposedOpeningBidId,
    );
    if (!proposed) return null;
    const next = [...recommendation.candidates]
      .filter((c) => c.openingBidId !== proposed.openingBidId && c.eligible && c.rank !== null)
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))[0];
    const rows: {
      candidate: RecommendationCandidate;
      priceDelta: string;
      scoreDelta: string | null;
    }[] = [{ candidate: proposed, priceDelta: '', scoreDelta: null }];
    if (next)
      rows.push({
        candidate: next,
        priceDelta: amountDelta(proposed.leveledTotal, next.leveledTotal),
        scoreDelta:
          next.total !== null && proposed.total !== null
            ? signedScore(Math.round((next.total - proposed.total) * 1000) / 1000)
            : null,
      });
    return rows;
  });

  readonly flags = computed(() => {
    const request = this.workspace().currentSubmission;
    if (!request) return [];
    const list: { kind: string; label: string; reason: string | null }[] = [];
    if (request.isOverride)
      list.push({
        kind: 'override',
        label: $localize`:@@brief.flagOverride:Departs from the recommendation`,
        reason: request.overrideReason,
      });
    if (request.limitedCompetition)
      list.push({
        kind: 'competition',
        label: $localize`:@@brief.flagCompetition:Limited competition`,
        reason: request.competitionReason,
      });
    if (request.overBudget)
      list.push({
        kind: 'budget',
        label: $localize`:@@brief.flagBudget:Above the package estimate beyond the tolerance`,
        reason: request.overBudgetReason,
      });
    return list;
  });

  amount(value: string | null | undefined): string {
    return money(value, this.locale);
  }

  signedAmount(value: string): string {
    return signedMoney(value, this.locale);
  }

  score(value: number | null): string {
    return value === null ? '—' : formatScore(value);
  }

  outcome(value: string): string {
    return outcomeLabel(value);
  }

  signed(value: string): string {
    return value.startsWith('-') ? value : `+${value}`;
  }
}

function signedScore(value: number): string {
  const rounded = formatScore(value);
  return value > 0 ? `+${rounded}` : rounded;
}
