import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { tenantRoleLabel } from '../../core/auth/tenant-role-labels';
import { problemMessage } from '../../core/localization/product-problem';
import { requestKey } from '../../shared/util/request-key';
import { ProjectSummary, ProjectsApi, WorkPackageSummary } from '../projects/projects.api';
import { DirectoryApi, SubcontractorSummary } from '../subcontractors/subcontractors.api';

export type DirectAwardStatus = 'Pending' | 'Approved' | 'Rejected' | 'Ratified';

export interface DirectAward {
  readonly id: string;
  readonly workPackageCode: string;
  readonly workPackageTitle: string;
  readonly projectCode: string;
  readonly subcontractorCode: string;
  readonly subcontractorName: string;
  readonly value: string;
  readonly currency: string;
  readonly reason: string;
  readonly evidenceReference: string;
  readonly approverRole: string;
  readonly ratificationDays: number;
  readonly status: DirectAwardStatus;
  readonly requestedAtUtc: string;
  readonly requestedByName: string;
  readonly requestedByMe: boolean;
  readonly decidedAtUtc: string | null;
  readonly decidedByName: string | null;
  readonly decisionComment: string | null;
  readonly ratifyByUtc: string | null;
  readonly ratificationOverdue: boolean;
  readonly ratifiedAtUtc: string | null;
  readonly ratifiedByName: string | null;
  readonly ratifiedLate: boolean;
  readonly ratificationComment: string | null;
  readonly version: string;
  readonly canDecide: boolean;
  readonly canRatify: boolean;
  readonly decideBlocker: string | null;
}

export interface DirectAwards {
  readonly items: readonly DirectAward[];
  readonly approverRole: string | null;
  readonly ratificationDays: number | null;
  readonly canRequest: boolean;
}

export function directAwardStatusLabel(status: DirectAwardStatus): string {
  switch (status) {
    case 'Pending':
      return $localize`:@@directAward.pending:Waiting for approval`;
    case 'Approved':
      return $localize`:@@directAward.approved:Approved — to be ratified`;
    case 'Rejected':
      return $localize`:@@directAward.rejected:Rejected`;
    default:
      return $localize`:@@directAward.ratified:Ratified`;
  }
}

/**
 * Phase 1 SI-124 (ADR-184): emergency direct awards — requested with the work package, the firm, the value, a reason and evidence; approved by
 * the company's configured role (never the requester); ratified within the company's days. Every step is in the exceptions register.
 */
@Component({
  selector: 'app-direct-awards-page',
  imports: [FormsModule, BusinessDatePipe],
  template: `
    <section class="prj-page">
      <div class="prj-head">
        <div>
          <h1 i18n="@@directAward.title">Emergency direct awards</h1>
          <p class="prj-hint" i18n="@@directAward.intro">
            Work given to a firm without a competition, in an emergency. Each one is approved by the
            company's named role — never by the person who asks — and ratified within the company's
            period. Every step is in the exceptions register.
          </p>
        </div>
      </div>
      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="prj-note" role="status">{{ notice() }}</p>
      }
      @if (view(); as data) {
        @if (!data.approverRole) {
          <p class="prj-note" data-testid="direct-award-off" i18n="@@directAward.off">
            Direct awards are off. A Company Admin can turn them on in procurement governance by
            naming who approves them and the ratification period.
          </p>
        } @else {
          <p class="prj-hint">
            <ng-container i18n="@@directAward.rules"
              >Approved by: {{ roleText(data.approverRole) }}. Ratify within
              {{ data.ratificationDays }} days of approval.</ng-container
            >
          </p>
        }
        @if (data.canRequest) {
          <form class="prj-section" (ngSubmit)="request()" aria-labelledby="da-request-title">
            <h2 id="da-request-title" i18n="@@directAward.request">Request a direct award</h2>
            <div class="prj-grid">
              <div class="prj-field">
                <label for="da-project" i18n="@@directAward.project">Project</label>
                <select
                  id="da-project"
                  name="project"
                  [(ngModel)]="projectId"
                  (ngModelChange)="loadPackages()"
                >
                  <option value="" i18n="@@directAward.choose">Choose…</option>
                  @for (project of projects(); track project.id) {
                    <option [value]="project.id">{{ project.code }} — {{ project.name }}</option>
                  }
                </select>
              </div>
              <div class="prj-field">
                <label for="da-package" i18n="@@directAward.package">Work package</label>
                <select id="da-package" name="package" [(ngModel)]="workPackageId">
                  <option value="" i18n="@@directAward.choose">Choose…</option>
                  @for (pkg of packages(); track pkg.id) {
                    <option [value]="pkg.id">{{ pkg.code }} — {{ pkg.title }}</option>
                  }
                </select>
              </div>
              <div class="prj-field">
                <label for="da-firm-search" i18n="@@directAward.firmSearch"
                  >Find the subcontractor</label
                >
                <input
                  id="da-firm-search"
                  name="firmSearch"
                  [(ngModel)]="firmSearch"
                  (ngModelChange)="searchFirms()"
                />
                <select
                  id="da-firm"
                  name="firm"
                  [(ngModel)]="subcontractorId"
                  [attr.aria-label]="firmLabel"
                >
                  <option value="" i18n="@@directAward.choose">Choose…</option>
                  @for (firm of firms(); track firm.id) {
                    <option [value]="firm.id">{{ firm.code }} — {{ firm.legalName }}</option>
                  }
                </select>
              </div>
              <div class="prj-field">
                <label for="da-value" i18n="@@directAward.value">Value (project currency)</label>
                <input
                  id="da-value"
                  name="value"
                  dir="ltr"
                  inputmode="decimal"
                  [(ngModel)]="value"
                />
              </div>
              <div class="prj-field prj-span-all">
                <label for="da-reason" i18n="@@directAward.reason"
                  >Why it cannot wait for a competition</label
                >
                <textarea
                  id="da-reason"
                  name="reason"
                  rows="3"
                  maxlength="2000"
                  [(ngModel)]="reason"
                ></textarea>
              </div>
              <div class="prj-field">
                <label for="da-evidence" i18n="@@directAward.evidence">Evidence reference</label>
                <input id="da-evidence" name="evidence" maxlength="300" [(ngModel)]="evidence" />
              </div>
            </div>
            <button
              class="prj-btn prj-btn--primary"
              type="submit"
              [disabled]="busy()"
              i18n="@@directAward.submit"
            >
              Request approval
            </button>
          </form>
        }
        @if (!data.items.length) {
          <p class="prj-hint" i18n="@@directAward.none">No direct award has been requested.</p>
        }
        @for (item of data.items; track item.id) {
          <article class="prj-section" [attr.data-testid]="'direct-award-' + item.id">
            <h2>
              <bdi>{{ item.workPackageCode }}</bdi> — <bdi>{{ item.subcontractorName }}</bdi>
            </h2>
            <p>
              <strong>{{ statusLabel(item.status) }}</strong>
              @if (item.ratificationOverdue) {
                <span class="prj-chip" i18n="@@directAward.overdue">Ratification overdue</span>
              }
              @if (item.ratifiedLate) {
                <span class="prj-chip" i18n="@@directAward.late">Ratified late</span>
              }
            </p>
            <dl class="prj-dl">
              <div>
                <dt i18n="@@directAward.value">Value (project currency)</dt>
                <dd>
                  <bdi dir="ltr">{{ item.value }} {{ item.currency }}</bdi>
                </dd>
              </div>
              <div>
                <dt i18n="@@directAward.requestedBy">Requested by</dt>
                <dd>
                  <bdi>{{ item.requestedByName }}</bdi> ·
                  {{ item.requestedAtUtc | businessDate: 'instant' }}
                </dd>
              </div>
              <div class="prj-span-all">
                <dt i18n="@@directAward.reason">Why it cannot wait for a competition</dt>
                <dd>
                  <bdi>{{ item.reason }}</bdi>
                </dd>
              </div>
              <div>
                <dt i18n="@@directAward.evidence">Evidence reference</dt>
                <dd>
                  <bdi>{{ item.evidenceReference }}</bdi>
                </dd>
              </div>
              @if (item.decidedByName) {
                <div>
                  <dt i18n="@@directAward.decidedBy">Decided by</dt>
                  <dd>
                    <bdi>{{ item.decidedByName }}</bdi>
                    @if (item.decisionComment) {
                      — <bdi>{{ item.decisionComment }}</bdi>
                    }
                  </dd>
                </div>
              }
              @if (item.ratifyByUtc) {
                <div>
                  <dt i18n="@@directAward.ratifyBy">Ratify by</dt>
                  <dd>{{ item.ratifyByUtc | businessDate: 'instant' }}</dd>
                </div>
              }
              @if (item.ratifiedByName) {
                <div>
                  <dt i18n="@@directAward.ratifiedBy">Ratified by</dt>
                  <dd>
                    <bdi>{{ item.ratifiedByName }}</bdi> ·
                    {{ item.ratifiedAtUtc | businessDate: 'instant' }}
                  </dd>
                </div>
              }
            </dl>
            @if (item.canDecide || item.canRatify) {
              <div class="prj-field">
                <label [for]="'da-comment-' + item.id" i18n="@@directAward.comment">Comment</label>
                <textarea
                  [id]="'da-comment-' + item.id"
                  rows="2"
                  maxlength="1000"
                  [ngModel]="comments[item.id] ?? ''"
                  (ngModelChange)="comments[item.id] = $event"
                  [ngModelOptions]="{ standalone: true }"
                ></textarea>
              </div>
              <div class="prj-actions">
                @if (item.canDecide) {
                  <button
                    class="prj-btn prj-btn--primary"
                    type="button"
                    [disabled]="busy()"
                    (click)="decide(item, true)"
                    i18n="@@directAward.approve"
                  >
                    Approve
                  </button>
                  <button
                    class="prj-btn"
                    type="button"
                    [disabled]="busy() || !(comments[item.id] ?? '').trim()"
                    (click)="decide(item, false)"
                    i18n="@@directAward.reject"
                  >
                    Reject
                  </button>
                }
                @if (item.canRatify) {
                  <button
                    class="prj-btn prj-btn--primary"
                    type="button"
                    [disabled]="busy()"
                    (click)="ratify(item)"
                    i18n="@@directAward.ratify"
                  >
                    Ratify
                  </button>
                }
              </div>
            } @else if (
              item.requestedByMe && (item.status === 'Pending' || item.status === 'Approved')
            ) {
              <p class="prj-hint" i18n="@@directAward.notYours">
                You requested this, so someone else must decide and ratify it.
              </p>
            }
          </article>
        }
      }
    </section>
  `,
})
export class DirectAwardsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly directory = inject(DirectoryApi);
  private readonly session = inject(SessionService);

  readonly view = signal<DirectAwards | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);
  readonly projects = signal<readonly ProjectSummary[]>([]);
  readonly packages = signal<readonly WorkPackageSummary[]>([]);
  readonly firms = signal<readonly SubcontractorSummary[]>([]);
  readonly statusLabel = directAwardStatusLabel;
  readonly firmLabel = $localize`:@@directAward.firm:Subcontractor`;
  readonly comments: Record<string, string> = {};

  projectId = '';
  workPackageId = '';
  firmSearch = '';
  subcontractorId = '';
  value = '';
  reason = '';
  evidence = '';
  private key = '';

  ngOnInit(): void {
    this.load();
    if (this.session.hasPermission('Decision.Submit')) {
      this.projectsApi.listProjects({ pageSize: 100 }).subscribe({
        next: (page) => this.projects.set(page.items),
        error: () => this.projects.set([]),
      });
      this.searchFirms();
    }
  }

  roleText(role: string): string {
    return tenantRoleLabel(role);
  }

  load(): void {
    this.http.get<DirectAwards>('/api/v1/direct-awards').subscribe({
      next: (data) => this.view.set(data),
      error: (error: unknown) => this.error.set(problemMessage(error)),
    });
  }

  loadPackages(): void {
    this.workPackageId = '';
    this.packages.set([]);
    if (!this.projectId) return;
    this.projectsApi.listWorkPackages(this.projectId).subscribe({
      next: (page) => this.packages.set(page.items),
      error: () => this.packages.set([]),
    });
  }

  searchFirms(): void {
    this.directory.list({ search: this.firmSearch, status: ['Active'], pageSize: 20 }).subscribe({
      next: (page) => this.firms.set(page.items),
      error: () => this.firms.set([]),
    });
  }

  request(): void {
    if (this.busy()) return;
    this.key ||= requestKey();
    this.run(
      this.http.post<DirectAwards>('/api/v1/direct-awards', {
        workPackageId: this.workPackageId,
        subcontractorId: this.subcontractorId,
        value: this.value.trim(),
        reason: this.reason.trim(),
        evidenceReference: this.evidence.trim(),
        requestKey: this.key,
      }),
      $localize`:@@directAward.requested:Requested. Nothing is approved until the named role approves it.`,
      () => {
        this.key = '';
        this.reason = '';
        this.evidence = '';
        this.value = '';
      },
    );
  }

  decide(item: DirectAward, approve: boolean): void {
    this.run(
      this.http.post<DirectAwards>(`/api/v1/direct-awards/${item.id}/decision`, {
        approve,
        comment: (this.comments[item.id] ?? '').trim() || null,
        version: item.version,
      }),
      approve
        ? $localize`:@@directAward.approvedNotice:Approved. Ratify it within the company's period.`
        : $localize`:@@directAward.rejectedNotice:Rejected.`,
    );
  }

  ratify(item: DirectAward): void {
    this.run(
      this.http.post<DirectAwards>(`/api/v1/direct-awards/${item.id}/ratification`, {
        comment: (this.comments[item.id] ?? '').trim() || null,
        version: item.version,
      }),
      $localize`:@@directAward.ratifiedNotice:Ratified.`,
    );
  }

  private run(call: Observable<DirectAwards>, message: string, after?: () => void): void {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    call.subscribe({
      next: (data) => {
        this.busy.set(false);
        this.view.set(data);
        this.notice.set(message);
        after?.();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(problemMessage(error));
        this.load();
      },
    });
  }
}
