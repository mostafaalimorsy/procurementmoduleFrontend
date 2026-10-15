import { Component, OnInit, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Route, Router, RouterLink } from '@angular/router';
import { EntitlementsService } from '../../core/auth/entitlements.service';
import { SessionService } from '../../core/auth/session.service';
import { TENANT_PERMISSIONS } from '../identity/tenant-identity.api';
import { PROJECTS_FEATURE, PROJECT_PERMISSIONS } from '../projects/projects.api';
import { TENDERING_FEATURES } from '../tendering/tendering.api';
import { SOURCING_FEATURES } from '../sourcing/sourcing.api';
import { EVALUATION_FEATURES } from '../evaluation/evaluation.api';
import { PERFORMANCE_FEATURES } from '../performance/performance.api';
import { DashboardView } from '../intelligence/dashboard';
import { HealthService } from './health.service';
import { StatusIndicator } from '../../shared/ui/status-indicator';
import { SetupChecklist } from './setup-checklist';

interface RoleLink {
  readonly path: string;
  readonly label: string;
  readonly query?: Record<string, string>;
  readonly fragment?: string;
}

@Component({
  selector: 'app-overview',
  imports: [RouterLink, StatusIndicator, DashboardView, SetupChecklist],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
})
export class Overview implements OnInit {
  protected readonly health = inject(HealthService);
  protected readonly session = inject(SessionService);
  protected readonly companyWorkspaceLabel = $localize`:@@overview.companyWorkspace:YOUR COMPANY WORKSPACE`;
  protected readonly teamMemberLabel = $localize`:@@overview.teamMember:team member`;
  private readonly entitlements = inject(EntitlementsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly routeParams = toSignal(this.route.queryParamMap, { initialValue: null });
  protected readonly routeNotice = computed(() => {
    const params = this.routeParams();
    if (params?.get('access') === 'denied') {
      // CF-011: name the page from the router's own titles (only known route paths), and who can grant access. Runtime validation D3: the
      // Company Admin is not sent to ask themselves — their role administers the company, procurement work belongs to the procurement roles.
      const page = this.pageTitle(params.get('page'));
      if (page && this.session.hasPermission(TENANT_PERMISSIONS.usersView))
        return $localize`:@@overview.accessDeniedAdmin:You do not have access to ${page}:page:. The Company Admin role administers the company; give the procurement roles to the people who do this work.`;
      return page
        ? $localize`:@@overview.accessDeniedPage:You do not have access to ${page}:page:. Ask your Company Admin if you need it.`
        : $localize`:@@overview.accessDenied:You do not have access to that page. Choose an available workspace action below.`;
    }
    if (params?.get('plan') === 'unavailable')
      return $localize`:@@overview.planUnavailable:This capability is not included in your company’s current plan.`;
    return '';
  });
  private pageTitle(path: string | null): string | null {
    if (!path) return null;
    const found = (routes: readonly Route[]): Route | undefined => {
      for (const route of routes) {
        if (route.path === path) return route;
        const child = route.children ? found(route.children) : undefined;
        if (child) return child;
      }
      return undefined;
    };
    const title = found(this.router.config)?.title;
    return typeof title === 'string' ? (title.split(' | ')[0] ?? null) : null;
  }

  protected readonly canViewProjects = computed(
    () =>
      this.session.hasPermission(PROJECT_PERMISSIONS.view) &&
      this.entitlements.has(PROJECTS_FEATURE),
  );
  protected readonly canManageUsers = computed(() =>
    this.session.hasPermission(TENANT_PERMISSIONS.usersView),
  );
  /** CF-016: the service-connection diagnostics belong to the Company Admin; everyone else sees a banner only when it fails. */
  /** CF-016 / CF-100: the service check belongs to the Company Admin; the public page shows only the outage banner. */
  protected readonly showDiagnostics = computed(
    () => this.session.identity()?.roles.includes('CompanyAdmin') ?? false,
  );
  /** Phase 3 SI-064: one line on what this person does here, instead of the same intro for every role. */
  protected readonly roleIntro = computed<string | null>(() => {
    const roles = this.session.identity()?.roles ?? [];
    if (roles.includes('CompanyAdmin'))
      return $localize`:@@overview.intro.companyAdmin:You set up the company: its people, plan, rules and data.`;
    if (roles.includes('ProcurementManager'))
      return $localize`:@@overview.intro.procurementManager:You lead procurement: sourcing, tenders, evaluation and decisions.`;
    if (roles.includes('ApproverDirector'))
      return $localize`:@@overview.intro.director:You approve award decisions and see the company's procurement at a glance.`;
    if (roles.includes('ProcurementOfficer'))
      return $localize`:@@overview.intro.officer:You prepare shortlists and tenders and keep the directory current.`;
    if (roles.includes('CommercialQs'))
      return $localize`:@@overview.intro.qs:You level the commercial bids and record closeouts' commercial outcomes.`;
    if (roles.includes('TechnicalEvaluator'))
      return $localize`:@@overview.intro.evaluator:You score the bids you are assigned to evaluate.`;
    if (roles.includes('ProjectManager'))
      return $localize`:@@overview.intro.projectManager:You take awards into your projects and record how the work went.`;
    return null;
  });

  /**
   * CF-016: one secondary link by role, beside My work. Phase 3 SI-132: only to a capability the company's plan includes (as the
   * navigation decides), with a fallback to Projects; the evaluator and the Director work from My work, which lists exactly what
   * is theirs, so they get no second link that would open every tender.
   */
  protected readonly roleLink = computed<RoleLink | null>(() => {
    const roles = this.session.identity()?.roles ?? [];
    const has = (role: string) => roles.includes(role);
    const plan = (features: readonly string[]) =>
      features.every((feature) => this.entitlements.has(feature));
    const link = (path: string, label: string, query?: Record<string, string>): RoleLink => ({
      path,
      label,
      query,
    });
    const projects = () =>
      this.canViewProjects()
        ? link('/projects', $localize`:@@overview.link.projects:Projects`)
        : null;
    if (has('CompanyAdmin'))
      return link('/admin/company', $localize`:@@overview.link.companySetup:Company setup`);
    if (has('ApproverDirector') || has('TechnicalEvaluator')) return null;
    if (has('ProcurementManager'))
      return plan(TENDERING_FEATURES)
        ? link('/tenders', $localize`:@@overview.link.tenders:Tenders in progress`)
        : projects();
    if (has('ProcurementOfficer'))
      return plan(SOURCING_FEATURES)
        ? link('/sourcing', $localize`:@@overview.link.sourcing:Sourcing and tenders`)
        : projects();
    if (has('CommercialQs'))
      return plan(EVALUATION_FEATURES)
        ? link('/tenders', $localize`:@@overview.link.openedTenders:Tenders with opened bids`, {
            stage: 'Opened',
          })
        : projects();
    if (has('ProjectManager'))
      return plan(PERFORMANCE_FEATURES)
        ? link('/closeouts', $localize`:@@overview.link.closeouts:Closeouts due`, {
            status: 'Pending',
          })
        : projects();
    return null;
  });

  ngOnInit(): void {
    this.health.check();
  }
}
