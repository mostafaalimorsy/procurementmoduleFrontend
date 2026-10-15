import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { HistoricalEvidence, HistoricalOutcome } from '../decision/decision.api';
import { strengthLabel } from '../intelligence/intelligence-labels';
import { PERFORMANCE_FEATURES, PERFORMANCE_PERMISSIONS } from './performance.api';
import {
  categoryLabel,
  outcomeTypeLabel,
  rehireShortLabel,
  signedPercent,
} from './performance-labels';
import { VarianceCause } from './variance-cause';

/**
 * Part 11 inside a recommendation: the historical performance evidence a candidate had when the recommendation was computed —
 * kept apart from the current bid, and always with its sample size, category and recency next to the score the engine used.
 */
@Component({
  selector: 'app-history-evidence',
  imports: [RouterLink, BusinessDatePipe, VarianceCause],
  styles: `
    .pf-evidence {
      margin-block: 0.75rem;
      padding: 0.6rem 0.85rem;
      border-inline-start: 3px solid var(--color-border);
    }
    .pf-evidence h4 {
      margin: 0 0 0.25rem;
      font-size: 0.9rem;
    }
    .pf-evidence p {
      margin: 0 0 0.35rem;
    }
    .dc-list {
      margin: 0;
      padding-inline-start: 1.1rem;
    }
  `,
  template: `
    <div class="pf-evidence">
      <h4 i18n="@@evidence.title">Historical performance evidence (completed projects)</h4>
      @if (history(); as item) {
        <p>
          <!-- CF-023 (ADR-127): the number is a composite of the components listed below, never a grade on its own. -->
          @if (applied()) {
            <span i18n="@@evidence.composite"
              >Composite (rule <bdi dir="ltr">{{ ruleName(item.scoreRule) }}</bdi
              >) — the input this recommendation weighed:
              <bdi dir="ltr">{{ item.score }} / 100</bdi> · {{ categoryLabel(item.category) }}</span
            >
          } @else {
            <span i18n="@@evidence.compositeNotUsed"
              >Composite (rule <bdi dir="ltr">{{ ruleName(item.scoreRule) }}</bdi
              >): <bdi dir="ltr">{{ item.score }} / 100</bdi> — not used in this ranking ·
              {{ categoryLabel(item.category) }}</span
            >
          }
          ·
          <strong
            ><span i18n="@@evidence.sample">{item.sampleSize, plural,
              =1 {1 completed project}
              other {{{item.sampleSize}} completed projects}
            }</span></strong
          >
          ·
          <!-- Phase 3 SI-044: how strong the sample is, beside its size (the rule weighs any sample of 2 or more in full). -->
          <span data-testid="evidence-strength">{{ strength(item.sampleSize) }}</span>
          ·
          <span i18n="@@evidence.latest"
            >latest closeout
            <bdi>{{ item.latestOutcomeAtUtc | businessDate: 'instant' }}</bdi></span
          >
        </p>
        @if (applied() && item.sampleSize <= 2) {
          <p class="prj-hint" data-testid="small-sample" i18n="@@evidence.smallSample">
            Weighed in full although the evidence is limited: the history rule does not discount a
            small sample.
          </p>
        }
        <ul class="dc-list">
          @for (outcome of item.outcomes; track outcome.awardId) {
            <li>
              @if (canOpen()) {
                <a [routerLink]="['/closeouts', outcome.awardId]"
                  ><bdi dir="ltr">{{ outcome.tenderReference }}</bdi></a
                >
              } @else {
                <bdi dir="ltr">{{ outcome.tenderReference }}</bdi>
              }
              —
              <!-- Phase 3 SI-114 (ADR-124): a subcontract that did not complete is not compared on cost or duration. -->
              @if (outcome.outcomeType && outcome.outcomeType !== 'Completed') {
                <span class="prj-chip dc-state dc-state--warn">{{
                  outcomeLabel(outcome.outcomeType)
                }}</span>
                @if (outcome.percentComplete !== null && outcome.percentComplete !== undefined) {
                  <span data-testid="ended-early" i18n="@@intel.notComparedEndedEarlyAt"
                    >not compared — ended early at
                    <bdi dir="ltr">{{ outcome.percentComplete }} %</bdi></span
                  >
                } @else {
                  <span data-testid="ended-early" i18n="@@intel.notComparedEndedEarly"
                    >not compared — ended early</span
                  >
                }
                <span i18n="@@evidence.ratingsOnly"
                  >quality <bdi dir="ltr">{{ outcome.qualityRating }}/5</bdi>, HSE
                  <bdi dir="ltr">{{ outcome.hseRating }}/5</bdi></span
                >
              } @else {
                <span i18n="@@evidence.outcome"
                  >cost <bdi dir="ltr">{{ percent(outcome.costVariancePercent) }}</bdi
                  >, duration <bdi dir="ltr">{{ percent(outcome.scheduleVariancePercent) }}</bdi
                  >, quality <bdi dir="ltr">{{ outcome.qualityRating }}/5</bdi>, HSE
                  <bdi dir="ltr">{{ outcome.hseRating }}/5</bdi></span
                >
                <app-variance-cause
                  [cause]="outcome.variationCause"
                  [share]="outcome.variationSharePercent"
                  [residual]="outcome.residualCostVariancePercent"
                />
                <!-- Phase 3 SI-045: past the point where the score already reaches 0, it no longer shows how far. -->
                @if (beyondScoreRange(outcome)) {
                  <span
                    class="prj-chip dc-state dc-state--warn"
                    data-testid="outlier"
                    i18n="@@evidence.outlier"
                    >Outlier: beyond the score's range (cost from +20 %, duration from +40 % score
                    0)</span
                  >
                }
              }
              · {{ rehireLabel(outcome.wouldWorkAgain) }}
              <!-- Phase 3 SI-046 (ADR-127): under the partial rule, the project's rule-v3 score the composite above is the mean of. -->
              @if (outcome.outcomeScoreV3) {
                ·
                <span data-testid="project-score-v3" i18n="@@evidence.projectScoreV3"
                  >project score <bdi dir="ltr">{{ outcome.outcomeScoreV3 }} / 100</bdi> (rule
                  <bdi dir="ltr">v3</bdi>)</span
                >
              }
            </li>
          }
        </ul>
        @if (subcontractorId() && canProfile()) {
          <p>
            <a
              [routerLink]="['/subcontractors', subcontractorId()]"
              [queryParams]="{ category: item.category }"
              i18n="@@evidence.profile"
              >Open the firm's intelligence in this category</a
            >
          </p>
        }
      } @else {
        <p class="prj-hint" i18n="@@evidence.none">
          No finalized closeout of this firm in this category — no history is invented.
        </p>
      }
    </div>
  `,
})
export class HistoryEvidence {
  /** "performance-outcome-v3" → "v3": the rule version, as the policy screens name it. */
  ruleName(rule: string | null | undefined): string {
    return rule?.replace('performance-outcome-', '') ?? 'v1';
  }

  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);
  readonly history = input<HistoricalEvidence | null | undefined>(null);
  /** Whether the recommendation actually applied the history weight (every eligible firm had history). */
  readonly applied = input(false);
  /** Links to closeouts only for people who can open them. */
  readonly canOpen = computed(
    () =>
      this.session.hasPermission(PERFORMANCE_PERMISSIONS.view) &&
      PERFORMANCE_FEATURES.every((feature) => this.entitlements.has(feature)),
  );
  /** CF-026: the firm the evidence is about, to open its profile in this category. */
  readonly subcontractorId = input<string | null | undefined>(null);
  /** The profile is offered to intelligence readers only (the literal keys avoid a circular import with the intelligence feature). */
  readonly canProfile = computed(
    () =>
      this.session.hasPermission('Intelligence.View') &&
      ['intelligence', ...PERFORMANCE_FEATURES].every((feature) => this.entitlements.has(feature)),
  );
  /** Phase 3 SI-044: the same bands as the server's EvidenceStrengthRule (1–2 limited, 3–5 moderate, 6+ strong). */
  strength(projects: number): string {
    return strengthLabel(
      projects <= 0 ? 'None' : projects <= 2 ? 'Limited' : projects <= 5 ? 'Moderate' : 'Strong',
    );
  }

  /**
   * Phase 3 SI-045: a completed project whose residual cost overrun is +20 % or more, or whose delay is +40 % or more — where score rule
   * v3 already gives that component 0, so +250 % weighs the same as +20 %. A flag only; nothing is capped or excluded here.
   */
  beyondScoreRange(outcome: HistoricalOutcome): boolean {
    const cost = Number(outcome.residualCostVariancePercent ?? outcome.costVariancePercent);
    const schedule = Number(outcome.scheduleVariancePercent);
    return (Number.isFinite(cost) && cost >= 20) || (Number.isFinite(schedule) && schedule >= 40);
  }

  readonly categoryLabel = categoryLabel;
  readonly percent = signedPercent;
  readonly rehireLabel = rehireShortLabel;
  readonly outcomeLabel = outcomeTypeLabel;
}
