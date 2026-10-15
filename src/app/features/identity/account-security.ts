import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { problemMessage } from '../../core/localization/product-problem';

/**
 * Phase 2 SI-089: the signed-in member's own account security — change the password (the current one and, when the account has an
 * authenticator, a fresh code; every session ends, so the member signs in again) and replace the recovery codes (a fresh authenticator code;
 * the old codes stop working; the new ones are shown once). The server decides; the mailbox is told of each change.
 */
@Component({
  selector: 'app-account-security',
  imports: [FormsModule],
  template: `
    <section class="prj-page" aria-labelledby="account-security-title">
      <h1 id="account-security-title" i18n="@@account.title">Account security</h1>
      @if (error()) {
        <p class="prj-error" role="alert" tabindex="-1" id="account-security-error">
          {{ error() }}
        </p>
      }
      @if (notice()) {
        <p class="prj-note" role="status">{{ notice() }}</p>
      }

      <form class="prj-card account-form" (ngSubmit)="changePassword()" #passwordForm="ngForm">
        <h2 i18n="@@account.passwordTitle">Change your password</h2>
        <p class="prj-hint" i18n="@@account.passwordHint">
          Use 12 to 128 characters. Every session of your account ends, this one too, and you sign
          in again with the new password.
        </p>
        <label for="account-current" i18n="@@account.current">Current password</label>
        <input
          id="account-current"
          name="current"
          type="password"
          autocomplete="current-password"
          required
          [(ngModel)]="current"
        />
        <label for="account-new" i18n="@@account.new">New password</label>
        <input
          id="account-new"
          name="next"
          type="password"
          autocomplete="new-password"
          minlength="12"
          maxlength="128"
          required
          [(ngModel)]="next"
        />
        <label for="account-password-code" i18n="@@account.code"
          >Code from your authenticator app (if you have one)</label
        >
        <input
          id="account-password-code"
          name="passwordCode"
          class="account-code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="8"
          [(ngModel)]="passwordCode"
        />
        <button
          class="prj-btn"
          type="submit"
          data-testid="change-password"
          [disabled]="passwordForm.invalid || busy()"
        >
          <span i18n="@@account.changePassword">Change password</span>
        </button>
      </form>

      <section class="prj-card account-form" aria-labelledby="account-codes-title">
        <h2 id="account-codes-title" i18n="@@account.codesTitle">Recovery codes</h2>
        @if (codes(); as list) {
          <p i18n="@@mfa.recoveryIntro">
            If you lose your phone, each of these codes signs you in once instead of an
            authenticator code. Keep them somewhere safe; they are shown only now.
          </p>
          <ul class="recovery-codes" dir="ltr" data-testid="new-recovery-codes">
            @for (code of list; track code) {
              <li>
                <code>{{ code }}</code>
              </li>
            }
          </ul>
        } @else {
          <p class="prj-hint" i18n="@@account.codesHint">
            New codes replace every unused one. Confirm with a code from your authenticator app.
          </p>
          <form class="account-inline" (ngSubmit)="regenerate()" #codesForm="ngForm">
            <label for="account-codes-code" i18n="@@account.authenticatorCode"
              >Code from your authenticator app</label
            >
            <input
              id="account-codes-code"
              name="codesCode"
              class="account-code"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="8"
              minlength="6"
              required
              [(ngModel)]="codesCode"
            />
            <button
              class="prj-btn prj-btn--ghost"
              type="submit"
              data-testid="regenerate-codes"
              [disabled]="codesForm.invalid || busy()"
            >
              <span i18n="@@account.regenerate">Create new recovery codes</span>
            </button>
          </form>
        }
      </section>
    </section>
  `,
  styles: `
    .account-form {
      display: grid;
      gap: 0.5rem;
      max-inline-size: 32rem;
      margin-block-end: 1rem;
    }
    .account-inline {
      display: grid;
      gap: 0.5rem;
    }
    .account-code {
      inline-size: 9rem;
      direction: ltr;
      font-variant-numeric: tabular-nums;
    }
    .recovery-codes {
      columns: 2;
      padding-inline-start: 1.25rem;
    }
  `,
})
export class AccountSecurityPage {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  current = '';
  next = '';
  passwordCode = '';
  codesCode = '';
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly codes = signal<readonly string[] | null>(null);

  changePassword(): void {
    if (this.busy()) return;
    this.start();
    this.http
      .post<void>('/api/v1/auth/password', {
        currentPassword: this.current,
        newPassword: this.next,
        code: this.passwordCode.trim() || null,
      })
      .subscribe({
        next: () => {
          // Every session ended on the server, this one too: sign in again with the new password.
          this.busy.set(false);
          this.session.clear();
          void this.router.navigate(['/login']);
        },
        error: (error: unknown) => this.failed(error),
      });
  }

  regenerate(): void {
    if (this.busy()) return;
    this.start();
    this.http
      .post<{ recoveryCodes: readonly string[] }>('/api/v1/auth/recovery-codes', {
        code: this.codesCode.trim(),
      })
      .subscribe({
        next: (response) => {
          this.busy.set(false);
          this.codesCode = '';
          this.codes.set(response.recoveryCodes);
          this.notice.set(
            $localize`:@@account.codesReplaced:New recovery codes are ready. The previous ones no longer work.`,
          );
        },
        error: (error: unknown) => this.failed(error),
      });
  }

  private start(): void {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
  }

  private failed(error: unknown): void {
    this.busy.set(false);
    this.passwordCode = '';
    this.codesCode = '';
    this.error.set(problemMessage(error, { plane: 'tenant' }));
    setTimeout(() => document.getElementById('account-security-error')?.focus());
  }
}
