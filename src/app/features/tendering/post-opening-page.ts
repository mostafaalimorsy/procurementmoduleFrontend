import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { tenantRoleLabel } from '../../core/auth/tenant-role-labels';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { knownProductProblem } from '../../core/localization/product-problem';
import { requestKey } from '../../shared/util/request-key';
import { EvaluationApi, OpenedBid } from '../evaluation/evaluation.api';
import {
  POST_OPENING_EVIDENCE_MAX,
  POST_OPENING_REASON_MAX,
  POST_OPENING_REASON_MIN,
  POST_OPENING_TENDER_REASON_MAX,
  PostOpeningAction,
  PostOpeningApi,
  PostOpeningRequest,
  PostOpeningWorkspace,
  postOpeningActionLabel,
  tenderProblemMessage,
} from './tendering.api';

const BID_ACTS: readonly PostOpeningAction[] = ['BidWithdrawal', 'BidExclusion'];

function statusLabel(status: string): string {
  switch (status) {
    case 'Pending':
      return $localize`:@@postOpening.status.pending:Waiting for approval`;
    case 'Approved':
      return $localize`:@@postOpening.status.approved:Approved — in effect`;
    case 'Rejected':
      return $localize`:@@postOpening.status.rejected:Rejected — nothing changed`;
    default:
      return status;
  }
}

/**
 * Phase 1 D02 (ADR-183): a tender's post-opening approvals. After the bids are opened, a withdrawal recorded for a firm, a material exclusion,
 * cancelling the tender and closing it for re-tender are requested here with a reason and an evidence reference, and take effect only when a
 * member holding the company's configured approver role — never the requester — approves them. The server decides who may do what; this page
 * shows its answer.
 */
@Component({
  selector: 'app-post-opening-page',
  imports: [FormsModule, RouterLink, BusinessDatePipe],
  styleUrl: './tendering.scss',
  template: `
    <section class="prj-page">
      <nav class="prj-crumbs" aria-label="Breadcrumb" i18n-aria-label="@@a11y.breadcrumb">
        <a routerLink="/tenders" i18n="@@nav.tenders">Tenders</a><span aria-hidden="true">/</span>
        <a [routerLink]="['/tenders', tenderId]">
          @if (view(); as current) {
            <bdi dir="ltr">{{ current.reference }}</bdi>
          } @else {
            <ng-container i18n="@@tenders.crumb">Tender</ng-container>
          }
        </a>
        <span aria-hidden="true">/</span>
        <span i18n="@@postOpening.crumb">Post-opening approvals</span>
      </nav>

      <div class="prj-head">
        <div>
          @if (view(); as current) {
            <p class="prj-eyebrow">
              <bdi dir="ltr">{{ current.reference }}</bdi>
            </p>
          }
          <h1 i18n="@@postOpening.title">Post-opening approvals</h1>
          <p class="prj-hint" i18n="@@postOpening.intro">
            After the bids are opened, withdrawing a firm's bid, excluding a bid, cancelling the
            tender and closing it for re-tender each need the approval of the role your company
            named for it. Nothing takes effect until it is approved, and nobody approves their own
            request.
          </p>
        </div>
      </div>

      @if (error()) {
        <p class="prj-note prj-note--error" role="alert" data-testid="post-opening-error">
          {{ error() }}
        </p>
      }
      @if (notice()) {
        <p class="prj-note" role="status">{{ notice() }}</p>
      }

      @if (loading()) {
        <p class="prj-note" i18n="@@postOpening.loading">Loading…</p>
      } @else if (view(); as current) {
        @if (!current.bidsOpened) {
          <p class="prj-note" i18n="@@postOpening.notOpened">
            The bids are not opened yet. Until then a cancellation is made directly on the tender,
            without an approval.
          </p>
        }

        <section class="prj-section" aria-labelledby="po-requests">
          <h2 id="po-requests" i18n="@@postOpening.requests">Requests</h2>
          @if (!current.requests.length) {
            <p class="prj-hint" i18n="@@postOpening.none">Nothing has been requested.</p>
          }
          @for (item of current.requests; track item.id) {
            <article
              class="prj-note"
              [class.tnd-attention-box]="item.status === 'Pending'"
              data-testid="post-opening-request"
            >
              <p>
                <strong>{{ actionLabel(item.action) }}</strong>
                @if (item.subcontractorCode) {
                  · <bdi dir="ltr" class="tnd-code">{{ item.subcontractorCode }}</bdi>
                }
                · <span class="prj-chip">{{ statusLabel(item.status) }}</span>
              </p>
              <p class="prj-hint" i18n="@@postOpening.requestedBy">
                Requested by <bdi>{{ item.requestedByName }}</bdi> on
                {{ item.requestedAtUtc | businessDate: 'instant' }} · approver:
                {{ roleLabel(item.approverRole) }}
              </p>
              <p>
                <span i18n="@@postOpening.reason">Reason</span>: <bdi>{{ item.reason }}</bdi>
              </p>
              <p>
                <span i18n="@@postOpening.evidence">Evidence</span>:
                <bdi>{{ item.evidenceReference }}</bdi>
              </p>
              @if (item.decidedAtUtc) {
                <p class="prj-hint" i18n="@@postOpening.decidedBy">
                  Decided by <bdi>{{ item.decidedByName }}</bdi> on
                  {{ item.decidedAtUtc | businessDate: 'instant' }}
                </p>
                @if (item.decisionComment) {
                  <p>
                    <span i18n="@@postOpening.comment">Comment</span>:
                    <bdi>{{ item.decisionComment }}</bdi>
                  </p>
                }
              } @else if (item.canDecide) {
                <div class="prj-field">
                  <label [for]="'po-comment-' + item.id" i18n="@@postOpening.decisionComment"
                    >Comment (required to reject)</label
                  >
                  <textarea
                    [id]="'po-comment-' + item.id"
                    rows="2"
                    [attr.maxlength]="reasonMax"
                    [ngModel]="comment(item.id)"
                    (ngModelChange)="setComment(item.id, $event)"
                  ></textarea>
                </div>
                <div class="prj-form-actions">
                  <button
                    class="prj-btn"
                    type="button"
                    [disabled]="busy()"
                    (click)="decide(item, true)"
                    i18n="@@postOpening.approve"
                  >
                    Approve
                  </button>
                  <button
                    class="prj-btn prj-btn--ghost prj-btn--danger"
                    type="button"
                    [disabled]="busy() || !comment(item.id).trim()"
                    (click)="decide(item, false)"
                    i18n="@@postOpening.reject"
                  >
                    Reject
                  </button>
                </div>
              } @else if (item.status === 'Pending' && item.decideBlocker) {
                <p class="prj-hint">{{ blockerText(item) }}</p>
              }
            </article>
          }
        </section>

        @if (current.bidsOpened && requestable().length) {
          <section class="prj-section" aria-labelledby="po-new">
            <h2 id="po-new" i18n="@@postOpening.newTitle">Request an act</h2>
            <form class="prj-form" (ngSubmit)="submit()">
              <div class="prj-field">
                <label for="po-action" i18n="@@postOpening.what">What</label>
                <select
                  id="po-action"
                  name="action"
                  [ngModel]="action()"
                  (ngModelChange)="pick($event)"
                >
                  @for (act of requestable(); track act.action) {
                    <option [value]="act.action">{{ actionLabel(act.action) }}</option>
                  }
                </select>
              </div>
              @if (configuredRole(); as role) {
                <p class="prj-hint" i18n="@@postOpening.approverIs">
                  Approved by: {{ roleLabel(role) }}
                </p>
              } @else {
                <p
                  class="prj-note"
                  data-testid="post-opening-not-configured"
                  i18n="@@postOpening.notConfigured"
                >
                  Your company has not named who approves this, so it cannot be requested. A Company
                  Admin sets it in Company settings → Procurement governance.
                </p>
              }
              @if (bidAct()) {
                <div class="prj-field">
                  <label for="po-bid" i18n="@@postOpening.bid">Opened bid</label>
                  <select id="po-bid" name="bid" [(ngModel)]="openingBidId" required>
                    @for (bid of eligibleBids(); track bid.id) {
                      <option [value]="bid.id">
                        {{ bid.subcontractorCode }} · {{ bid.subcontractorName }}
                      </option>
                    }
                  </select>
                </div>
              }
              <div class="prj-field">
                <label for="po-reason" i18n="@@postOpening.reasonLabel">Documented reason</label>
                <textarea
                  id="po-reason"
                  name="reason"
                  rows="3"
                  [attr.maxlength]="bidAct() ? reasonMax : tenderReasonMax"
                  [(ngModel)]="reason"
                ></textarea>
              </div>
              <div class="prj-field">
                <label for="po-evidence" i18n="@@postOpening.evidenceLabel"
                  >Evidence reference (letter, email, minute)</label
                >
                <input
                  id="po-evidence"
                  name="evidence"
                  [attr.maxlength]="evidenceMax"
                  [(ngModel)]="evidence"
                />
              </div>
              <div class="prj-form-actions">
                <button
                  class="prj-btn"
                  type="submit"
                  [disabled]="
                    busy() ||
                    !configuredRole() ||
                    reason.trim().length < reasonMin ||
                    !evidence.trim() ||
                    (bidAct() && !openingBidId)
                  "
                  i18n="@@postOpening.submit"
                >
                  Request approval
                </button>
              </div>
            </form>
          </section>
        }
      }
    </section>
  `,
})
export class PostOpeningPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PostOpeningApi);
  private readonly evaluation = inject(EvaluationApi);

  readonly tenderId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly view = signal<PostOpeningWorkspace | null>(null);
  readonly bids = signal<readonly OpenedBid[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly action = signal<PostOpeningAction | null>(null);
  readonly comments = signal<Record<string, string>>({});
  readonly reasonMin = POST_OPENING_REASON_MIN;
  readonly reasonMax = POST_OPENING_REASON_MAX;
  readonly tenderReasonMax = POST_OPENING_TENDER_REASON_MAX;
  readonly evidenceMax = POST_OPENING_EVIDENCE_MAX;
  readonly actionLabel = postOpeningActionLabel;
  readonly statusLabel = statusLabel;
  readonly roleLabel = tenantRoleLabel;
  openingBidId = '';
  reason = '';
  evidence = '';
  private key = requestKey();

  readonly requestable = computed(() => this.view()?.acts.filter((act) => act.canRequest) ?? []);
  readonly bidAct = computed(() => BID_ACTS.includes(this.action() ?? 'TenderCancellation'));
  readonly configuredRole = computed(
    () => this.view()?.acts.find((act) => act.action === this.action())?.approverRole ?? null,
  );
  /** Bids still standing: not withdrawn and not excluded. */
  readonly eligibleBids = computed(() =>
    this.bids().filter((bid) => !bid.withdrawal && !bid.excluded),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get(this.tenderId).subscribe({
      next: (view) => {
        this.apply(view);
        this.loading.set(false);
        const asked = this.route.snapshot.queryParamMap.get('act') as PostOpeningAction | null;
        this.pick(
          asked && view.acts.some((act) => act.action === asked && act.canRequest) ? asked : null,
        );
        this.openingBidId = this.route.snapshot.queryParamMap.get('bid') ?? '';
        if (
          view.bidsOpened &&
          view.acts.some((act) => act.canRequest && BID_ACTS.includes(act.action))
        )
          this.evaluation.opening(this.tenderId).subscribe({
            next: (opening) => this.bids.set(opening.opening?.bids ?? []),
            error: () => this.bids.set([]),
          });
      },
      error: (error: unknown) => {
        this.error.set(tenderProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  pick(action: PostOpeningAction | null): void {
    this.action.set(action ?? this.requestable()[0]?.action ?? null);
    this.key = requestKey();
  }

  comment(id: string): string {
    return this.comments()[id] ?? '';
  }

  setComment(id: string, value: string): void {
    this.comments.update((all) => ({ ...all, [id]: value }));
  }

  blockerText(item: PostOpeningRequest): string {
    return (
      knownProductProblem({
        code: item.decideBlocker ?? undefined,
        parameters: { role: item.approverRole },
      }) ?? ''
    );
  }

  submit(): void {
    const action = this.action();
    if (!action || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .request(
        this.tenderId,
        action,
        this.bidAct() ? this.openingBidId : null,
        this.reason.trim(),
        this.evidence.trim(),
        this.key,
      )
      .subscribe({
        next: (view) => {
          this.apply(view);
          this.reason = '';
          this.evidence = '';
          this.key = requestKey();
          this.busy.set(false);
          this.notice.set(
            $localize`:@@postOpening.requested:Requested. It takes effect only when the approver approves it.`,
          );
        },
        error: (error: unknown) => {
          this.error.set(tenderProblemMessage(error));
          this.busy.set(false);
        },
      });
  }

  decide(item: PostOpeningRequest, approve: boolean): void {
    if (this.busy()) return;
    const comment = this.comment(item.id).trim();
    this.busy.set(true);
    this.error.set('');
    this.api.decide(this.tenderId, item, approve, comment || null).subscribe({
      next: (view) => {
        this.apply(view);
        this.busy.set(false);
        this.notice.set(
          approve
            ? $localize`:@@postOpening.approved:Approved. It is now in effect.`
            : $localize`:@@postOpening.rejectedNotice:Rejected. Nothing changed.`,
        );
      },
      error: (error: unknown) => {
        this.error.set(tenderProblemMessage(error));
        this.busy.set(false);
      },
    });
  }

  private apply(view: PostOpeningWorkspace): void {
    this.view.set(view);
  }
}
