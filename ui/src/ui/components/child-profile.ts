import { html, nothing, type TemplateResult } from "lit";
import type { ChildProfile } from "../controllers/family";
import { canAccessField } from "../controllers/family";
import { icons } from "../icons";

export type ChildProfileCardProps = {
  profile: ChildProfile;
  onEdit: (childId: string) => void;
  onPrivacySettings: (childId: string) => void;
  onViewAudit: (childId: string) => void;
};

/**
 * Get initials from name for avatar fallback
 */
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Privacy level badge styling
 */
function privacyBadgeClass(level: string): string {
  switch (level) {
    case "full":
      return "badge-success";
    case "limited":
      return "badge-warning";
    case "minimal":
      return "badge-danger";
    default:
      return "badge-default";
  }
}

/**
 * Render avatar or initials
 */
function renderAvatar(profile: ChildProfile): TemplateResult {
  if (profile.avatar_url) {
    return html`<img
      class="child-avatar"
      src="${profile.avatar_url}"
      alt="${profile.name}"
    />`;
  }
  return html`<div class="child-avatar child-avatar--initials">
    ${getInitials(profile.name)}
  </div>`;
}

/**
 * Render locked field indicator
 */
function renderLockedField(label: string): TemplateResult {
  return html`
    <div class="child-field child-field--locked">
      <div class="child-field-label">${label}</div>
      <div class="child-field-value child-field-value--locked">
        <span class="lock-icon">${icons.x}</span>
        <span class="muted">Privacy restricted</span>
      </div>
    </div>
  `;
}

/**
 * Render accessible field
 */
function renderField(label: string, value: string | undefined): TemplateResult {
  return html`
    <div class="child-field">
      <div class="child-field-label">${label}</div>
      <div class="child-field-value">${value || "—"}</div>
    </div>
  `;
}

/**
 * Render child profile card component
 */
export function renderChildProfileCard(props: ChildProfileCardProps): TemplateResult {
  const { profile } = props;
  const isFoster = profile.type === "foster";
  const canSeeSchool = canAccessField(profile, "school_name");
  const canSeeActivities = canAccessField(profile, "activities");
  const canSeeMedical = canAccessField(profile, "medical_info");

  return html`
    <div class="child-card ${isFoster ? "child-card--foster" : ""}">
      <div class="child-card-header">
        ${renderAvatar(profile)}
        <div class="child-card-info">
          <div class="child-name">${profile.name}</div>
          <div class="child-age muted">${profile.age} years old</div>
          <div class="child-badges">
            <span class="badge ${privacyBadgeClass(profile.privacy_level)}">
              ${profile.privacy_level}
            </span>
            ${isFoster
              ? html`<span class="badge badge-amber">foster</span>`
              : nothing}
          </div>
        </div>
      </div>

      <div class="child-card-body">
        <div class="child-section">
          <div class="child-section-title">School Information</div>
          ${canSeeSchool
            ? html`
                ${renderField("School", profile.school_name)}
                ${renderField("Grade", profile.grade)}
                ${profile.school_data_enabled
                  ? html`
                      <div class="callout" style="margin-top: 8px">
                        <span class="muted"
                          >${icons.check} School data integration enabled</span
                        >
                      </div>
                    `
                  : nothing}
              `
            : html` ${renderLockedField("School")} ${renderLockedField("Grade")} `}
        </div>

        ${canSeeActivities && profile.activities && profile.activities.length > 0
          ? html`
              <div class="child-section">
                <div class="child-section-title">Activities</div>
                <div class="child-activities">
                  ${profile.activities.map(
                    (activity) =>
                      html`<span class="activity-tag">${activity}</span>`,
                  )}
                </div>
              </div>
            `
          : nothing}
        ${!canSeeActivities && profile.privacy_level !== "minimal"
          ? html`
              <div class="child-section">
                <div class="child-section-title">Activities</div>
                ${renderLockedField("Activities")}
              </div>
            `
          : nothing}
        ${canSeeMedical && profile.medical_info
          ? html`
              <div class="child-section">
                <div class="child-section-title">Medical Information</div>
                ${renderField("Notes", profile.medical_info)}
              </div>
            `
          : nothing}
      </div>

      <div class="child-card-footer">
        <button class="btn btn-sm" @click=${() => props.onEdit(profile.id)}>
          ${icons.edit} Edit
        </button>
        <button
          class="btn btn-sm"
          @click=${() => props.onPrivacySettings(profile.id)}
        >
          ${icons.settings} Privacy
        </button>
        <button
          class="btn btn-sm btn-outline"
          @click=${() => props.onViewAudit(profile.id)}
        >
          ${icons.fileText} Audit Log
        </button>
      </div>
    </div>
  `;
}
