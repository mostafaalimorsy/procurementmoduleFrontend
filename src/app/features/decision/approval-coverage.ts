/**
 * Phase 3 SI-122: what the approval matrix decides across the value axis, per currency, so a gap (a value no rule matches —
 * it follows the default route) or a shadowed rule (one that never decides a value because a rule checked first covers it)
 * is visible before saving. The same matching as the server (ApprovalRule.Matches / Select): the minimum is inclusive, the
 * maximum exclusive, the first active rule by priority then name decides. Only company-wide rules (no project, no category)
 * are mapped — a scoped rule applies to some decisions only and is listed apart. Exact decimals (no floating point, ADR-050).
 */

export interface CoverageRule {
  readonly id: string;
  readonly name: string;
  readonly priority: number;
  readonly active: boolean;
  readonly currency: string | null;
  readonly minimumValue: string | null;
  readonly maximumValue: string | null;
  readonly projectId: string | null;
  readonly category: string | null;
}

/** A stretch of values [from, to): from null = from zero, to null = and above. */
export interface CoverageBand {
  readonly from: string | null;
  readonly to: string | null;
  /** The rule that decides these values, or null: none matches, the default route applies. */
  readonly rule: string | null;
}

export interface CoverageShadow {
  readonly rule: string;
  readonly by: string;
  readonly from: string | null;
  readonly to: string | null;
}

export interface CurrencyCoverage {
  /** null: rules with no currency only (they apply in every currency). */
  readonly currency: string | null;
  readonly bands: readonly CoverageBand[];
  readonly gaps: readonly CoverageBand[];
  readonly shadows: readonly CoverageShadow[];
}

const SCALE = 3;

/** A non-negative decimal string as an integer of thousandths (exact). */
function scaled(value: string): bigint {
  const [whole, fraction = ''] = value.trim().split('.');
  return (
    BigInt(whole || '0') * 10n ** BigInt(SCALE) + BigInt((fraction + '000').slice(0, SCALE) || '0')
  );
}

function plain(value: bigint): string {
  const unit = 10n ** BigInt(SCALE);
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

function precedes(a: CoverageRule, b: CoverageRule): number {
  return a.priority - b.priority || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

export function matrixCoverage(rules: readonly CoverageRule[]): CurrencyCoverage[] {
  const wide = rules.filter((rule) => rule.active && !rule.projectId && !rule.category);
  const currencies = [
    ...new Set(wide.map((rule) => rule.currency).filter((c): c is string => !!c)),
  ].sort();
  const groups: (string | null)[] = currencies.length ? currencies : wide.length ? [null] : [];
  return groups.map((currency) =>
    coverageOf(
      currency,
      wide.filter((rule) => !rule.currency || rule.currency === currency),
    ),
  );
}

function coverageOf(currency: string | null, rules: readonly CoverageRule[]): CurrencyCoverage {
  const bounds = new Set<bigint>([0n]);
  for (const rule of rules) {
    if (rule.minimumValue) bounds.add(scaled(rule.minimumValue));
    if (rule.maximumValue) bounds.add(scaled(rule.maximumValue));
  }
  const points = [...bounds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const slices: {
    from: bigint;
    to: bigint | null;
    winner: CoverageRule | null;
    others: CoverageRule[];
  }[] = [];
  points.forEach((from, index) => {
    const to = index + 1 < points.length ? points[index + 1] : null;
    const matching = rules
      .filter((rule) => {
        const min = rule.minimumValue ? scaled(rule.minimumValue) : 0n;
        const max = rule.maximumValue ? scaled(rule.maximumValue) : null;
        // Every rule bound is a slice bound, so a rule matches a whole slice or none of it.
        return from >= min && (max === null || from < max);
      })
      .sort(precedes);
    slices.push({ from, to, winner: matching[0] ?? null, others: matching.slice(1) });
  });

  const bands: { from: bigint; to: bigint | null; rule: string | null }[] = [];
  for (const slice of slices) {
    const name = slice.winner?.name ?? null;
    const last = bands[bands.length - 1];
    if (last && last.rule === name && last.to === slice.from) last.to = slice.to;
    else bands.push({ from: slice.from, to: slice.to, rule: name });
  }
  const shadows: { rule: string; by: string; from: bigint; to: bigint | null }[] = [];
  for (const slice of slices)
    for (const other of slice.others) {
      const by = slice.winner!.name;
      const last = shadows.find(
        (item) => item.rule === other.name && item.by === by && item.to === slice.from,
      );
      if (last) last.to = slice.to;
      else shadows.push({ rule: other.name, by, from: slice.from, to: slice.to });
    }
  const view = (band: { from: bigint; to: bigint | null; rule: string | null }): CoverageBand => ({
    from: band.from === 0n ? null : plain(band.from),
    to: band.to === null ? null : plain(band.to),
    rule: band.rule,
  });
  const shown = bands.map(view);
  return {
    currency,
    bands: shown,
    gaps: shown.filter((band) => band.rule === null),
    shadows: shadows.map((shadow) => ({
      rule: shadow.rule,
      by: shadow.by,
      from: shadow.from === 0n ? null : plain(shadow.from),
      to: shadow.to === null ? null : plain(shadow.to),
    })),
  };
}
