import { Component } from '@angular/core';
import { GovernanceSettings } from './governance-settings';

/**
 * Phase 1 SI-017 (ADR-184): the procurement governance settings in force, readable by every member (the API serves them to every member);
 * approvers and Procurement Managers reach it from the "controls loosened" notice. Only a Company Admin changes them.
 */
@Component({
  selector: 'app-governance-page',
  imports: [GovernanceSettings],
  template: `
    <section class="prj-page">
      <app-governance-settings />
    </section>
  `,
})
export class GovernancePage {}
