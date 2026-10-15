import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  BusinessDatePipe,
  tenderLocalTime,
  zonedInstant,
} from '../../core/localization/business-format';
import {
  deadlineStateLabel,
  tenderLifecycleLabel,
  tenderStatusLabel,
  tenderTypeLabel,
} from '../../core/localization/labels';
import { LocaleService } from '../../core/localization/locale.service';
import { listUrlState, oneOfParam, pageParam } from '../../core/navigation/list-url-state';
import { Paged } from '../subcontractors/subcontractors.api';
import {
  TENDER_STAGES,
  TenderStage,
  TenderSummary,
  TenderingApi,
  tenderProblemMessage,
} from './tendering.api';

/**
 * Every tender of the company in one dense table, most recently changed first. Paged and filtered by
 * the server. A tender starts from an approved shortlist, so the list points there rather than
 * offering a form without one.
 */
@Component({
  selector: 'app-tender-list',
  imports: [FormsModule, RouterLink, BusinessDatePipe],
  templateUrl: './tender-list.html',
  styleUrl: './tendering.scss',
})
export class TenderList implements OnInit {
  private readonly api = inject(TenderingApi);
  private readonly url = listUrlState();
  /** The list state on screen (its URL key), so a URL that already says so does not load it twice. */
  private shown = '';
  private readonly locale = inject(LocaleService).locale;

  readonly statusLabel = tenderStatusLabel;
  readonly typeLabel = tenderTypeLabel;
  readonly deadlineLabel = deadlineStateLabel;
  /** CF-009: the list filters by where a tender is (the same rule as the dashboard figures), never by the stored "Published". */
  readonly stages = TENDER_STAGES;
  readonly stepLabel = tenderLifecycleLabel;
  readonly result = signal<Paged<TenderSummary> | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  stage: TenderStage | '' = '';

  /**
   * Red-team B-098-1 (CF-098): "15 Oct 2026, 14:00 (Asia/Riyadh, UTC+03:00)" — the server's tender-local time; an older summary without it
   * is converted from the UTC instant into the same zone and pattern.
   */
  deadline(item: TenderSummary): string {
    return item.submissionDeadline
      ? tenderLocalTime(item.submissionDeadline, item.timeZoneId, this.locale)
      : zonedInstant(item.submissionDeadlineUtc, item.timeZoneId, this.locale);
  }
  search = '';
  page = 1;

  ngOnInit(): void {
    // Phase 3 SI-065: the URL holds the stage, search and page (Back, reload and a shared link keep them); a dashboard link may
    // open the list already filtered.
    this.url.watch((params) => {
      let stage: TenderStage | '' = oneOfParam(params, 'stage', this.stages);
      // Older links filtered by stored status: Draft and Cancelled are stages too; "Published" spans several stages, so it shows all.
      const status = params.get('status');
      if (!stage && (status === 'Draft' || status === 'Cancelled')) stage = status;
      this.stage = stage;
      this.search = params.get('q') ?? '';
      this.page = pageParam(params);
      const shown = this.url.key({
        stage: this.stage,
        q: this.search.trim(),
        page: this.page,
        status: null,
      });
      if (shown === this.shown) return;
      this.shown = shown;
      this.load();
    });
  }

  applyFilter(): void {
    this.page = 1;
    this.sync();
  }

  goToPage(page: number): void {
    this.page = page;
    this.sync();
  }

  /**
   * Phase 3 SI-029: the next date that still matters — the submission deadline while bidding is open or awaiting the opening;
   * after that the row shows none (an awarded or cancelled tender no longer has a deadline to act on).
   */
  showsDeadline(item: TenderSummary): boolean {
    const stage = item.stage ?? (item.status === 'Draft' ? 'Draft' : null);
    return (
      !!item.submissionDeadlineUtc &&
      (stage === 'Draft' || stage === 'OpenForBids' || stage === 'AwaitingOpening')
    );
  }

  private sync(): void {
    const values = { stage: this.stage, q: this.search.trim(), page: this.page, status: null };
    this.url.write(values);
    this.shown = this.url.key(values);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .list({ stage: this.stage ? [this.stage] : [], search: this.search, page: this.page })
      .subscribe({
        next: (page) => {
          this.result.set(page);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(tenderProblemMessage(error));
          this.loading.set(false);
        },
      });
  }
}
