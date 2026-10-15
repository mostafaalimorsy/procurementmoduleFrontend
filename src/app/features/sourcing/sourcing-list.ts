import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BusinessDatePipe } from '../../core/localization/business-format';
import { lifecycleStatusLabel } from '../../core/localization/labels';
import { Paged } from '../subcontractors/subcontractors.api';
import {
  SourcingApi,
  SourcingStatus,
  StartablePackage,
  SourcingSummary,
  sourcingProblemMessage,
  sourcingStatusLabel,
} from './sourcing.api';
import { listUrlState, oneOfParam, pageParam } from '../../core/navigation/list-url-state';

/** Every work package being sourced, most recently changed first. Paged by the server. */
@Component({
  selector: 'app-sourcing-list',
  imports: [FormsModule, RouterLink, BusinessDatePipe],
  templateUrl: './sourcing-list.html',
  styles: `
    .src-list {
      margin: 1.5rem 0 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class SourcingList implements OnInit {
  private readonly api = inject(SourcingApi);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly url = listUrlState();
  /** The list state on screen (its URL key), so a URL that already says so does not load it twice. */
  private shown = '';

  readonly statusLabel = sourcingStatusLabel;
  readonly packageStatusLabel = lifecycleStatusLabel;
  readonly statuses: readonly SourcingStatus[] = ['Open', 'ShortlistApproved'];
  readonly result = signal<Paged<SourcingSummary> | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  status: SourcingStatus | '' = '';
  page = 1;
  /** CF-103: search by work package code, title or project code; and the "Start sourcing" picker. */
  search = '';
  readonly picking = signal(false);
  readonly startable = signal<readonly StartablePackage[] | null>(null);
  readonly starting = signal('');
  pickerSearch = '';

  canStart(): boolean {
    return this.session.hasPermission('Sourcing.Manage');
  }

  openPicker(): void {
    this.picking.set(true);
    this.findStartable();
  }

  findStartable(): void {
    this.api.startable(this.pickerSearch).subscribe({
      next: (packages) => this.startable.set(packages),
      error: (error: unknown) => this.error.set(sourcingProblemMessage(error)),
    });
  }

  start(item: StartablePackage): void {
    if (this.starting()) return;
    this.starting.set(item.id);
    this.api.start(item.id, item.tradeId ? [item.tradeId] : []).subscribe({
      next: (sourcing) => void this.router.navigate(['/sourcing', sourcing.id]),
      error: (error: unknown) => {
        this.starting.set('');
        this.error.set(sourcingProblemMessage(error));
      },
    });
  }

  ngOnInit(): void {
    // Phase 3 SI-065: the status, search and page live in the URL (Back, reload, a shared link).
    this.url.watch((params) => {
      this.status = oneOfParam(params, 'status', this.statuses);
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
    this.api
      .list({ status: this.status ? [this.status] : [], page: this.page, search: this.search })
      .subscribe({
        next: (page) => {
          this.result.set(page);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(sourcingProblemMessage(error));
          this.loading.set(false);
        },
      });
  }
}
