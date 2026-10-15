import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { CloseoutTabs } from './closeout-tabs';
import { RecordLinks } from '../../shared/navigation/record-links';
import { LocaleService } from '../../core/localization/locale.service';
import { money } from '../evaluation/evaluation-format';
import {
  CloseoutLifecycle,
  CloseoutPage,
  LIFECYCLES,
  PerformanceApi,
  performanceProblemMessage,
} from './performance.api';
import { categoryLabel, lifecycleLabel } from './performance-labels';
import { listUrlState, oneOfParam, pageParam } from '../../core/navigation/list-url-state';

/**
 * Every award of the company with its closeout state (Part 11): pending closeouts first to find, then those in progress,
 * reopened for correction and closed. Cards rather than a wide table, so it reads the same on a phone and a desk.
 */
@Component({
  selector: 'app-closeouts-list',
  imports: [FormsModule, RouterLink, BusinessDatePipe, CloseoutTabs],
  templateUrl: './closeouts-list.html',
  styleUrl: './closeouts-list.scss',
})
export class CloseoutsList implements OnInit {
  private readonly api = inject(PerformanceApi);
  private readonly url = listUrlState();
  /** The list state on screen (its URL key), so a URL that already says so does not load it twice. */
  private shown = '';
  readonly locale = inject(LocaleService).locale;
  /** Phase 3 SI-066: each card links up to its tender, project, work package and firm, for readers who can open them. */
  readonly links = inject(RecordLinks);
  readonly lifecycleLabel = lifecycleLabel;
  readonly categoryLabel = categoryLabel;
  readonly lifecycles = LIFECYCLES;
  readonly result = signal<CloseoutPage | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  status: CloseoutLifecycle | '' = '';
  search = '';
  page = 1;

  ngOnInit(): void {
    // Part 12: a dashboard link may open the list already filtered. Phase 3 SI-065: the status, search and page live in the URL.
    this.url.watch((params) => {
      this.status = oneOfParam(params, 'status', this.lifecycles);
      this.search = params.get('q') ?? '';
      this.page = pageParam(params);
      const shown = this.url.key({ status: this.status, q: this.search.trim(), page: this.page });
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

  private sync(): void {
    const values = { status: this.status, q: this.search.trim(), page: this.page };
    this.url.write(values);
    this.shown = this.url.key(values);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list({ status: this.status, search: this.search, page: this.page }).subscribe({
      next: (page) => {
        this.result.set(page);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(performanceProblemMessage(error));
        this.loading.set(false);
      },
    });
  }

  money(amount: string | null): string {
    return money(amount, this.locale);
  }
}
