import { InvalidSubmitFocus } from './core/a11y/invalid-submit-focus';
import { ScrollRegions } from './core/a11y/scroll-regions';
import { LocaleService } from './core/localization/locale.service';
import {
  ApplicationConfig,
  provideAppInitializer,
  inject,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { csrfRetryInterceptor } from './core/auth/csrf-retry.interceptor';
import { entitlementRefreshInterceptor } from './core/auth/entitlement-refresh.interceptor';
import { idleActivityInterceptor } from './core/auth/idle-watch';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() => inject(LocaleService).initialize()),
    // CF-020: an invalid submit moves focus to the first field marked invalid.
    provideAppInitializer(() => inject(InvalidSubmitFocus).start()),
    // Phase 3 SI-144: a table that scrolls sideways is a named, focusable region while it scrolls.
    provideAppInitializer(() => inject(ScrollRegions).start()),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([
        entitlementRefreshInterceptor,
        idleActivityInterceptor,
        csrfRetryInterceptor,
      ]),
    ),
  ],
};
