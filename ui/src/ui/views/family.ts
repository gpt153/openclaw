import { html, nothing, type TemplateResult } from "lit";
import type {
  ChildProfile,
  FamilyState,
  PrivacyLevel,
  AuditEntry,
} from "../controllers/family";
import { renderChildProfileCard } from "../components/child-profile";
import { icons } from "../icons";
import { formatAgo } from "../format";

export type FamilyViewProps = {
  state: FamilyState;
  onRefresh: () => void;
  onEditChild: (childId: string) => void;
  onPrivacySettings: (childId: string) => void;
  onViewAudit: (childId: string) => void;
  onCloseAudit: () => void;
  onUpdatePrivacy: (childId: string, level: PrivacyLevel) => void;
  onToggleSchoolData: (childId: string, enabled: boolean) => void;
};

/**
 * Render privacy settings modal
 */
function renderPrivacyModal(
  childId: string,
  currentLevel: PrivacyLevel,
  onUpdate: (childId: string, level: PrivacyLevel) => void,
  onClose: () => void,
): TemplateResult {
  return html`
    <div class="modal-overlay" @click=${onClose}>
      <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <div class="modal-title">Privacy Settings</div>
          <button class="btn-icon" @click=${onClose}>${icons.x}</button>
        </div>
        <div class="modal-body">
          <p class="muted">
            Select the privacy level for this child's information. This controls
            what data is accessible in the dashboard and through integrations.
          </p>

          <div class="privacy-levels">
            <label class="privacy-level">
              <input
                type="radio"
                name="privacy"
                value="full"
                ?checked=${currentLevel === "full"}
                @change=${() => onUpdate(childId, "full")}
              />
              <div class="privacy-level-content">
                <div class="privacy-level-title">
                  <span class="badge badge-success">Full</span>
                  All Information
                </div>
                <div class="privacy-level-desc muted">
                  School details, activities, medical info, and all integrations
                  enabled.
                </div>
              </div>
            </label>

            <label class="privacy-level">
              <input
                type="radio"
                name="privacy"
                value="limited"
                ?checked=${currentLevel === "limited"}
                @change=${() => onUpdate(childId, "limited")}
              />
              <div class="privacy-level-content">
                <div class="privacy-level-title">
                  <span class="badge badge-warning">Limited</span>
                  School Basics Only
                </div>
                <div class="privacy-level-desc muted">
                  School name and grade visible. Activities and medical info hidden.
                </div>
              </div>
            </label>

            <label class="privacy-level">
              <input
                type="radio"
                name="privacy"
                value="minimal"
                ?checked=${currentLevel === "minimal"}
                @change=${() => onUpdate(childId, "minimal")}
              />
              <div class="privacy-level-content">
                <div class="privacy-level-title">
                  <span class="badge badge-danger">Minimal</span>
                  Name and Age Only
                </div>
                <div class="privacy-level-desc muted">
                  Only basic identification visible. All other details hidden.
                </div>
              </div>
            </label>
          </div>

          ${currentLevel === "full"
            ? html`
                <div class="callout danger" style="margin-top: 16px">
                  <strong>Warning:</strong> Changing from Full to Limited or
                  Minimal will restrict access to this child's data. Some features
                  may no longer work.
                </div>
              `
            : nothing}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render audit log modal
 */
function renderAuditModal(
  entries: AuditEntry[],
  loading: boolean,
  onClose: () => void,
): TemplateResult {
  return html`
    <div class="modal-overlay" @click=${onClose}>
      <div class="modal modal-lg" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <div class="modal-title">Audit Log</div>
          <button class="btn-icon" @click=${onClose}>${icons.x}</button>
        </div>
        <div class="modal-body">
          ${loading
            ? html`<div class="loading">Loading audit log...</div>`
            : entries.length === 0
              ? html`<div class="muted">No audit entries found.</div>`
              : html`
                  <table class="audit-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Action</th>
                        <th>Data Type</th>
                        <th>User</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${entries.map(
                        (entry) => html`
                          <tr>
                            <td>${formatAgo(entry.timestamp)}</td>
                            <td>${entry.action}</td>
                            <td><code>${entry.data_type}</code></td>
                            <td>${entry.user}</td>
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                `}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render family schedule view placeholder
 */
function renderScheduleView(): TemplateResult {
  return html`
    <div class="card" style="margin-top: 18px">
      <div class="card-title">Family Schedule</div>
      <div class="card-sub">
        Combined calendar view for all children (coming soon)
      </div>
      <div style="margin-top: 16px">
        <div class="muted">
          This section will display a color-coded calendar showing events for all
          children, with automatic conflict detection.
        </div>
      </div>
    </div>
  `;
}

/**
 * Main family view renderer
 */
export function renderFamily(props: FamilyViewProps): TemplateResult {
  const { state } = props;

  return html`
    <div class="family-view">
      <section class="family-header">
        <button class="btn" @click=${props.onRefresh} ?disabled=${state.loading}>
          ${state.loading ? icons.loader : icons.search} Refresh
        </button>
        ${state.error
          ? html`<div class="callout danger">${state.error}</div>`
          : nothing}
      </section>

      ${state.loading && state.children.length === 0
        ? html`<div class="loading">Loading family context...</div>`
        : html`
            <section class="child-profiles-grid">
              ${state.children.map((child) =>
                renderChildProfileCard({
                  profile: child,
                  onEdit: props.onEditChild,
                  onPrivacySettings: props.onPrivacySettings,
                  onViewAudit: props.onViewAudit,
                }),
              )}
            </section>

            ${renderScheduleView()}

            <div class="card" style="margin-top: 18px">
              <div class="card-title">Privacy & Security</div>
              <div class="card-sub">
                Family data protection and access controls
              </div>
              <div style="margin-top: 16px">
                <div class="privacy-info">
                  <div class="privacy-info-item">
                    <span class="badge badge-amber">Foster Children</span>
                    <span class="muted"
                      >Elevated privacy protections by default</span
                    >
                  </div>
                  <div class="privacy-info-item">
                    <span class="badge badge-success">Full Access</span>
                    <span class="muted"
                      >All data visible, integrations enabled</span
                    >
                  </div>
                  <div class="privacy-info-item">
                    <span class="badge badge-warning">Limited Access</span>
                    <span class="muted">School basics only</span>
                  </div>
                  <div class="privacy-info-item">
                    <span class="badge badge-danger">Minimal Access</span>
                    <span class="muted">Name and age only</span>
                  </div>
                </div>
              </div>
            </div>
          `}
    </div>

    ${
      state.selectedChildId
        ? (() => {
            const child = state.children.find(
              (c) => c.id === state.selectedChildId,
            );
            if (!child) return nothing;

            // Show privacy modal if privacy settings requested
            if (state.selectedChildId && !state.auditLog.length) {
              return renderPrivacyModal(
                child.id,
                child.privacy_level,
                props.onUpdatePrivacy,
                props.onCloseAudit,
              );
            }

            // Show audit modal if audit log present
            return renderAuditModal(
              state.auditLog,
              state.auditLoading,
              props.onCloseAudit,
            );
          })()
        : nothing
    }
  `;
}
