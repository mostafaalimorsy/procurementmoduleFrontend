import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { problemMessage } from '../../core/localization/product-problem';
import {
  SecurityApi,
  type SecurityAlert,
  type SecurityAlertPage,
  type SecurityAlertPolicy,
  type SecurityAlertSeverity,
} from './company.api';

/** Feature M: what each detection rule is called. */
export function securityRuleLabel(rule: string): string {
  const labels: Record<string, string> = {
    login_failed_burst: $localize`:@@security.ruleLoginFailed:Repeated failed sign-ins`,
    export_burst: $localize`:@@security.ruleExport:Burst of data exports`,
    download_burst: $localize`:@@security.ruleDownload:Burst of document downloads`,
  };
  return labels[rule] ?? rule;
}

/** Feature M: how serious the alert is, in words. */
export function severityLabel(severity: SecurityAlertSeverity): string {
  switch (severity) {
    case 'High':
      return $localize`:@@security.severityHigh:High`;
    case 'Medium':
      return $localize`:@@security.severityMedium:Medium`;
    default:
      return $localize`:@@security.severityLow:Low`;
  }
}

/**
 * Feature M/N (ADR-017): the company's Security & Audit screen — the security alerts the detector raised (worked by the Company Admin:
 * acknowledge, then resolve), and the monitoring thresholds the alerts are measured against. Read by Audit.View; the thresholds are changed by
 * the Company Admin. No secret, amount or bid content is shown — only the rule, the window and the count.
 */
@Component({
  selector: 'app-security-audit',
  imports: [FormsModule, BusinessDatePipe],
  template: `
    <section class="prj-page">
      <div class="prj-head">
        <div>
          <h1 i18n="@@security.title">Security &amp; audit</h1>
          <p class="prj-hint" i18n="@@security.intro">
            Security signals from your company's own activity — repeated failed sign-ins, and bursts
            of data exports or document downloads. Acknowledge each one and resolve it with a note.
            The thresholds below decide when a signal becomes an alert.
          </p>
        </div>
      </div>

      @if (error()) {
        <p class="prj-note prj-note--error" role="alert">{{ error() }}</p>
      }

      <h2 i18n="@@security.alertsHeading">Alerts</h2>
      <div class="prj-field">
        <label class="prj-check">
          <input type="checkbox" [(ngModel)]="openOnly" (ngModelChange)="loadAlerts()" />
          <span i18n="@@security.openOnly">Open and acknowledged only</span>
        </label>
      </div>
      @if (page(); as data) {
        @if (!data.alerts.length) {
          <p class="prj-hint" i18n="@@security.noAlerts">No security alert to show.</p>
        } @else {
          <table class="prj-table">
            <thead>
              <tr>
                <th scope="col" i18n="@@security.when">Detected</th>
                <th scope="col" i18n="@@security.rule">Signal</th>
                <th scope="col" i18n="@@security.severity">Severity</th>
                <th scope="col" i18n="@@security.count">Events</th>
                <th scope="col" i18n="@@security.status">Status</th>
                <th scope="col" i18n="@@security.action">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (alert of data.alerts; track alert.id) {
                <tr>
                  <td>{{ alert.detectedAtUtc | businessDate: 'instant' }}</td>
                  <td>{{ ruleLabel(alert.rule) }}</td>
                  <td>{{ severity(alert.severity) }}</td>
                  <td>{{ alert.count }}</td>
                  <td>{{ statusLabel(alert) }}</td>
                  <td>
                    @if (alert.status === 'Open') {
                      <button
                        type="button"
                        class="prj-btn prj-btn--ghost"
                        (click)="acknowledge(alert)"
                        i18n="@@security.acknowledge"
                      >
                        Acknowledge
                      </button>
                    }
                    @if (alert.status !== 'Resolved') {
                      <button
                        type="button"
                        class="prj-btn prj-btn--ghost"
                        (click)="startResolve(alert)"
                        i18n="@@security.resolve"
                      >
                        Resolve
                      </button>
                    }
                    @if (alert.status === 'Resolved' && alert.resolutionNote) {
                      <bdi>{{ alert.resolutionNote }}</bdi>
                    }
                  </td>
                </tr>
                @if (resolving() === alert.id) {
                  <tr>
                    <td colspan="6">
                      <div class="prj-field">
                        <label [attr.for]="'resolve-' + alert.id" i18n="@@security.resolveNote"
                          >Resolution note (optional)</label
                        >
                        <input
                          [id]="'resolve-' + alert.id"
                          name="note"
                          [(ngModel)]="note"
                          maxlength="1000"
                        />
                      </div>
                      <button
                        type="button"
                        class="prj-btn"
                        (click)="confirmResolve(alert)"
                        i18n="@@security.confirmResolve"
                      >
                        Resolve alert
                      </button>
                      <button
                        type="button"
                        class="prj-btn prj-btn--ghost"
                        (click)="cancelResolve()"
                        i18n="@@security.cancel"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        }
      }

      <h2 i18n="@@security.monitoringHeading">Monitoring thresholds</h2>
      @if (policy(); as settings) {
        <p class="prj-hint" i18n="@@security.monitoringIntro">
          A signal becomes an alert when it reaches its threshold within its window. Repeated failed
          sign-ins are always monitored and cannot be switched off.
        </p>
        <fieldset class="prj-fieldset" [disabled]="!settings.canManage">
          <div class="prj-field">
            <span class="prj-label" i18n="@@security.loginRule"
              >Repeated failed sign-ins (always on)</span
            >
            <label [attr.for]="'login-threshold'" i18n="@@security.threshold">Threshold</label>
            <input
              id="login-threshold"
              type="number"
              name="loginThreshold"
              min="2"
              max="1000"
              [(ngModel)]="form.loginFailedThreshold"
            />
            <label [attr.for]="'login-window'" i18n="@@security.windowMinutes"
              >Window (minutes)</label
            >
            <input
              id="login-window"
              type="number"
              name="loginWindow"
              min="1"
              max="1440"
              [(ngModel)]="form.loginFailedWindowMinutes"
            />
          </div>
          <div class="prj-field">
            <label class="prj-check">
              <input type="checkbox" name="exportEnabled" [(ngModel)]="form.exportBurstEnabled" />
              <span i18n="@@security.exportRule">Burst of data exports</span>
            </label>
            <label [attr.for]="'export-threshold'" i18n="@@security.threshold">Threshold</label>
            <input
              id="export-threshold"
              type="number"
              name="exportThreshold"
              min="2"
              max="1000"
              [(ngModel)]="form.exportThreshold"
              [disabled]="!form.exportBurstEnabled"
            />
            <label [attr.for]="'export-window'" i18n="@@security.windowMinutes"
              >Window (minutes)</label
            >
            <input
              id="export-window"
              type="number"
              name="exportWindow"
              min="1"
              max="1440"
              [(ngModel)]="form.exportWindowMinutes"
              [disabled]="!form.exportBurstEnabled"
            />
          </div>
          <div class="prj-field">
            <label class="prj-check">
              <input
                type="checkbox"
                name="downloadEnabled"
                [(ngModel)]="form.downloadBurstEnabled"
              />
              <span i18n="@@security.downloadRule">Burst of document downloads</span>
            </label>
            <label [attr.for]="'download-threshold'" i18n="@@security.threshold">Threshold</label>
            <input
              id="download-threshold"
              type="number"
              name="downloadThreshold"
              min="2"
              max="1000"
              [(ngModel)]="form.downloadThreshold"
              [disabled]="!form.downloadBurstEnabled"
            />
            <label [attr.for]="'download-window'" i18n="@@security.windowMinutes"
              >Window (minutes)</label
            >
            <input
              id="download-window"
              type="number"
              name="downloadWindow"
              min="1"
              max="1440"
              [(ngModel)]="form.downloadWindowMinutes"
              [disabled]="!form.downloadBurstEnabled"
            />
          </div>
          @if (settings.canManage) {
            <button type="button" class="prj-btn" (click)="saveMonitoring()" i18n="@@security.save">
              Save thresholds
            </button>
          }
          @if (saved()) {
            <p class="prj-note prj-note--ok" role="status" i18n="@@security.saved">
              Thresholds saved.
            </p>
          }
        </fieldset>
      }
    </section>
  `,
})
export class SecurityAudit implements OnInit {
  private readonly api = inject(SecurityApi);
  readonly page = signal<SecurityAlertPage | null>(null);
  readonly policy = signal<SecurityAlertPolicy | null>(null);
  readonly error = signal('');
  readonly saved = signal(false);
  readonly resolving = signal<string | null>(null);
  readonly ruleLabel = securityRuleLabel;
  readonly severity = severityLabel;
  openOnly = false;
  note = '';
  form = {
    loginFailedThreshold: 5,
    loginFailedWindowMinutes: 15,
    exportBurstEnabled: true,
    exportThreshold: 10,
    exportWindowMinutes: 60,
    downloadBurstEnabled: true,
    downloadThreshold: 30,
    downloadWindowMinutes: 60,
  };

  readonly openCount = computed(() => this.page()?.openCount ?? 0);

  ngOnInit(): void {
    this.loadAlerts();
    this.loadMonitoring();
  }

  statusLabel(alert: SecurityAlert): string {
    switch (alert.status) {
      case 'Acknowledged':
        return $localize`:@@security.statusAcknowledged:Acknowledged`;
      case 'Resolved':
        return $localize`:@@security.statusResolved:Resolved`;
      default:
        return $localize`:@@security.statusOpen:Alert open`;
    }
  }

  loadAlerts(): void {
    this.api.alerts(this.openOnly).subscribe({
      next: (page) => {
        this.page.set(page);
        this.error.set('');
      },
      error: (error: unknown) => this.error.set(problemMessage(error)),
    });
  }

  loadMonitoring(): void {
    this.api.monitoring().subscribe({
      next: (policy) => {
        this.policy.set(policy);
        this.form = {
          loginFailedThreshold: policy.loginFailedThreshold,
          loginFailedWindowMinutes: policy.loginFailedWindowMinutes,
          exportBurstEnabled: policy.exportBurstEnabled,
          exportThreshold: policy.exportThreshold,
          exportWindowMinutes: policy.exportWindowMinutes,
          downloadBurstEnabled: policy.downloadBurstEnabled,
          downloadThreshold: policy.downloadThreshold,
          downloadWindowMinutes: policy.downloadWindowMinutes,
        };
      },
      error: (error: unknown) => this.error.set(problemMessage(error)),
    });
  }

  acknowledge(alert: SecurityAlert): void {
    this.api.acknowledge(alert.id, alert.version).subscribe({
      next: () => this.loadAlerts(),
      error: (error: unknown) => this.error.set(problemMessage(error)),
    });
  }

  startResolve(alert: SecurityAlert): void {
    this.resolving.set(alert.id);
    this.note = '';
  }

  cancelResolve(): void {
    this.resolving.set(null);
    this.note = '';
  }

  confirmResolve(alert: SecurityAlert): void {
    this.api.resolve(alert.id, alert.version, this.note.trim() || null).subscribe({
      next: () => {
        this.resolving.set(null);
        this.note = '';
        this.loadAlerts();
      },
      error: (error: unknown) => this.error.set(problemMessage(error)),
    });
  }

  saveMonitoring(): void {
    const version = this.policy()?.version;
    if (!version) return;
    this.saved.set(false);
    this.api.updateMonitoring({ version, ...this.form }).subscribe({
      next: (policy) => {
        this.policy.set(policy);
        this.saved.set(true);
        this.error.set('');
      },
      error: (error: unknown) => this.error.set(problemMessage(error)),
    });
  }
}
