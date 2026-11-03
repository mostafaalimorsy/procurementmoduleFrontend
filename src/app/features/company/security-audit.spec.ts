import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SecurityAudit } from './security-audit';
import type { SecurityAlert, SecurityAlertPage, SecurityAlertPolicy } from './company.api';

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

const alert = (overrides: Partial<SecurityAlert> = {}): SecurityAlert => ({
  id: 'a1',
  rule: 'export_burst',
  severity: 'Medium',
  detectedAtUtc: '2026-10-16T09:00:00Z',
  windowFromUtc: '2026-10-16T08:00:00Z',
  windowToUtc: '2026-10-16T09:00:00Z',
  count: 12,
  subjectRef: 'user:alpha',
  status: 'Open',
  acknowledgedBy: null,
  acknowledgedAtUtc: null,
  resolvedBy: null,
  resolvedAtUtc: null,
  resolutionNote: null,
  version: 'v1',
  ...overrides,
});

const policy = (overrides: Partial<SecurityAlertPolicy> = {}): SecurityAlertPolicy => ({
  loginFailedThreshold: 5,
  loginFailedWindowMinutes: 15,
  exportBurstEnabled: true,
  exportThreshold: 10,
  exportWindowMinutes: 60,
  downloadBurstEnabled: true,
  downloadThreshold: 30,
  downloadWindowMinutes: 60,
  isDefault: true,
  canManage: true,
  updatedAtUtc: null,
  version: 'p1',
  ...overrides,
});

function render(page: SecurityAlertPage, settings: SecurityAlertPolicy) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(SecurityAudit);
  fixture.detectChanges();
  http.expectOne('/api/v1/company/security-alerts?openOnly=false').flush(page);
  http.expectOne('/api/v1/company/security-monitoring').flush(settings);
  fixture.detectChanges();
  return { http, fixture, element: fixture.nativeElement as HTMLElement };
}

describe('security & audit screen (Feature M/N)', () => {
  it('lists alerts and acknowledges one with its version', () => {
    const { http, fixture, element } = render(
      { alerts: [alert()], total: 1, openCount: 1 },
      policy(),
    );
    expect(text(element)).toContain('Burst of data exports');
    expect(text(element)).toContain('Medium');
    (
      [...element.querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').includes('Acknowledge'),
      ) as HTMLButtonElement
    ).click();
    const ack = http.expectOne('/api/v1/company/security-alerts/a1/acknowledge');
    expect(ack.request.method).toBe('POST');
    expect(ack.request.body).toEqual({ version: 'v1' });
    ack.flush(alert({ status: 'Acknowledged', version: 'v2' }));
    // The list reloads after the change.
    http
      .expectOne('/api/v1/company/security-alerts?openOnly=false')
      .flush({ alerts: [alert({ status: 'Acknowledged' })], total: 1, openCount: 0 });
    fixture.detectChanges();
    expect(text(element)).toContain('Acknowledged');
  });

  it('resolves an alert with a note', () => {
    const { http, fixture, element } = render(
      { alerts: [alert()], total: 1, openCount: 1 },
      policy(),
    );
    (
      [...element.querySelectorAll('button')].find(
        (b) => (b.textContent ?? '').trim() === 'Resolve',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const note = element.querySelector('#resolve-a1') as HTMLInputElement;
    note.value = 'A scheduled report run.';
    note.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (
      [...element.querySelectorAll('button')].find(
        (b) => (b.textContent ?? '').trim() === 'Resolve alert',
      ) as HTMLButtonElement
    ).click();
    const resolve = http.expectOne('/api/v1/company/security-alerts/a1/resolve');
    expect(resolve.request.body).toEqual({ version: 'v1', note: 'A scheduled report run.' });
    resolve.flush(alert({ status: 'Resolved' }));
    http
      .expectOne('/api/v1/company/security-alerts?openOnly=false')
      .flush({ alerts: [], total: 0, openCount: 0 });
    fixture.detectChanges();
    expect(text(element)).toContain('No security alert to show.');
  });

  it('saves monitoring thresholds with the version', () => {
    const { http, element } = render({ alerts: [], total: 0, openCount: 0 }, policy());
    const exportThreshold = element.querySelector('#export-threshold') as HTMLInputElement;
    exportThreshold.value = '25';
    exportThreshold.dispatchEvent(new Event('input'));
    (
      [...element.querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').includes('Save thresholds'),
      ) as HTMLButtonElement
    ).click();
    const put = http.expectOne('/api/v1/company/security-monitoring');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toMatchObject({
      version: 'p1',
      exportThreshold: 25,
      exportBurstEnabled: true,
    });
    put.flush(policy({ exportThreshold: 25, isDefault: false }));
  });

  it('hides the save button when the admin cannot manage', () => {
    const { element } = render(
      { alerts: [], total: 0, openCount: 0 },
      policy({ canManage: false }),
    );
    expect(
      [...element.querySelectorAll('button')].some((b) =>
        (b.textContent ?? '').includes('Save thresholds'),
      ),
    ).toBe(false);
  });
});
