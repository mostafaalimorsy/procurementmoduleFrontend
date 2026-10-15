import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { TenantUser } from '../identity/tenant-identity.api';
import { UsersAdmin } from '../identity/users-admin';
import { CompanySettingsPage } from './company-settings';

// CF-071 (ADR-134): the company's own data lifecycle — the complete export and erasure on request.

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const button = (element: HTMLElement, label: string) =>
  Array.from(element.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  ) as HTMLButtonElement | undefined;

function user(overrides: Partial<TenantUser> = {}): TenantUser {
  return {
    id: 'u2',
    email: 'omar@delta.example',
    displayName: 'Omar Officer',
    role: 'ProcurementOfficer',
    additionalRoles: [],
    status: 'Suspended',
    passwordResetRequired: false,
    createdAtUtc: '2026-09-01T00:00:00Z',
    updatedAtUtc: '2026-09-02T00:00:00Z',
    ...overrides,
  };
}

describe('Company data lifecycle (CF-071)', () => {
  function users(list: TenantUser[], permissions: readonly string[]) {
    TestBed.configureTestingModule({
      imports: [UsersAdmin],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SessionService,
          useValue: {
            identity: () => ({ companyName: 'Delta', userId: 'u1' }),
            hasPermission: (permission: string) => permissions.includes(permission),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(UsersAdmin);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/admin/users').flush(list);
    for (const request of http.match('/api/v1/company/plan')) request.flush(null);
    fixture.detectChanges();
    return { fixture, http, element: fixture.nativeElement as HTMLElement };
  }

  it('erases a suspended former member in two steps, and offers it to nobody else', () => {
    const { fixture, http, element } = users(
      [user(), user({ id: 'u3', email: 'active@delta.example', status: 'Active' })],
      ['Users.View', 'Users.Suspend', 'Company.ManageData'],
    );
    const offers = Array.from(element.querySelectorAll('button')).filter((candidate) =>
      candidate.textContent?.includes('Erase personal data'),
    );
    expect(offers).toHaveLength(1);
    offers[0].click();
    fixture.detectChanges();
    http.expectNone('/api/v1/admin/users/u2/erase');
    button(element, 'Confirm: erase permanently')!.click();
    http.expectOne('/api/v1/admin/users/u2/erase').flush(null);
    fixture.detectChanges();
    expect(text(element)).toContain('attributed to an erased user');
  });

  it('never offers erasure without the data permission, or to an already erased account', () => {
    const { element } = users(
      [user(), user({ id: 'u4', email: 'erased-u4@erased.invalid', displayName: 'Erased user' })],
      ['Users.View', 'Users.Suspend'],
    );
    expect(button(element, 'Erase personal data')).toBeUndefined();
  });

  it('offers the complete export to company administration, confirmed with an authenticator code (SI-092)', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    (
      TestBed.inject(SessionService) as unknown as {
        currentIdentity: { set: (value: unknown) => void };
      }
    ).currentIdentity.set({
      userId: 'u1',
      tenantId: 't',
      roles: ['CompanyAdmin'],
      permissions: ['CompanyProfile.Manage', 'Company.ManageData'],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CompanySettingsPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/company/currencies').flush([]);
    http.expectOne('/api/v1/company/profile').flush({
      companyName: 'Delta',
      defaultCurrency: null,
      hasLogo: false,
      logoContentType: null,
      logoWidth: null,
      logoHeight: null,
      logoUpdatedAtUtc: null,
      canManage: true,
      version: 'v1',
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    // Phase 2 SI-092: never a plain link — the download is a POST confirmed with an authenticator code.
    const submit = element.querySelector('[data-testid="company-export"]') as HTMLButtonElement;
    expect(submit.tagName).toBe('BUTTON');
    expect(submit.disabled).toBe(true);
    expect(text(element)).toContain('Bids that are still sealed');
    const input = element.querySelector('#company-export-code') as HTMLInputElement;
    input.value = '000000';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(submit.disabled).toBe(false);
    submit.click();
    fixture.detectChanges();
    const refused = http.expectOne('/api/v1/admin/company-export');
    expect(refused.request.method).toBe('POST');
    expect(refused.request.body).toEqual({ code: '000000' });
    refused.flush(
      new Blob([JSON.stringify({ status: 400, code: 'auth.step_up_code_invalid' })], {
        type: 'application/problem+json',
      }),
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(element)).toContain('Enter the current code from your authenticator app');
    // A fresh code downloads the ZIP the server streamed.
    const save = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    input.value = '123456';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    submit.click();
    http.expectOne('/api/v1/admin/company-export').flush(new Blob(['PK']), {
      headers: {
        'Content-Disposition': 'attachment; filename=company-export-20261014T120000Z.zip',
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(save).toHaveBeenCalled();
    expect(text(element)).toContain('The export is downloaded');
    save.mockRestore();
  });
});
