import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { tenantRoleLabel } from '../../core/auth/tenant-role-labels';
import { tenderLifecycleLabel } from '../../core/localization/labels';
import { TenderStageView, TenderingApi } from './tendering.api';

export type TenderPage = 'tender' | 'evaluation' | 'negotiation' | 'comparison' | 'decision';

type Pill = 'bidding' | 'opening' | 'evaluation' | 'decision' | 'award' | 'closeout';

interface NextStep {
  /** Where the next action is done, when this reader may do it (null: name the role instead). */
  readonly link: readonly unknown[] | null;
  readonly query?: Record<string, string>;
  readonly page: TenderPage | 'closeout';
  readonly label: string;
  readonly role: string;
}

const PILLS: readonly Pill[] = [
  'bidding',
  'opening',
  'evaluation',
  'decision',
  'award',
  'closeout',
];

/** Which pill a stage or lifecycle step belongs to (CF-009 vocabulary). */
const PILL_OF: Readonly<Record<string, Pill>> = {
  Draft: 'bidding',
  OpenForBids: 'bidding',
  AwaitingOpening: 'opening',
  Opened: 'evaluation',
  InEvaluation: 'evaluation',
  InNegotiation: 'evaluation',
  EvaluationRefresh: 'evaluation',
  ReadyForDecision: 'decision',
  AwaitingApproval: 'decision',
  ApprovedAwaitingAward: 'decision',
  Awarded: 'award',
  AwaitingAnswer: 'award',
  WithdrawalPending: 'award',
  CloseoutInProgress: 'closeout',
  CloseoutFinalized: 'closeout',
};

/**
 * CF-015: one header on every tender page — the stages as pills with the current one marked, what happens now, and the one next action for
 * this reader (or the role who acts, when the reader may not). After an award, the award and its closeout are one click away. It reads the
 * server's stage (CF-009); the pages and the API still check every action.
 */
@Component({
  selector: 'app-tender-stage-header',
  imports: [RouterLink],
  template: `
    @if (view(); as current) {
      <nav class="tsh" [attr.aria-label]="navLabel">
        <ol class="tsh-steps" role="list">
          @for (pill of pills; track pill; let i = $index) {
            <li
              class="tsh-step"
              [class.tsh-step--done]="currentIndex() > i"
              [class.tsh-step--current]="currentIndex() === i"
              [attr.aria-current]="currentIndex() === i ? 'step' : null"
            >
              {{ pillLabel(pill) }}
            </li>
          }
        </ol>
        <p class="tsh-now">
          <strong>{{ stepLabel(current.lifecycle) }}</strong>
          @if (next(); as step) {
            @if (step.link) {
              @if (step.page !== page()) {
                <a class="prj-btn" [routerLink]="step.link" [queryParams]="step.query ?? null">{{
                  step.label
                }}</a>
              }
            } @else {
              <span class="prj-hint" i18n="@@stageHeader.nextRole">Next: {{ step.role }}</span>
            }
          }
          @if (current.awardId && awardReader() && page() !== 'decision') {
            <a
              class="prj-btn prj-btn--ghost"
              [routerLink]="['/tenders', current.tenderId, 'decision']"
              [queryParams]="{ tab: 'award' }"
              i18n="@@stageHeader.award"
              >Award</a
            >
          }
          @if (current.awardId && closeoutReader()) {
            <a
              class="prj-btn prj-btn--ghost"
              [routerLink]="['/closeouts', current.awardId]"
              i18n="@@stageHeader.closeout"
              >Closeout</a
            >
          }
        </p>
      </nav>
    }
  `,
  styles: `
    /* Phase 3 SI-079: one compact band — a read-only stepper (text and separators, never pill buttons beside the real
       tabs) and the current step with its one next action on the same row. */
    .tsh {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1.5rem;
      align-items: center;
      margin-block: 0.75rem 1rem;
    }
    .tsh-steps {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 0;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 0.85rem;
    }
    .tsh-step {
      color: var(--color-muted);
    }
    /* '›' is a mirrored character: it points the reading way in Arabic by itself. */
    .tsh-step + .tsh-step::before {
      content: '›';
      margin-inline: 0.45rem;
      color: var(--color-border);
    }
    .tsh-step--done {
      color: var(--color-ink);
    }
    .tsh-step--current {
      color: var(--color-accent);
      font-weight: 700;
      text-decoration: underline;
      text-decoration-thickness: 2px;
      text-underline-offset: 0.3em;
    }
    .tsh-now {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin: 0;
    }
  `,
})
export class TenderStageHeader {
  private readonly api = inject(TenderingApi);
  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);
  readonly tenderId = input.required<string>();
  /** The page showing the header (its own action is not offered as a link to itself). */
  readonly page = input.required<TenderPage>();
  /** Bump to re-read after the page changed the tender. */
  readonly refresh = input<unknown>(0);

  readonly view = signal<TenderStageView | null>(null);
  readonly pills = PILLS;
  readonly stepLabel = tenderLifecycleLabel;
  readonly navLabel = $localize`:@@stageHeader.label:Tender stages`;

  readonly currentIndex = computed(() => {
    const view = this.view();
    const pill = view ? PILL_OF[view.lifecycle] : undefined;
    return pill ? PILLS.indexOf(pill) : -1;
  });
  readonly awardReader = computed(
    () => this.entitlements.has('award') && this.session.hasPermission('Decision.View'),
  );
  readonly closeoutReader = computed(
    () => this.entitlements.has('performance') && this.session.hasPermission('Performance.View'),
  );
  readonly next = computed<NextStep | null>(() => {
    const view = this.view();
    return view ? this.nextFor(view) : null;
  });

  constructor() {
    effect(() => {
      const id = this.tenderId();
      this.refresh();
      untracked(() => {
        if (!id) return;
        this.api.stage(id).subscribe({
          next: (view) => this.view.set(view),
          // The header is guidance only: the page shows its own errors.
          error: () => this.view.set(null),
        });
      });
    });
  }

  pillLabel(pill: Pill): string {
    switch (pill) {
      case 'bidding':
        return $localize`:@@stageHeader.pill.bidding:Bidding`;
      case 'opening':
        return $localize`:@@stageHeader.pill.opening:Opening`;
      case 'evaluation':
        return $localize`:@@stageHeader.pill.evaluation:Evaluation`;
      case 'decision':
        return $localize`:@@stageHeader.pill.decision:Decision`;
      case 'award':
        return $localize`:@@stageHeader.pill.award:Award`;
      default:
        return $localize`:@@stageHeader.pill.closeout:Closeout`;
    }
  }

  private nextFor(view: TenderStageView): NextStep | null {
    const id = view.tenderId;
    const can = (permission: string) => this.session.hasPermission(permission);
    const manager = tenantRoleLabel('ProcurementManager');
    const step = (
      permission: string,
      page: TenderPage | 'closeout',
      link: readonly unknown[],
      label: string,
      role: string,
      query?: Record<string, string>,
    ): NextStep => ({ link: can(permission) ? link : null, page, label, role, query });
    switch (view.lifecycle) {
      case 'AwaitingOpening':
        return step(
          'Evaluation.OpenBids',
          'evaluation',
          ['/tenders', id, 'evaluation'],
          $localize`:@@stageHeader.openBids:Open the bids`,
          manager,
        );
      case 'Opened':
        // Phase 3 SI-029: a reader without Decision.View sees every post-opening step as "Opened" (ADR-114, intended), so the
        // tender may already be in its decision: a neutral line with no link, rather than a possibly stale "Go to the evaluation".
        if (!can('Decision.View'))
          return {
            link: null,
            page: 'evaluation',
            label: $localize`:@@stageHeader.afterOpening:Bids are opened; evaluation and the decision follow`,
            role: manager,
          };
        return step(
          'Evaluation.View',
          'evaluation',
          ['/tenders', id, 'evaluation'],
          $localize`:@@stageHeader.evaluation:Go to the evaluation`,
          manager,
        );
      case 'InEvaluation':
      case 'EvaluationRefresh':
        return step(
          'Evaluation.View',
          'evaluation',
          ['/tenders', id, 'evaluation'],
          $localize`:@@stageHeader.evaluation:Go to the evaluation`,
          manager,
        );
      case 'InNegotiation':
        return step(
          'Negotiation.Manage',
          'negotiation',
          ['/tenders', id, 'negotiation'],
          $localize`:@@stageHeader.negotiation:Go to the negotiation round`,
          manager,
        );
      case 'ReadyForDecision':
        return step(
          'Decision.Prepare',
          'decision',
          ['/tenders', id, 'decision'],
          $localize`:@@stageHeader.prepare:Prepare the decision`,
          manager,
        );
      case 'AwaitingApproval':
        return step(
          'Award.Approve',
          'decision',
          ['/tenders', id, 'decision'],
          $localize`:@@stageHeader.approve:Review for approval`,
          tenantRoleLabel('ApproverDirector'),
          { tab: 'approval' },
        );
      case 'ApprovedAwaitingAward':
        return step(
          'Award.Issue',
          'decision',
          ['/tenders', id, 'decision'],
          $localize`:@@stageHeader.issue:Issue the award`,
          manager,
          { tab: 'award' },
        );
      case 'AwaitingAnswer':
      case 'WithdrawalPending':
        return step(
          'Award.Issue',
          'decision',
          ['/tenders', id, 'decision'],
          $localize`:@@stageHeader.answer:Record the firm's answer`,
          manager,
          { tab: 'award' },
        );
      default:
        return null;
    }
  }
}
