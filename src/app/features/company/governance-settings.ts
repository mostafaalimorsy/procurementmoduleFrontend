import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { problemMessage } from '../../core/localization/product-problem';
import { SessionService } from '../../core/auth/session.service';
import { tenantRoleLabel } from '../../core/auth/tenant-role-labels';
import { TenantIdentityApi, TenantUser } from '../identity/tenant-identity.api';
import {
  CriteriaDeclarationRule,
  GovernanceApi,
  OutcomeNoticeTiming,
  ProcurementGovernance,
  ValidityBasis,
} from './company.api';

const EMPTY_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Procurement governance settings (ADR-084): whether the Company Admin also acts in the procurement chain, the competition minimum, the
 * over-budget tolerance and the validity basis. Every member reads them; Company Admins change them. The API decides permission again.
 */
@Component({
  selector: 'app-governance-settings',
  imports: [FormsModule],
  template: `
    <section class="prj-card" aria-labelledby="governance-title">
      <h2 id="governance-title" i18n="@@governance.title">Procurement governance</h2>
      <p class="prj-hint" i18n="@@governance.intro">
        Rules every tender, decision and award in your company follows. Changes apply to work done
        from now on; recorded decisions keep the rules they were made under.
      </p>
      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="prj-note" role="status">{{ notice() }}</p>
      }
      @if (current(); as settings) {
        @if (settings.isDefault) {
          <p class="prj-note" i18n="@@governance.defaults">
            Your company uses the standard settings. Saving records them as your own.
          </p>
        }
        <div class="prj-field">
          <label class="gov-check">
            <input
              type="checkbox"
              name="companyAdminActs"
              [(ngModel)]="adminActs"
              [disabled]="!settings.canManage || busy()"
            />
            <span i18n="@@governance.adminActs">Company Admins also act in procurement</span>
          </label>
          <span class="prj-hint" i18n="@@governance.adminActsHelp">
            Off: Company Admins manage users, settings, policies and the approval matrix only. Give
            anyone who sources, tenders, evaluates, decides or approves a procurement role (a person
            may hold up to three roles).
          </span>
        </div>
        <div class="prj-field">
          <label for="gov-min-bids" i18n="@@governance.minBids">Minimum compliant bids</label>
          <input
            id="gov-min-bids"
            name="minimumCompliantBids"
            type="number"
            min="1"
            max="10"
            step="1"
            dir="ltr"
            [(ngModel)]="minimumBids"
            [disabled]="!settings.canManage || busy()"
          />
          <span class="prj-hint" i18n="@@governance.minBidsHelp">
            Fewer eligible bids flag limited competition, and the decision needs a justification. 1
            turns the flag off.
          </span>
        </div>
        <div class="prj-field">
          <label for="gov-tolerance" i18n="@@governance.tolerance">Over-budget tolerance (%)</label>
          <input
            id="gov-tolerance"
            name="tolerance"
            type="text"
            inputmode="decimal"
            dir="ltr"
            [(ngModel)]="tolerance"
            [disabled]="!settings.canManage || busy()"
          />
          <span class="prj-hint" i18n="@@governance.toleranceHelp">
            An award above the package estimate by more than this needs an over-budget
            justification.
          </span>
        </div>
        <div class="prj-field">
          <label for="gov-validity" i18n="@@governance.validity">Bid validity runs from</label>
          <select
            id="gov-validity"
            name="validityBasis"
            [(ngModel)]="validityBasis"
            [disabled]="!settings.canManage || busy()"
          >
            <option value="SubmissionDeadline" i18n="@@governance.validityDeadline">
              The submission deadline in force at closing
            </option>
            <option value="RevisionSubmission" i18n="@@governance.validitySubmission">
              When the bid (or its latest revision) was submitted
            </option>
          </select>
        </div>
        <div class="prj-field">
          <label class="tnd-choice">
            <input
              type="checkbox"
              name="pricingBasisRequired"
              [(ngModel)]="pricingBasisRequired"
              [disabled]="!settings.canManage || busy()"
            />
            <span i18n="@@governance.pricingBasisRequired"
              >Every tender must state its VAT basis before it is published</span
            >
          </label>
          <span class="prj-hint" i18n="@@governance.pricingBasisHint"
            >Bids then confirm the basis or state their own; a bid on another basis is compared only
            after a VAT-basis adjustment. Your company's choice — nothing is set by country.</span
          >
        </div>
        <div class="prj-field">
          <label class="tnd-choice">
            <input
              type="checkbox"
              name="requireIndependentShortlistApproval"
              [(ngModel)]="requireIndependentShortlistApproval"
              [disabled]="!settings.canManage || busy()"
            />
            <span i18n="@@governance.independentShortlist"
              >A shortlist is approved by someone other than who prepared or last changed it</span
            >
          </label>
          <label class="tnd-choice">
            <input
              type="checkbox"
              name="requireIndependentPublish"
              [(ngModel)]="requireIndependentPublish"
              [disabled]="!settings.canManage || busy()"
            />
            <span i18n="@@governance.independentPublish"
              >A tender is published by someone other than who prepared or last changed it</span
            >
          </label>
          <span class="prj-hint" i18n="@@governance.independentHint"
            >Four eyes: off by default. A preparer can always mark a shortlist or tender ready, so
            the approver knows it is waiting.</span
          >
        </div>
        <!-- Phase 1 SI-025 / SI-118 (ADR-184, P1-D16 B): optional publication gates, off by default. -->
        <div class="prj-field">
          <label class="tnd-choice">
            <input
              type="checkbox"
              name="requireCompetitionJustification"
              [(ngModel)]="requireCompetitionJustification"
              [disabled]="!settings.canManage || busy()"
            />
            <span i18n="@@governance.competitionJustification"
              >Publishing with fewer invited firms than the minimum needs a written
              justification</span
            >
          </label>
          <label class="tnd-choice">
            <input
              type="checkbox"
              name="requireEstimate"
              [(ngModel)]="requireEstimate"
              [disabled]="!settings.canManage || busy()"
            />
            <span i18n="@@governance.requireEstimate"
              >A tender is published only when its work package has an estimate</span
            >
          </label>
        </div>
        <div class="prj-field">
          <label class="tnd-choice">
            <input
              type="checkbox"
              name="fastPathEnabled"
              [(ngModel)]="fastPathEnabled"
              [disabled]="!settings.canManage || busy()"
            />
            <span i18n="@@governance.fastPath"
              >Allow a low-value fast path for approved vendors</span
            >
          </label>
          @if (fastPathEnabled) {
            <label for="fast-path-max" i18n="@@governance.fastPathMaximum"
              >Largest work package estimate</label
            >
            <input
              id="fast-path-max"
              name="fastPathMaximumValue"
              inputmode="decimal"
              dir="ltr"
              maxlength="24"
              [(ngModel)]="fastPathMaximumValue"
              [disabled]="!settings.canManage || busy()"
            />
            <label for="fast-path-currency" i18n="@@governance.fastPathCurrency">Currency</label>
            <input
              id="fast-path-currency"
              name="fastPathCurrency"
              dir="ltr"
              maxlength="3"
              [(ngModel)]="fastPathCurrency"
              [disabled]="!settings.canManage || busy()"
            />
          }
          <span class="prj-hint" i18n="@@governance.fastPathHint"
            >Off by default. When on, and four eyes on shortlists is off, a package whose estimate
            is at most this amount in this currency can add approved vendors, qualify them and
            approve the shortlist in one step, with a reason. The approval is marked fast
            path.</span
          >
        </div>
        <div class="prj-field">
          <label for="gov-resubmissions" i18n="@@governance.resubmissions"
            >Revisions a firm may submit before the deadline</label
          >
          <input
            id="gov-resubmissions"
            name="maximumBidResubmissions"
            type="number"
            min="0"
            max="10"
            step="1"
            [(ngModel)]="maximumBidResubmissions"
            [disabled]="!settings.canManage || busy()"
          />
          <span class="prj-hint" i18n="@@governance.resubmissionsHint"
            >A firm may replace its submitted bid with a revised one this many times until the
            deadline (0 makes a submission final). Every submission is kept; the latest one at
            closing is opened.</span
          >
        </div>
        <div class="prj-field">
          <label for="gov-min-period" i18n="@@governance.minimumBidPeriod"
            >Shortest bid period (hours)</label
          >
          <input
            id="gov-min-period"
            name="minimumBidPeriodHours"
            type="number"
            min="1"
            max="2160"
            step="1"
            [(ngModel)]="minimumBidPeriodHours"
            [disabled]="!settings.canManage || busy()"
          />
          <label for="gov-normal-period" i18n="@@governance.normalBidPeriod"
            >Normal bid period (days)</label
          >
          <input
            id="gov-normal-period"
            name="normalBidPeriodDays"
            type="number"
            min="1"
            max="90"
            step="1"
            [(ngModel)]="normalBidPeriodDays"
            [disabled]="!settings.canManage || busy()"
          />
          <span class="prj-hint" i18n="@@governance.bidPeriodHint"
            >A tender is never published with less time to bid than the shortest period (1 hour by
            default). Below the normal period, the tender builder warns before publishing.</span
          >
        </div>
        <div class="prj-field">
          <label class="tnd-choice">
            <input
              type="checkbox"
              name="outsidePortalBidsAllowed"
              [(ngModel)]="outsidePortalBidsAllowed"
              [disabled]="!settings.canManage || busy()"
            />
            <span i18n="@@governance.outsidePortal"
              >Allow recording bids received outside the portal</span
            >
          </label>
          <span class="prj-hint" i18n="@@governance.outsidePortalHint"
            >Off by default. When on, a Procurement Manager may record a bid a firm sent by email,
            by hand or by courier before the deadline, with the original files and an attestation; a
            second user confirms it before the bids are opened, and the firm is emailed a
            receipt.</span
          >
        </div>
        <div class="prj-field">
          <label for="gov-criteria" i18n="@@governance.criteriaDeclaration"
            >Declare the evaluation criteria before publication</label
          >
          <select
            id="gov-criteria"
            name="criteriaDeclaration"
            [(ngModel)]="criteriaDeclaration"
            [disabled]="!settings.canManage || busy()"
          >
            <option value="NotRequired" i18n="@@governance.criteriaNotRequired">
              Not required
            </option>
            <option value="Rfp" i18n="@@governance.criteriaRfp">For RFPs (recommended)</option>
            <option value="AllTenders" i18n="@@governance.criteriaAll">For every tender</option>
          </select>
          <span class="prj-hint" i18n="@@governance.criteriaDeclarationHint"
            >When required, a tender names its technical scorecard policy and its recommendation
            policy before it is published. The published revision records the exact versions, before
            any price is seen; choosing other criteria after opening needs a reason and is flagged
            to approvers.</span
          >
        </div>
        <div class="prj-field">
          <label for="gov-panel-minimum" i18n="@@governance.panelMinimum"
            >Technical scorecards needed per bid</label
          >
          <input
            id="gov-panel-minimum"
            name="minimumScorecardsPerBid"
            type="number"
            min="1"
            max="10"
            step="1"
            [(ngModel)]="minimumScorecardsPerBid"
            [disabled]="!settings.canManage || busy()"
          />
          <span class="prj-hint" i18n="@@governance.panelMinimumHint"
            >1 by default. An evaluation is completed only when every opened bid has at least this
            many current submitted scorecards; a tender may set its own when its evaluation
            starts.</span
          >
        </div>
        <div class="prj-field">
          <label for="gov-divergence" i18n="@@governance.divergence"
            >Flag evaluator totals further apart than (points out of 100)</label
          >
          <input
            id="gov-divergence"
            name="divergenceThresholdPoints"
            type="number"
            min="1"
            max="100"
            step="1"
            [(ngModel)]="divergenceThresholdPoints"
            [disabled]="!settings.canManage || busy()"
          />
        </div>
        <div class="prj-field">
          <label class="tnd-choice">
            <input
              type="checkbox"
              name="moderationRequired"
              [(ngModel)]="moderationRequired"
              [disabled]="!settings.canManage || busy()"
            />
            <span i18n="@@governance.moderationRequired"
              >Require a moderation note when scores diverge</span
            >
          </label>
          <span class="prj-hint" i18n="@@governance.moderationHint"
            >Scores are never averaged. When on, an evaluation is completed only after the panel has
            recorded how it reconciled each divergent bid.</span
          >
        </div>
        <div class="prj-field">
          <label for="gov-notice-timing" i18n="@@governance.noticeTiming"
            >Tell the firms not selected</label
          >
          <select
            id="gov-notice-timing"
            name="outcomeNoticeTiming"
            [(ngModel)]="outcomeNoticeTiming"
            [disabled]="!settings.canManage || busy()"
          >
            <option value="OnAcceptance" i18n="@@governance.noticeOnAcceptance">
              When the awarded firm accepts (recommended)
            </option>
            <option value="AtAward" i18n="@@governance.noticeAtAward">With the award</option>
          </select>
          <span class="prj-hint" i18n="@@governance.noticeTimingHint"
            >The awarded firm is told at once. Holding the other notices until it accepts means a
            firm that is later awarded after a decline never received a "not selected". Each award
            may choose otherwise, and reserve bids are told only when you decide.</span
          >
        </div>
        <fieldset class="prj-field">
          <legend i18n="@@governance.targets">Target durations (optional)</legend>
          <span class="prj-hint" i18n="@@governance.targetsHint"
            >Leave empty for none. With a target, "My work" shows when each item is due and when it
            is overdue.</span
          >
          <label for="gov-target-evaluation" i18n="@@governance.targetEvaluation"
            >Evaluation, days after the bids are opened</label
          >
          <input
            id="gov-target-evaluation"
            name="evaluationTargetDays"
            type="number"
            min="1"
            max="365"
            step="1"
            [(ngModel)]="evaluationTargetDays"
            [disabled]="!settings.canManage || busy()"
          />
          <label for="gov-target-approval" i18n="@@governance.targetApproval"
            >Each approval step, days after it starts</label
          >
          <input
            id="gov-target-approval"
            name="approvalTargetDays"
            type="number"
            min="1"
            max="365"
            step="1"
            [(ngModel)]="approvalTargetDays"
            [disabled]="!settings.canManage || busy()"
          />
          <label for="gov-target-closeout" i18n="@@governance.targetCloseout"
            >Closeout, days after the award</label
          >
          <input
            id="gov-target-closeout"
            name="closeoutTargetDays"
            type="number"
            min="1"
            max="365"
            step="1"
            [(ngModel)]="closeoutTargetDays"
            [disabled]="!settings.canManage || busy()"
          />
        </fieldset>
        <!-- Phase 1 D02 (ADR-183): who approves each high-risk act after the bids are opened. -->
        <fieldset class="prj-field" data-testid="governance-post-opening">
          <legend i18n="@@governance.postOpening">Approval after the bids are opened</legend>
          <span class="prj-hint" i18n="@@governance.postOpeningHelp">
            Name, from your delegation of authority, the role that approves each act. Until a role
            is named the act cannot be requested at all, and nobody approves their own request.
          </span>
          @for (row of postOpeningRows; track row.key) {
            <label [for]="'gov-po-' + row.key">{{ row.label }}</label>
            <select
              [id]="'gov-po-' + row.key"
              [name]="'po-' + row.key"
              [(ngModel)]="approverRoles[row.key]"
              [disabled]="!settings.canManage || busy()"
            >
              <option value="" i18n="@@governance.postOpeningNone">
                Not set — cannot be requested
              </option>
              @for (role of settings.postOpeningApproverRoleOptions ?? []; track role) {
                <option [value]="role">{{ roleLabel(role) }}</option>
              }
            </select>
          }
        </fieldset>
        <!-- Phase 1 SI-124 (ADR-184): emergency direct awards, off until a role and a ratification period are set. -->
        <fieldset class="prj-fieldset">
          <legend i18n="@@governance.directAwardLegend">Emergency direct awards</legend>
          <span class="prj-hint" i18n="@@governance.directAwardHelp">
            Off until you name who approves them and within how many days they must be ratified. The
            requester never approves. No value limit is applied.
          </span>
          <label for="gov-da-role" i18n="@@governance.directAwardRole">Approved by</label>
          <select
            id="gov-da-role"
            name="daRole"
            [(ngModel)]="directAwardRole"
            [disabled]="!settings.canManage || busy()"
          >
            <option value="" i18n="@@governance.directAwardOff">
              Off — direct awards cannot be requested
            </option>
            @for (role of settings.postOpeningApproverRoleOptions ?? []; track role) {
              <option [value]="role">{{ roleLabel(role) }}</option>
            }
          </select>
          @if (directAwardRole) {
            <label for="gov-da-days" i18n="@@governance.directAwardDays"
              >Ratify within (days)</label
            >
            <input
              id="gov-da-days"
              name="daDays"
              type="number"
              min="1"
              max="365"
              [(ngModel)]="directAwardDays"
              [disabled]="!settings.canManage || busy()"
            />
          }
        </fieldset>
        <!-- Phase 1 SI-017 (ADR-184): the weekly digest of privileged events goes to a named second person. -->
        @if (settings.canManage) {
          <div class="prj-field">
            <label for="gov-digest" i18n="@@governance.digest"
              >Weekly privileged-events digest to</label
            >
            <select id="gov-digest" name="digest" [(ngModel)]="digestRecipient" [disabled]="busy()">
              <option value="" i18n="@@governance.digestNone">Nobody</option>
              @for (user of activeUsers(); track user.id) {
                <option [value]="user.id">
                  {{ user.displayName }} · {{ roleLabel(user.role) }}
                </option>
              }
            </select>
            <span class="prj-hint" i18n="@@governance.digestHelp">
              Once a week, how many changes were made to people and access, to governance and
              policies, and how much data was exported — counts only. Name someone other than the
              Company Admins, for example the pilot sponsor.
            </span>
          </div>
        }
        @if (weakened().length) {
          <div class="prj-note tnd-attention-box" role="alert" data-testid="governance-weakening">
            <p i18n="@@governance.weakeningIntro">
              These changes loosen procurement controls. Approvers and Procurement Managers are
              told, and the reason is kept in the audit log:
            </p>
            <ul>
              @for (field of weakened(); track field) {
                <li>{{ weakenedLabel(field) }}</li>
              }
            </ul>
            <div class="prj-field">
              <label for="gov-weakening-reason" i18n="@@governance.weakeningReason"
                >Reason (required)</label
              >
              <textarea
                id="gov-weakening-reason"
                name="weakeningReason"
                rows="2"
                maxlength="500"
                [(ngModel)]="weakeningReason"
              ></textarea>
            </div>
            <div class="prj-form-actions">
              <button
                class="prj-btn prj-btn--danger"
                type="button"
                [disabled]="busy() || weakeningReason.trim().length < 3"
                (click)="save(settings, true)"
                i18n="@@governance.weakeningConfirm"
              >
                Confirm and save
              </button>
              <button
                class="prj-btn prj-btn--ghost"
                type="button"
                (click)="weakened.set([])"
                i18n="@@common.cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        }
        @if (settings.canManage) {
          <div class="prj-form-actions">
            <button
              class="prj-btn"
              type="button"
              [disabled]="busy()"
              (click)="save(settings)"
              i18n="@@governance.save"
            >
              Save governance settings
            </button>
          </div>
        }
      }
    </section>
  `,
  styles: `
    .gov-check {
      display: inline-flex;
      gap: 0.5rem;
      align-items: center;
    }
    .gov-check input {
      inline-size: auto;
    }
  `,
})
export class GovernanceSettings implements OnInit {
  private readonly api = inject(GovernanceApi);
  private readonly session = inject(SessionService);
  private readonly identity = inject(TenantIdentityApi);
  /** Phase 1 SI-017: the fields a save would loosen, as the server named them (empty: none pending). */
  readonly weakened = signal<readonly string[]>([]);
  readonly activeUsers = signal<readonly TenantUser[]>([]);
  weakeningReason = '';
  digestRecipient = '';
  requireCompetitionJustification = false;
  requireEstimate = false;
  /** Phase 1 SI-124: the direct-award approver role ("" off) and its ratification days (no default: the company chooses). */
  directAwardRole = '';
  directAwardDays: number | null = null;
  readonly current = signal<ProcurementGovernance | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  adminActs = false;
  minimumBids = 2;
  tolerance = '0';
  validityBasis: ValidityBasis = 'SubmissionDeadline';
  pricingBasisRequired = false;
  requireIndependentShortlistApproval = false;
  requireIndependentPublish = false;
  fastPathEnabled = false;
  fastPathMaximumValue = '';
  fastPathCurrency = '';
  maximumBidResubmissions = 3;
  minimumBidPeriodHours = 1;
  normalBidPeriodDays = 5;
  outsidePortalBidsAllowed = false;
  criteriaDeclaration: CriteriaDeclarationRule = 'NotRequired';
  minimumScorecardsPerBid = 1;
  divergenceThresholdPoints = 20;
  moderationRequired = false;
  outcomeNoticeTiming: OutcomeNoticeTiming = 'OnAcceptance';
  evaluationTargetDays: number | null = null;
  approvalTargetDays: number | null = null;
  closeoutTargetDays: number | null = null;
  readonly roleLabel = tenantRoleLabel;
  readonly postOpeningRows = [
    {
      key: 'withdrawal',
      label: $localize`:@@governance.postOpeningWithdrawal:A firm's withdrawal recorded after opening`,
    },
    {
      key: 'exclusion',
      label: $localize`:@@governance.postOpeningExclusion:A material exclusion of a bid`,
    },
    {
      key: 'cancellation',
      label: $localize`:@@governance.postOpeningCancellation:Cancelling a tender whose bids are opened`,
    },
    {
      key: 'retender',
      label: $localize`:@@governance.postOpeningRetender:Closing a tender for re-tender`,
    },
  ] as const;
  approverRoles: Record<'withdrawal' | 'exclusion' | 'cancellation' | 'retender', string> = {
    withdrawal: '',
    exclusion: '',
    cancellation: '',
    retender: '',
  };

  ngOnInit(): void {
    this.api.get().subscribe({
      next: (settings) => {
        this.apply(settings);
        if (settings.canManage)
          this.identity.listUsers().subscribe({
            next: (users) => this.activeUsers.set(users.filter((user) => user.status === 'Active')),
            error: () => this.activeUsers.set([]),
          });
      },
      error: (error: unknown) => this.error.set(problemMessage(error)),
    });
  }

  /** Phase 1 SI-017: what each loosened control is called. */
  weakenedLabel(field: string): string {
    const labels: Record<string, string> = {
      minimumCompliantBids: $localize`:@@governance.weak.minBids:Fewer compliant bids required`,
      overBudgetTolerancePercent: $localize`:@@governance.weak.tolerance:A wider over-budget tolerance`,
      companyAdminActsInProcurement: $localize`:@@governance.weak.adminActs:Company Admins act in procurement`,
      requireIndependentShortlistApproval: $localize`:@@governance.weak.shortlist:Shortlist approval no longer independent`,
      requireIndependentPublish: $localize`:@@governance.weak.publish:Publication no longer independent`,
      fastPath: $localize`:@@governance.weak.fastPath:The small-value fast path opened or raised`,
      minimumBidPeriodHours: $localize`:@@governance.weak.bidPeriod:A shorter minimum bid period`,
      outsidePortalBidsAllowed: $localize`:@@governance.weak.outside:Bids received outside the portal allowed`,
      criteriaDeclaration: $localize`:@@governance.weak.criteria:Fewer tenders declare their criteria`,
      minimumScorecardsPerBid: $localize`:@@governance.weak.panel:A smaller evaluation panel`,
      divergenceThresholdPoints: $localize`:@@governance.weak.divergence:A wider divergence threshold`,
      moderationRequired: $localize`:@@governance.weak.moderation:Moderation no longer required`,
      pricingBasisRequired: $localize`:@@governance.weak.pricingBasis:The VAT basis no longer required`,
      requireCompetitionJustificationAtPublication: $localize`:@@governance.weak.competitionJustification:No justification required below the competition minimum`,
      requireEstimateBeforePublication: $localize`:@@governance.weak.estimate:No estimate required before publication`,
      directAward: $localize`:@@governance.weak.directAward:Emergency direct awards allowed, or longer to ratify them`,
    };
    return labels[field] ?? field;
  }

  save(settings: ProcurementGovernance, confirmed = false): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api
      .update({
        companyAdminActsInProcurement: this.adminActs,
        minimumCompliantBids: Number(this.minimumBids),
        overBudgetTolerancePercent: String(this.tolerance).trim(),
        validityBasis: this.validityBasis,
        pricingBasisRequired: this.pricingBasisRequired,
        requireIndependentShortlistApproval: this.requireIndependentShortlistApproval,
        requireIndependentPublish: this.requireIndependentPublish,
        fastPathEnabled: this.fastPathEnabled,
        fastPathMaximumValue: this.fastPathEnabled ? this.fastPathMaximumValue.trim() : null,
        fastPathCurrency: this.fastPathEnabled ? this.fastPathCurrency.trim().toUpperCase() : null,
        maximumBidResubmissions: Number(this.maximumBidResubmissions),
        minimumBidPeriodHours: Number(this.minimumBidPeriodHours),
        normalBidPeriodDays: Number(this.normalBidPeriodDays),
        outsidePortalBidsAllowed: this.outsidePortalBidsAllowed,
        criteriaDeclaration: this.criteriaDeclaration,
        minimumScorecardsPerBid: Number(this.minimumScorecardsPerBid),
        divergenceThresholdPoints: Number(this.divergenceThresholdPoints),
        moderationRequired: this.moderationRequired,
        outcomeNoticeTiming: this.outcomeNoticeTiming,
        evaluationTargetDays: this.target(this.evaluationTargetDays),
        approvalTargetDays: this.target(this.approvalTargetDays),
        closeoutTargetDays: this.target(this.closeoutTargetDays),
        postOpeningWithdrawalApproverRole: this.approverRoles.withdrawal,
        postOpeningExclusionApproverRole: this.approverRoles.exclusion,
        postOpeningCancellationApproverRole: this.approverRoles.cancellation,
        retenderClosureApproverRole: this.approverRoles.retender,
        requireCompetitionJustificationAtPublication: this.requireCompetitionJustification,
        requireEstimateBeforePublication: this.requireEstimate,
        directAwardApproverRole: this.directAwardRole,
        directAwardRatificationDays: this.directAwardRole
          ? Number(this.directAwardDays) || null
          : null,
        weakeningConfirmed: confirmed,
        weakeningReason: confirmed ? this.weakeningReason.trim() : null,
        privilegedDigestRecipientId: this.digestRecipient || EMPTY_ID,
        version: settings.version,
      })
      .subscribe({
        next: (saved) => {
          const rightsChanged =
            saved.companyAdminActsInProcurement !== settings.companyAdminActsInProcurement;
          this.apply(saved);
          this.weakened.set([]);
          this.weakeningReason = '';
          this.busy.set(false);
          this.notice.set($localize`:@@governance.saved:Governance settings saved.`);
          // What this session may do changes with the Company Admin setting: read the session again so navigation follows it.
          if (rightsChanged) this.session.load().subscribe();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          // Phase 1 SI-017: loosening a control needs a confirmation and a reason; ask for them here.
          const body = error instanceof HttpErrorResponse ? error.error : null;
          if (body?.code === 'company.governance_weakening_unconfirmed') {
            this.weakened.set(
              String(body.parameters?.fields ?? '')
                .split(',')
                .filter(Boolean),
            );
            return;
          }
          this.error.set(problemMessage(error));
        },
      });
  }

  private apply(settings: ProcurementGovernance): void {
    this.current.set(settings);
    this.adminActs = settings.companyAdminActsInProcurement;
    this.minimumBids = settings.minimumCompliantBids;
    this.tolerance = settings.overBudgetTolerancePercent;
    this.validityBasis = settings.validityBasis;
    this.pricingBasisRequired = settings.pricingBasisRequired;
    this.requireIndependentShortlistApproval =
      settings.requireIndependentShortlistApproval ?? false;
    this.requireIndependentPublish = settings.requireIndependentPublish ?? false;
    this.fastPathEnabled = settings.fastPathMaximumValue != null;
    this.fastPathMaximumValue = settings.fastPathMaximumValue ?? '';
    this.fastPathCurrency = settings.fastPathCurrency ?? '';
    this.maximumBidResubmissions = settings.maximumBidResubmissions ?? 3;
    this.minimumBidPeriodHours = settings.minimumBidPeriodHours ?? 1;
    this.normalBidPeriodDays = settings.normalBidPeriodDays ?? 5;
    this.outsidePortalBidsAllowed = settings.outsidePortalBidsAllowed ?? false;
    this.criteriaDeclaration = settings.criteriaDeclaration ?? 'NotRequired';
    this.minimumScorecardsPerBid = settings.minimumScorecardsPerBid ?? 1;
    this.divergenceThresholdPoints = settings.divergenceThresholdPoints ?? 20;
    this.moderationRequired = settings.moderationRequired ?? false;
    this.outcomeNoticeTiming = settings.outcomeNoticeTiming ?? 'OnAcceptance';
    this.evaluationTargetDays = settings.evaluationTargetDays ?? null;
    this.approvalTargetDays = settings.approvalTargetDays ?? null;
    this.closeoutTargetDays = settings.closeoutTargetDays ?? null;
    this.digestRecipient = settings.privilegedDigestRecipientId ?? '';
    this.requireCompetitionJustification =
      settings.requireCompetitionJustificationAtPublication ?? false;
    this.requireEstimate = settings.requireEstimateBeforePublication ?? false;
    this.directAwardRole = settings.directAwardApproverRole ?? '';
    this.directAwardDays = settings.directAwardRatificationDays ?? null;
    this.approverRoles = {
      withdrawal: settings.postOpeningWithdrawalApproverRole ?? '',
      exclusion: settings.postOpeningExclusionApproverRole ?? '',
      cancellation: settings.postOpeningCancellationApproverRole ?? '',
      retender: settings.retenderClosureApproverRole ?? '',
    };
  }

  /** CF-010: an empty target is sent as 0 (none). */
  private target(value: number | string | null): number {
    const days = Number(value);
    return value === null || value === '' || !Number.isFinite(days) ? 0 : days;
  }
}
