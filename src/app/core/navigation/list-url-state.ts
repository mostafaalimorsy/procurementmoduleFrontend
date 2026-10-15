import { inject } from '@angular/core';
import { ActivatedRoute, ParamMap, Router, convertToParamMap } from '@angular/router';
import { Observable, Subscription, of } from 'rxjs';

/** A list's filters, search and page as they appear in its URL; empty, false and page 1 are left out. */
export type ListUrlValues = Record<string, string | number | boolean | null | undefined>;

/**
 * Phase 3 SI-065: a list keeps its filters, search and page in the URL, so Back, a reload and a shared link show the same rows.
 * A change on the page writes the URL (replacing the history entry, so Back leaves the list instead of undoing each filter) and
 * loads at once; the list also follows the URL when it changes from outside (Back, a link), skipping a state it already shows
 * (compare `key`). Call from a field initializer (it injects the router and route).
 */
export function listUrlState() {
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  const params$: Observable<ParamMap> = route.queryParamMap ?? of(convertToParamMap({}));

  function normalise(values: ListUrlValues): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === undefined || value === '' || value === false) out[key] = null;
      else if (key === 'page' && Number(value) <= 1) out[key] = null;
      else if (value === true) out[key] = '1';
      else out[key] = String(value);
    }
    return out;
  }

  return {
    /** A comparable key of a list state: two states with the same key show the same rows. */
    key(values: ListUrlValues): string {
      return JSON.stringify(normalise(values));
    },
    /** Calls `apply` with the list's query parameters now and after every change of them. */
    watch(apply: (params: ParamMap) => void): Subscription {
      return params$.subscribe(apply);
    },
    /** Writes the list's state into the URL; returns false when the URL already holds exactly this state. */
    write(values: ListUrlValues): boolean {
      const wanted = normalise(values);
      const current = route.snapshot?.queryParamMap;
      const changed = Object.entries(wanted).some(
        ([key, value]) => (current?.get(key) ?? null) !== value,
      );
      if (!changed) return false;
      void router.navigate([], {
        relativeTo: route,
        queryParams: wanted,
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      return true;
    },
  };
}

/** Reads a positive page number from the URL (1 when absent or invalid). */
export function pageParam(params: ParamMap): number {
  return Math.max(1, Math.floor(Number(params.get('page'))) || 1);
}

/** Reads a value from the URL only when it is one of the allowed ones. */
export function oneOfParam<T extends string>(
  params: ParamMap,
  key: string,
  allowed: readonly T[],
): T | '' {
  const value = params.get(key);
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : '';
}
