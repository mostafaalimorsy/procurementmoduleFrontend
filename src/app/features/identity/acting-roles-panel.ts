import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../core/auth/session.service';
import { tenantRoleLabel } from '../../core/auth/tenant-role-labels';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { problemMessage } from '../../core/localization/product-problem';
import { TenantUser } from './tenant-identity.api';

export interface ActingRoleGrant {
  readonly id: string;
  readonly accountId: string;
  readonly displayName: string;
  readonly role: string;
  readonly fromUtc: string;
  readonly toUtc: string;
  readonly reason: string;
  readonly grantedByName: string;
  readonly grantedAtUtc: string;
  readonly revokedAtUtc: string | null;
  readonly state: 'Upcoming' | 'Active' | 'Ended';
  readonly version: string;
}

export interface ActingRoles {
  readonly grants: readonly ActingRoleGrant[];
  readonly roles: readonly string[];
}

/**
 * Phase 1 SI-051 (ADR-184): time-bound acting approvers. A Company Admin lets a member act in a role that approves awards for a dated period
 * (at most 30 days) with a reason — e.g. while the only Director is away. The server refuses self-grants, role combinations the matrix forbids
 * and roles the member cannot sign in with; each approval given while acting is recorded as such.
 */
@Component({
  selector: 'app-acting-roles-panel',
  imports: [FormsModule, BusinessDatePipe],
  template: `
    <section class="prj-card" aria-labelledby="acting-title" data-testid="acting-roles">
      <h2 id="acting-title" i18n="@@acting.title">Acting approvers</h2>
      <p class="prj-hint" i18n="@@acting.intro">
        When an approver is away, let another member act in the approver role for a set period (at
        most 30 days). Their approvals are recorded as given while acting, and they never approve a
        decision they prepared or submitted.
      </p>
      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      }
      @for (grant of view()?.grants ?? []; track grant.id) {
        <div class="prj-note">
          <p>
            <bdi>{{ grant.displayName }}</bdi> · {{ roleLabel(grant.role) }} ·
            {{ stateLabel(grant.state) }}
          </p>
          <p class="prj-hint" i18n="@@acting.window">
            From {{ grant.fromUtc | businessDate: 'instant' }} to
            {{ grant.toUtc | businessDate: 'instant' }} — granted by
            <bdi>{{ grant.grantedByName }}</bdi
            >: <bdi>{{ grant.reason }}</bdi>
          </p>
          @if (canManage() && grant.state !== 'Ended') {
            <button
              class="prj-btn prj-btn--ghost"
              type="button"
              [disabled]="busy()"
              (click)="revoke(grant)"
              i18n="@@acting.revoke"
            >
              End now
            </button>
          }
        </div>
      }
      @if (canManage()) {
        <form class="prj-form" (ngSubmit)="grant()">
          <div class="prj-field">
            <label for="acting-member" i18n="@@acting.member">Member</label>
            <select id="acting-member" name="member" [(ngModel)]="member" required>
              @for (user of members(); track user.id) {
                <option [value]="user.id">{{ user.displayName }}</option>
              }
            </select>
          </div>
          <div class="prj-field">
            <label for="acting-role" i18n="@@acting.role">Acts as</label>
            <select id="acting-role" name="role" [(ngModel)]="role" required>
              @for (option of view()?.roles ?? []; track option) {
                <option [value]="option">{{ roleLabel(option) }}</option>
              }
            </select>
          </div>
          <div class="prj-field">
            <label for="acting-days" i18n="@@acting.days">For how many days, from now</label>
            <input id="acting-days" name="days" type="number" min="1" max="30" [(ngModel)]="days" />
          </div>
          <div class="prj-field">
            <label for="acting-reason" i18n="@@acting.reason">Reason</label>
            <input id="acting-reason" name="reason" maxlength="500" [(ngModel)]="reason" />
          </div>
          <button
            class="prj-btn"
            type="submit"
            [disabled]="busy() || !member || !role || reason.trim().length < 3"
            i18n="@@acting.grant"
          >
            Grant acting role
          </button>
        </form>
      }
    </section>
  `,
})
export class ActingRolesPanel implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  readonly view = signal<ActingRoles | null>(null);
  /** The company's members, as the users page already loaded them (no second directory request). */
  readonly users = input<readonly TenantUser[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly canManage = computed(() => this.session.hasPermission('Users.ChangeRole'));
  readonly members = computed(() => this.users().filter((user) => user.status === 'Active'));
  readonly roleLabel = tenantRoleLabel;
  member = '';
  role = '';
  days = 7;
  reason = '';

  ngOnInit(): void {
    this.load();
  }

  stateLabel(state: string): string {
    return state === 'Active'
      ? $localize`:@@acting.active:Acting now`
      : state === 'Upcoming'
        ? $localize`:@@acting.upcoming:Starts later`
        : $localize`:@@acting.ended:Ended`;
  }

  grant(): void {
    if (this.busy()) return;
    const from = new Date();
    const to = new Date(from.getTime() + Math.min(30, Math.max(1, Number(this.days))) * 86_400_000);
    this.busy.set(true);
    this.error.set('');
    this.http
      .post<ActingRoles>(`/api/v1/admin/users/${encodeURIComponent(this.member)}/acting-roles`, {
        role: this.role,
        fromUtc: from.toISOString(),
        toUtc: to.toISOString(),
        reason: this.reason.trim(),
      })
      .subscribe({
        next: (view) => {
          this.view.set(view);
          this.reason = '';
          this.busy.set(false);
        },
        error: (error: unknown) => {
          this.error.set(problemMessage(error));
          this.busy.set(false);
        },
      });
  }

  revoke(grant: ActingRoleGrant): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.http
      .post<ActingRoles>(`/api/v1/admin/acting-roles/${encodeURIComponent(grant.id)}/revoke`, {
        version: grant.version,
      })
      .subscribe({
        next: (view) => {
          this.view.set(view);
          this.busy.set(false);
        },
        error: (error: unknown) => {
          this.error.set(problemMessage(error));
          this.busy.set(false);
        },
      });
  }

  private load(): void {
    this.http.get<ActingRoles>('/api/v1/admin/acting-roles').subscribe({
      next: (view) => {
        this.view.set(view);
        this.role = view?.roles[0] ?? '';
      },
      error: (error: unknown) => this.error.set(problemMessage(error)),
    });
  }
}
