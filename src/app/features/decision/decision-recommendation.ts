import { VerificationDetails } from '../../shared/ui/verification-details';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { LocaleService } from '../../core/localization/locale.service';
import { RecordLinks } from '../../shared/navigation/record-links';
import { money, score } from '../evaluation/evaluation-format';
import { HistoryEvidence } from '../performance/history-evidence';
import { retrospectiveBadge } from '../performance/performance-labels';
import { REASON_MIN, isStale } from '../tendering/tendering.api';
import {
  CriterionOutcome,
  DecisionApi,
  DecisionWorkspace,
  Recommendation,
  RecommendationCandidate,
  decisionProblemMessage,
  shortFingerprint,
} from './decision.api';
import {
  candidateFlagLabel,
  criterionKindLabel,
  historyRuleLabel,
  criterionKindRule,
  evidenceStatusLabel,
  ineligibleReasonLabel,
  liveStateLabel,
  readinessLabel,
  staleReasonLabel,
} from './decision-labels';
import { RequestKeys } from './request-keys';
import { CriteriaFlag } from './criteria-flag';

/**
 * The recommendation (Part 10): computed on demand with an explicit policy, numbered and kept. Candidates are listed by
 * recommendation rank — a policy result, never a "winner" — with every criterion's evidence, current and historical in
 * separate groups, so a reader can check each contribution. A recommendation whose evidence or policy changed is shown as
 * requiring a recompute, never as ready.
 */
@Component({
  selector: 'app-decision-recommendation',
  imports: [
    VerificationDetails,
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    BusinessDatePipe,
    HistoryEvidence,
    CriteriaFlag,
  ],
  templateUrl: './decision-recommendation.html',
  styleUrl: './decision-recommendation.scss',
})
export class DecisionRecommendation {
  private readonly api = inject(DecisionApi);
  private readonly keys = inject(RequestKeys);
  readonly locale = inject(LocaleService).locale;
  /** Phase 3 SI-066: a candidate's firm links to its profile (plain text for a reader who cannot open it). */
  readonly links = inject(RecordLinks);
  openPolicyVersion(version: number): string {
    return $localize`:@@evaluation.openPolicyVersion:Open version ${version}:version: of this policy`;
  }
  /** CF-038: what "not market-tested" means (the controls' note). */
  readonly limitedNote = $localize`:@@controls.limitedNote: Limited competition: fewer compliant bids than your company requires. The ranking is not market-tested; the decision needs a justification, and every approver sees it. `;
  readonly tenderId = input.required<string>();
  readonly workspace = input.required<DecisionWorkspace>();
  readonly updated = output<DecisionWorkspace>();
  readonly announce = output<string>();
  readonly reload = output<string>();

  readonly kindLabel = criterionKindLabel;
  readonly historyRuleLabel = historyRuleLabel;

  /**
   * Phase 3 SI-043: under the partial history rule, the range of the composites the firms with enough history were weighed on, beside
   * the neutral value the others received — so a reader sees whether "neutral" sits below almost every real record. Display only;
   * the rule and its fingerprint are unchanged (the algorithm question is with Data/Intelligence).
   */
  neutralRange(
    rec: Recommendation,
  ): { min: string; max: string; count: number; neutral: string; above: number } | null {
    if (rec.historyRule !== 'partial-v2') return null;
    const scores = rec.candidates
      .filter((c) => c.history && c.history.sampleSize >= 2)
      .map((c) => Number(c.history!.score))
      .filter((value) => Number.isFinite(value));
    if (!scores.length) return null;
    const neutral = rec.neutralHistoryScore ?? 50;
    return {
      min: String(Math.min(...scores)),
      max: String(Math.max(...scores)),
      count: scores.length,
      neutral: String(neutral),
      above: scores.filter((value) => value > neutral).length,
    };
  }
  readonly retrospectiveBadge = retrospectiveBadge();
  readonly kindRule = criterionKindRule;
  readonly statusLabel = evidenceStatusLabel;
  readonly flagLabel = candidateFlagLabel;
  readonly ineligibleLabel = ineligibleReasonLabel;
  readonly liveStateLabel = liveStateLabel;
  readonly readinessLabel = readinessLabel;
  readonly staleLabel = staleReasonLabel;
  readonly short = shortFingerprint;

  readonly busy = signal(false);
  readonly error = signal('');
  private chosen = signal('');
  /** CF-040: why another policy than the declared one ranks. */
  deviationReason = '';

  readonly recommendation = computed(() => this.workspace().recommendation);
  readonly fresh = computed(() => {
    const state = this.recommendation()?.liveState;
    return state === 'Ready' || state === 'InsufficientHistory';
  });
  readonly eligible = computed(() =>
    (this.recommendation()?.candidates ?? []).filter((candidate) => candidate.eligible),
  );
  readonly ineligible = computed(() =>
    (this.recommendation()?.candidates ?? []).filter((candidate) => !candidate.eligible),
  );
  readonly policyId = computed(() => {
    const options = this.workspace().policyOptions;
    const chosen = this.chosen();
    if (chosen && options.some((option) => option.id === chosen)) return chosen;
    const current = this.recommendation()?.policyId;
    return options.find((option) => option.id === current)?.id ?? options[0]?.id ?? '';
  });
  readonly canCompute = computed(
    () =>
      this.workspace().access.compute &&
      this.workspace().readiness.state === 'Ready' &&
      this.workspace().policyOptions.length > 0,
  );

  /** CF-040 (ADR-105): the tender declared a recommendation policy and another one is chosen. */
  readonly deviates = computed(() => {
    const declared = this.workspace().policyOptions.find((option) => option.declared);
    return !!declared && declared.id !== this.policyId();
  });

  choose(id: string): void {
    this.chosen.set(id);
    this.error.set('');
  }

  compute(): void {
    const policy = this.policyId();
    if (this.busy() || !policy) return;
    const reason = this.deviates() ? this.deviationReason.trim() : null;
    if (reason !== null && reason.length < REASON_MIN) {
      this.error.set(
        $localize`:@@control.reasonTooShort:Explain the reason (at least ${REASON_MIN}:min: characters).`,
      );
      return;
    }
    // The same key is kept (with the page) for retries of the same request, so a lost answer never computes twice.
    const scope = `compute:${policy}:${this.recommendation()?.id ?? 'none'}`;
    this.busy.set(true);
    this.error.set('');
    this.api.compute(this.tenderId(), policy, this.keys.for(scope), reason).subscribe({
      next: (view) => {
        this.busy.set(false);
        this.keys.done(scope);
        this.updated.emit(view);
        this.announce.emit(
          $localize`:@@recommendation.computed:Recommendation ${view.recommendation?.number ?? ''}:number: computed. It ranks the eligible bids by the policy; it does not decide or award.`,
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        if (isStale(error)) this.reload.emit('');
        else this.error.set(decisionProblemMessage(error));
      },
    });
  }

  current(candidate: RecommendationCandidate): readonly CriterionOutcome[] {
    return candidate.criteria.filter((criterion) => criterion.source === 'Current');
  }

  historical(candidate: RecommendationCandidate): readonly CriterionOutcome[] {
    return candidate.criteria.filter((criterion) => criterion.source === 'Historical');
  }

  input(criterion: CriterionOutcome, value: string | null): string {
    if (value === null) return '—';
    return criterion.kind === 'Commercial'
      ? `${money(value, this.locale)} ${this.recommendation()?.currency ?? ''}`.trim()
      : value;
  }

  /** Phase 3 SI-141: scores read to one decimal, as everywhere else. */
  number(value: number | null | undefined): string {
    return score(value);
  }

  money(amount: string | null): string {
    return money(amount, this.locale);
  }
}
