import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SavedNotice, savedState } from './saved-notice';

@Component({
  imports: [SavedNotice],
  template: `<main>
    <h1>Project A</h1>
    <app-saved-notice />
  </main>`,
})
class Host {}

describe('Saved notice (Phase 3 SI-143)', () => {
  afterEach(() => history.replaceState({}, ''));

  it('confirms a created record, focuses the page heading and clears the flag', async () => {
    history.replaceState(savedState('created').state, '');
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const notice = element.querySelector('[data-testid="saved-notice"]')!;
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.textContent).toContain('Created and saved.');
    expect(document.activeElement).toBe(element.querySelector('h1'));
    expect((history.state as { saved?: string }).saved).toBeUndefined();
    fixture.nativeElement.remove();
  });

  it('says nothing on an ordinary visit', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="saved-notice"]'),
    ).toBeNull();
  });
});
