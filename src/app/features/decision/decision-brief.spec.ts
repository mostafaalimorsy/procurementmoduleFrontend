import { TestBed } from '@angular/core/testing';
import { DecisionBrief, amountDelta } from './decision-brief';
import { controls, decision, recommendation, submission } from './decision.fixtures';
import { DecisionWorkspace } from './decision.api';

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ');

function render(view: DecisionWorkspace) {
  const fixture = TestBed.createComponent(DecisionBrief);
  fixture.componentRef.setInput('workspace', view);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Approver brief (Phase 3 SI-053)', () => {
  it('leads with the request and compares the proposed bid with the next-ranked one in exact decimals', () => {
    const element = render(
      decision({
        recommendation: recommendation(),
        currentSubmission: submission(),
        controls: controls(),
      }),
    );
    const brief = element.querySelector('[data-testid="approver-brief"]')!;
    expect(text(brief)).toContain('Award BETA-01 Beta Contracting for 1,950,000.00 QAR');
    const rows = [...brief.querySelectorAll('tbody tr')].map(text);
    expect(rows[0]).toContain('BETA-01');
    expect(rows[0]).toContain('proposed');
    expect(rows[1]).toContain('ACME-01');
    expect(rows[1]).toContain('−150,000.00');
    expect(rows[1]).toContain('score +11.2');
    expect(text(brief)).toContain('+11.11 %');
    const flags = brief.querySelector('[data-testid="brief-flags"]')!;
    expect(text(flags)).toContain('Departs from the recommendation');
    expect(text(flags)).toContain('Stronger site team for the fast-track programme');
    expect(text(brief)).toContain('Best overall value for the programme.');
  });

  it('shows no estimate row to a reader the server gave no estimate', () => {
    const element = render(
      decision({
        recommendation: recommendation(),
        currentSubmission: submission(),
        controls: controls({
          estimate: null,
          estimateCurrency: null,
          proposedVariancePercent: null,
        }),
      }),
    );
    expect(text(element)).not.toContain('Against the package estimate');
  });

  it('does not compare when the decision was prepared on another recommendation', () => {
    const element = render(
      decision({
        recommendation: recommendation({ id: 'rec2', number: 2 }),
        currentSubmission: submission(),
      }),
    );
    expect(element.querySelector('table')).toBeNull();
    expect(text(element)).toContain('prepared on recommendation 1');
  });

  it('subtracts amounts exactly', () => {
    expect(amountDelta('1950000.00', '1800000.00')).toBe('-150000.00');
    expect(amountDelta('0.1', '0.3')).toBe('0.2');
    expect(amountDelta('987500.000', '1112300.5')).toBe('124800.500');
  });
});
