import { Injectable, inject } from '@angular/core';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';

/**
 * Phase 3 SI-066: links back up the record chain — a closeout or award to its tender, work package, project and firm. A route is
 * returned only when the reader could open that page (the permission and plan feature its route guard checks); otherwise null, which
 * a `[routerLink]` renders as plain text (no href). Presentation only: every page and API call re-decides access, and an id is linked
 * only when the server already put it in the payload. The literal keys mirror the route guards in app.routes.ts and avoid importing
 * the feature APIs into a shared helper.
 */
const AWARD = [
  'award',
  'evaluation',
  'tendering',
  'projects',
  'subcontractor_directory',
  'sourcing',
] as const;

@Injectable({ providedIn: 'root' })
export class RecordLinks {
  private readonly session = inject(SessionService);
  private readonly entitlements = inject(EntitlementsService);

  tender(id: string | null | undefined): readonly string[] | null {
    return id &&
      this.session.hasPermission('Tenders.View') &&
      ['tendering', 'projects', 'subcontractor_directory', 'sourcing'].every((feature) =>
        this.entitlements.has(feature),
      )
      ? ['/tenders', id]
      : null;
  }

  workPackage(id: string | null | undefined): readonly string[] | null {
    return id &&
      this.session.hasPermission('WorkPackages.View') &&
      this.entitlements.has('projects')
      ? ['/work-packages', id]
      : null;
  }

  project(id: string | null | undefined): readonly string[] | null {
    return id && this.session.hasPermission('Projects.View') && this.entitlements.has('projects')
      ? ['/projects', id]
      : null;
  }

  /** Phase 3 SI-058: an award's decision workspace (award tab) — readers of the decision on a plan with the award. */
  award(tenderId: string | null | undefined): readonly string[] | null {
    return tenderId &&
      this.session.hasPermission('Decision.View') &&
      AWARD.every((feature) => this.entitlements.has(feature))
      ? ['/tenders', tenderId, 'decision']
      : null;
  }

  /** Phase 3 SI-058: an award's performance closeout — Performance.View readers on a plan with performance. */
  closeout(awardId: string | null | undefined): readonly string[] | null {
    return awardId &&
      this.session.hasPermission('Performance.View') &&
      ['performance', ...AWARD].every((feature) => this.entitlements.has(feature))
      ? ['/closeouts', awardId]
      : null;
  }

  subcontractor(id: string | null | undefined): readonly string[] | null {
    return id &&
      this.session.hasPermission('Subcontractors.View') &&
      this.entitlements.has('subcontractor_directory')
      ? ['/subcontractors', id]
      : null;
  }
}
