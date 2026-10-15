import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { AccountSecurityPage } from './account-security';

// Phase 2 SI-089: the member's own password change and recovery-code replacement (the server decides; the page only asks).

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

function setup() {
  const clear = vi.fn();
  TestBed.configureTestingModule({
    imports: [AccountSecurityPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: SessionService, useValue: { clear } },
    ],
  });
  const fixture = TestBed.createComponent(AccountSecurityPage);
  fixture.detectChanges();
  return {
    fixture,
    clear,
    http: TestBed.inject(HttpTestingController),
    element: fixture.nativeElement as HTMLElement,
  };
}

describe('Account security (SI-089)', () => {
  it('changes the password with the current one and the authenticator code, then signs in again', async () => {
    const { fixture, clear, http, element } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const page = fixture.componentInstance;
    page.current = 'old-password-1234';
    page.next = 'new-password-5678';
    page.passwordCode = ' 123456 ';
    page.changePassword();
    const request = http.expectOne('/api/v1/auth/password');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      currentPassword: 'old-password-1234',
      newPassword: 'new-password-5678',
      code: '123456',
    });
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(clear).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);

    // A wrong current password is shown, and the session stays.
    page.changePassword();
    http
      .expectOne('/api/v1/auth/password')
      .flush(
        { status: 400, code: 'password.current_invalid' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(text(element)).toContain('The current password is not correct.');
  });

  it('replaces the recovery codes with an authenticator code and shows the new ones once', () => {
    const { fixture, http, element } = setup();
    const page = fixture.componentInstance;
    page.codesCode = '654321';
    page.regenerate();
    const request = http.expectOne('/api/v1/auth/recovery-codes');
    expect(request.request.body).toEqual({ code: '654321' });
    request.flush({ recoveryCodes: ['AAAA-BBBB', 'CCCC-DDDD'] });
    fixture.detectChanges();
    const listed = element.querySelector('[data-testid="new-recovery-codes"]') as HTMLElement;
    expect(text(listed)).toContain('AAAA-BBBB');
    expect(text(element)).toContain('The previous ones no longer work');
  });
});
