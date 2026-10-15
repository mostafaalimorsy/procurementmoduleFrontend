import { markScrollRegions } from './scroll-regions';

/** jsdom has no layout: a container's scroll width is given per test. */
function container(html: string, scrollWidth: number, clientWidth: number): HTMLElement {
  const host = document.createElement('section');
  host.innerHTML = html;
  const wrap = host.querySelector<HTMLElement>('.prj-table-wrap')!;
  Object.defineProperty(wrap, 'scrollWidth', { configurable: true, get: () => scrollWidth });
  Object.defineProperty(wrap, 'clientWidth', { configurable: true, get: () => clientWidth });
  document.body.append(host);
  return wrap;
}

describe('Scroll regions (Phase 3 SI-144 / SI-142)', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('makes a sideways-scrolling table a focusable region named by its caption, and undoes it when it fits', () => {
    const wrap = container(
      '<div class="prj-table-wrap"><table><caption> Opened   bids </caption></table></div>',
      900,
      390,
    );
    markScrollRegions(document);
    expect(wrap.getAttribute('tabindex')).toBe('0');
    expect(wrap.getAttribute('role')).toBe('region');
    expect(wrap.getAttribute('aria-label')).toBe('Opened bids');

    Object.defineProperty(wrap, 'scrollWidth', { configurable: true, get: () => 390 });
    markScrollRegions(document);
    expect(wrap.hasAttribute('tabindex')).toBe(false);
    expect(wrap.hasAttribute('role')).toBe(false);
    expect(wrap.hasAttribute('aria-label')).toBe(false);
  });

  it('names a table without a caption by the nearest heading before it', () => {
    const wrap = container(
      '<h2>All bidders</h2><div class="prj-table-wrap"><table></table></div>',
      900,
      390,
    );
    markScrollRegions(document);
    expect(wrap.getAttribute('aria-label')).toBe('All bidders');
  });

  it('adds no tab stop to a table that fits, and leaves a container whose template manages its own focus', () => {
    const fits = container('<div class="prj-table-wrap"><table></table></div>', 390, 390);
    const own = container(
      '<div class="prj-table-wrap" tabindex="0" role="region" aria-labelledby="x"><table></table></div>',
      900,
      390,
    );
    markScrollRegions(document);
    expect(fits.hasAttribute('tabindex')).toBe(false);
    expect(own.hasAttribute('data-scroll-region')).toBe(false);
    expect(own.getAttribute('aria-labelledby')).toBe('x');
  });
});
