import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { opened } from '../evaluation/evaluation.fixtures';
import { PostOpeningPage } from './post-opening-page';
import { PostOpeningRequest, PostOpeningWorkspace } from './tendering.api';

/** Phase 1 D02 (ADR-183): post-opening acts are requested with a reason and evidence and decided by the company's configured approver. */
function render(query: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ id: 't1' }),
            queryParamMap: convertToParamMap(query),
          },
        },
      },
    ],
  });
  (
    TestBed.inject(SessionService) as unknown as {
      currentIdentity: { set: (value: unknown) => void };
    }
  ).currentIdentity.set({ userId: 'u1', tenantId: 't', roles: [], permissions: ['Tenders.View'] });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(PostOpeningPage);
  fixture.detectChanges();
  return {
    http,
    fixture,
    element: fixture.nativeElement as HTMLElement,
    page: fixture.componentInstance,
  };
}

const text = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const button = (element: HTMLElement, label: string) =>
  Array.from(element.querySelectorAll('button')).find((item) =>
    (item.textContent ?? '').includes(label),
  );

const request = (overrides: Partial<PostOpeningRequest> = {}): PostOpeningRequest => ({
  id: 'r1',
  action: 'TenderCancellation',
  openingBidId: null,
  subcontractorCode: null,
  reason: 'Client stopped the project',
  evidenceReference: 'Minute 12',
  approverRole: 'ApproverDirector',
  requestedAtUtc: '2026-10-09T10:00:00Z',
  requestedByName: 'Maha Manager',
  requestedByMe: false,
  status: 'Pending',
  decidedAtUtc: null,
  decidedByName: null,
  decisionComment: null,
  version: 'v1',
  canDecide: true,
  decideBlocker: null,
  ...overrides,
});

const workspace = (overrides: Partial<PostOpeningWorkspace> = {}): PostOpeningWorkspace => ({
  tenderId: 't1',
  reference: 'TND-0001',
  title: 'HVAC',
  bidsOpened: true,
  acts: [
    { action: 'BidWithdrawal', approverRole: 'ApproverDirector', canRequest: true },
    { action: 'BidExclusion', approverRole: null, canRequest: true },
    { action: 'TenderCancellation', approverRole: 'ApproverDirector', canRequest: true },
    { action: 'RetenderClosure', approverRole: 'ApproverDirector', canRequest: true },
  ],
  requests: [],
  ...overrides,
});

describe('Post-opening approvals (Phase 1 D02)', () => {
  it('requests a withdrawal for the chosen bid with a reason and evidence; nothing takes effect before approval', () => {
    const { http, fixture, element, page } = render({ act: 'BidWithdrawal', bid: 'b1' });
    http.expectOne('/api/v1/tenders/t1/post-opening').flush(workspace());
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    fixture.detectChanges();
    expect(text(element)).toContain('Approved by: Approver');
    page.reason = 'The firm withdrew in writing';
    page.evidence = 'Letter 2026/114';
    page.submit();
    const sent = http.expectOne('/api/v1/tenders/t1/post-opening/requests');
    expect(sent.request.body).toMatchObject({
      action: 'BidWithdrawal',
      openingBidId: 'b1',
      reason: 'The firm withdrew in writing',
      evidenceReference: 'Letter 2026/114',
    });
    expect(typeof sent.request.body.requestKey).toBe('string');
    sent.flush(
      workspace({
        requests: [
          request({
            action: 'BidWithdrawal',
            openingBidId: 'b1',
            subcontractorCode: 'ACME-01',
            requestedByMe: true,
            canDecide: false,
            decideBlocker: 'post_opening.self_approval_not_allowed',
          }),
        ],
      }),
    );
    fixture.detectChanges();
    expect(text(element)).toContain('Waiting for approval');
    expect(text(element)).toContain('It takes effect only when the approver approves it');
    // The requester is told why they cannot decide it; no approve button.
    expect(text(element)).toContain('You made this request, so someone else must decide it.');
    expect(button(element, 'Approve')).toBeUndefined();
    http.verify();
  });

  it('says an act cannot be requested until the company names its approver', () => {
    const { http, fixture, element } = render({ act: 'BidExclusion' });
    http.expectOne('/api/v1/tenders/t1/post-opening').flush(workspace());
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="post-opening-not-configured"]')).not.toBeNull();
    const submit = button(element, 'Request approval')!;
    expect(submit.disabled).toBe(true);
  });

  it('lets the approver approve, or reject only with a comment', () => {
    const { http, fixture, element, page } = render();
    http.expectOne('/api/v1/tenders/t1/post-opening').flush(workspace({ requests: [request()] }));
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    fixture.detectChanges();
    expect(text(element)).toContain('Cancellation of the tender');
    expect(text(element)).toContain('Client stopped the project');
    expect(button(element, 'Reject')!.disabled).toBe(true);
    page.setComment('r1', 'Funding confirmed');
    fixture.detectChanges();
    expect(button(element, 'Reject')!.disabled).toBe(false);
    button(element, 'Approve')!.click();
    const decided = http.expectOne('/api/v1/tenders/t1/post-opening/requests/r1/decision');
    expect(decided.request.body).toEqual({
      approve: true,
      comment: 'Funding confirmed',
      version: 'v1',
    });
    decided.flush(
      workspace({
        requests: [
          request({
            status: 'Approved',
            canDecide: false,
            decidedByName: 'Dina Director',
            decidedAtUtc: '2026-10-09T11:00:00Z',
          }),
        ],
      }),
    );
    fixture.detectChanges();
    expect(text(element)).toContain('Approved — in effect');
    expect(text(element)).toContain('Decided by Dina Director');
    expect(text(element)).toContain('Approved. It is now in effect.');
  });

  it('shows the server refusal (unauthorized approver) without changing the request', () => {
    const { http, fixture, element } = render();
    http.expectOne('/api/v1/tenders/t1/post-opening').flush(workspace({ requests: [request()] }));
    http.expectOne('/api/v1/tenders/t1/opening').flush(opened());
    fixture.detectChanges();
    button(element, 'Approve')!.click();
    http
      .expectOne('/api/v1/tenders/t1/post-opening/requests/r1/decision')
      .flush(
        { code: 'post_opening.approver_role_required', parameters: { role: 'ApproverDirector' } },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();
    expect(text(element)).toContain('Only a member holding the approver role');
    expect(text(element)).toContain('Waiting for approval');
  });
});
