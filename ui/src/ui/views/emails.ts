import { html, nothing } from "lit";
import type { Email, EmailFilters } from "../controllers/emails";
import { formatAgo, clampText } from "../format";
import { icons } from "../icons";

export type EmailsProps = {
  loading: boolean;
  emails: Email[];
  selectedEmail: Email | null;
  error: string | null;
  searchQuery: string;
  filters: EmailFilters;
  onRefresh: () => void;
  onSearch: (query: string) => void;
  onFilterChange: (filters: EmailFilters) => void;
  onSelectEmail: (email: Email | null) => void;
  onCreateTask: (email: Email) => void;
  onDraftReply: (email: Email) => void;
  onArchive: (email: Email) => void;
};

function getPriorityColor(priority: number | null): string {
  if (!priority) return "var(--muted)";
  if (priority >= 4) return "var(--error)"; // Urgent - red
  if (priority === 3) return "var(--warn)"; // Medium-high - orange
  if (priority === 2) return "var(--accent)"; // Medium - blue
  return "var(--ok)"; // Low - green
}

function getPriorityLabel(priority: number | null): string {
  if (!priority) return "None";
  if (priority >= 4) return "Urgent";
  if (priority === 3) return "High";
  if (priority === 2) return "Medium";
  return "Low";
}

function getCategoryBadgeColor(category: string | null): string {
  if (!category) return "var(--muted)";
  const categoryMap: Record<string, string> = {
    work: "var(--accent)",
    personal: "var(--ok)",
    urgent: "var(--error)",
    newsletter: "var(--muted)",
    transactional: "var(--warn)",
  };
  return categoryMap[category.toLowerCase()] || "var(--muted)";
}

function renderCategoryBadge(category: string | null) {
  if (!category) return nothing;
  return html`
    <span
      class="badge"
      style="background: ${getCategoryBadgeColor(category)}22; color: ${getCategoryBadgeColor(category)}; border: 1px solid ${getCategoryBadgeColor(category)}44;"
    >
      ${category}
    </span>
  `;
}

function renderPriorityIndicator(priority: number | null) {
  const color = getPriorityColor(priority);
  const label = getPriorityLabel(priority);
  return html`
    <span
      class="priority-indicator"
      style="color: ${color}; font-weight: 600; font-size: 12px;"
      title="${label} priority"
    >
      ${label}
    </span>
  `;
}

function renderEmailListItem(email: Email, isSelected: boolean, onSelect: (email: Email) => void) {
  return html`
    <div
      class="email-item ${isSelected ? "email-item--selected" : ""}"
      @click=${() => onSelect(email)}
      style="cursor: pointer;"
    >
      <div class="email-header">
        <div class="email-sender" style="font-weight: 600; font-size: 14px;">
          ${email.sender_name || email.sender_email}
        </div>
        <div class="email-meta" style="display: flex; gap: 8px; align-items: center;">
          ${renderPriorityIndicator(email.priority)}
          <span class="email-time" style="color: var(--muted); font-size: 12px;">
            ${formatAgo(new Date(email.received_at).getTime())}
          </span>
        </div>
      </div>
      <div class="email-subject" style="font-size: 13px; margin-top: 4px; font-weight: 500;">
        ${email.subject || "(No subject)"}
      </div>
      <div class="email-snippet" style="color: var(--muted); font-size: 12px; margin-top: 4px;">
        ${clampText(email.snippet || "", 100)}
      </div>
      <div class="email-badges" style="display: flex; gap: 6px; margin-top: 6px;">
        ${renderCategoryBadge(email.category)}
        ${email.has_attachments
          ? html`<span class="badge" style="color: var(--muted);">${icons.fileText} Attachment</span>`
          : nothing}
      </div>
    </div>
  `;
}

function renderEmailDetail(
  email: Email,
  onCreateTask: (email: Email) => void,
  onDraftReply: (email: Email) => void,
  onArchive: (email: Email) => void,
  onClose: () => void,
) {
  return html`
    <div class="email-detail">
      <div class="email-detail-header" style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
        <div style="flex: 1;">
          <div class="email-detail-subject" style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">
            ${email.subject || "(No subject)"}
          </div>
          <div class="email-detail-meta" style="color: var(--muted); font-size: 13px;">
            <div>From: ${email.sender_name || email.sender_email}</div>
            <div>Date: ${new Date(email.received_at).toLocaleString()}</div>
            ${email.category ? html`<div>Category: ${renderCategoryBadge(email.category)}</div>` : nothing}
            <div>Priority: ${renderPriorityIndicator(email.priority)}</div>
          </div>
        </div>
        <button class="btn btn--secondary" @click=${onClose} title="Close">
          ✕
        </button>
      </div>

      <div class="email-actions" style="display: flex; gap: 8px; margin-bottom: 16px;">
        <button class="btn btn--primary" @click=${() => onCreateTask(email)}>
          ${icons.zap} Create Task
        </button>
        <button class="btn btn--secondary" @click=${() => onDraftReply(email)}>
          ${icons.messageSquare} Draft Reply
        </button>
        <button class="btn btn--secondary" @click=${() => onArchive(email)}>
          ${icons.fileText} Archive
        </button>
      </div>

      <div class="email-body" style="padding: 16px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-md); line-height: 1.6;">
        ${email.body_plain
          ? html`<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${email.body_plain}</pre>`
          : html`<div style="color: var(--muted);">No content available</div>`}
      </div>

      ${email.has_attachments
        ? html`
            <div class="email-attachments" style="margin-top: 16px; padding: 12px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-md);">
              <div style="font-weight: 600; margin-bottom: 8px;">${icons.fileText} Attachments</div>
              <div style="color: var(--muted); font-size: 13px;">This email has attachments (viewing not yet implemented)</div>
            </div>
          `
        : nothing}
    </div>
  `;
}

function renderFilters(
  filters: EmailFilters,
  onFilterChange: (filters: EmailFilters) => void,
) {
  return html`
    <div class="email-filters" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px;">
      <label class="field">
        <span>Category</span>
        <select
          .value=${filters.category || ""}
          @change=${(e: Event) =>
            onFilterChange({ ...filters, category: (e.target as HTMLSelectElement).value || undefined })}
        >
          <option value="">All</option>
          <option value="work">Work</option>
          <option value="personal">Personal</option>
          <option value="urgent">Urgent</option>
          <option value="newsletter">Newsletter</option>
          <option value="transactional">Transactional</option>
        </select>
      </label>

      <label class="field">
        <span>Priority</span>
        <select
          .value=${filters.priority || ""}
          @change=${(e: Event) =>
            onFilterChange({ ...filters, priority: (e.target as HTMLSelectElement).value || undefined })}
        >
          <option value="">All</option>
          <option value="4">Urgent (4-5)</option>
          <option value="3">High (3)</option>
          <option value="2">Medium (2)</option>
          <option value="1">Low (1)</option>
        </select>
      </label>

      <label class="field">
        <span>From Date</span>
        <input
          type="date"
          .value=${filters.date_from || ""}
          @change=${(e: Event) =>
            onFilterChange({ ...filters, date_from: (e.target as HTMLInputElement).value || undefined })}
        />
      </label>

      <label class="field">
        <span>To Date</span>
        <input
          type="date"
          .value=${filters.date_to || ""}
          @change=${(e: Event) =>
            onFilterChange({ ...filters, date_to: (e.target as HTMLInputElement).value || undefined })}
        />
      </label>
    </div>
  `;
}

export function renderEmails(props: EmailsProps) {
  return html`
    <section class="emails-view">
      <div class="card" style="margin-bottom: 16px;">
        <div class="card-title">Email Intelligence</div>
        <div class="card-sub">Search and manage your emails with AI-powered categorization.</div>

        <div class="email-search" style="margin-top: 16px;">
          <label class="field">
            <span>Semantic Search</span>
            <div style="display: flex; gap: 8px;">
              <input
                type="text"
                placeholder="Search emails by content, sender, or topic..."
                .value=${props.searchQuery}
                @input=${(e: Event) => {
                  const query = (e.target as HTMLInputElement).value;
                  if (query.length === 0 || query.length >= 3) {
                    props.onSearch(query);
                  }
                }}
                @keypress=${(e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    props.onSearch((e.target as HTMLInputElement).value);
                  }
                }}
                style="flex: 1;"
              />
              <button
                class="btn"
                ?disabled=${props.loading}
                @click=${props.onRefresh}
              >
                ${props.loading ? "Loading..." : "Refresh"}
              </button>
            </div>
          </label>
        </div>

        ${renderFilters(props.filters, props.onFilterChange)}

        ${props.error
          ? html`<div class="callout error" style="margin-top: 12px;">
              ${icons.alertTriangle || "⚠️"} ${props.error}
            </div>`
          : nothing}
      </div>

      <div class="emails-content" style="display: grid; grid-template-columns: ${props.selectedEmail ? "1fr 1fr" : "1fr"}; gap: 16px;">
        <div class="card">
          <div class="card-title">
            Inbox
            ${props.emails.length > 0 ? html`<span style="color: var(--muted); font-weight: normal; font-size: 13px;"> (${props.emails.length})</span>` : nothing}
          </div>

          ${props.loading
            ? html`<div style="padding: 40px; text-align: center; color: var(--muted);">
                Loading emails...
              </div>`
            : props.emails.length === 0
              ? html`<div style="padding: 40px; text-align: center; color: var(--muted);">
                  No emails found. Try adjusting your filters or search query.
                </div>`
              : html`
                  <div class="email-list" style="display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">
                    ${props.emails.map((email) =>
                      renderEmailListItem(
                        email,
                        props.selectedEmail?.id === email.id,
                        props.onSelectEmail,
                      ),
                    )}
                  </div>
                `}
        </div>

        ${props.selectedEmail
          ? html`
              <div class="card">
                ${renderEmailDetail(
                  props.selectedEmail,
                  props.onCreateTask,
                  props.onDraftReply,
                  props.onArchive,
                  () => props.onSelectEmail(null),
                )}
              </div>
            `
          : nothing}
      </div>
    </section>

    <style>
      .email-item {
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: var(--card);
        transition: all 0.2s ease;
      }

      .email-item:hover {
        border-color: var(--border-strong);
        box-shadow: var(--shadow-sm);
      }

      .email-item--selected {
        border-color: var(--accent);
        background: var(--accent)11;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: var(--radius-sm);
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .btn {
        padding: 8px 16px;
        border-radius: var(--radius-md);
        font-size: 13px;
        font-weight: 500;
        border: 1px solid var(--border);
        background: var(--card);
        color: var(--text);
        cursor: pointer;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .btn:hover:not(:disabled) {
        border-color: var(--border-strong);
        box-shadow: var(--shadow-sm);
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn--primary {
        background: var(--accent);
        color: white;
        border-color: var(--accent);
      }

      .btn--primary:hover:not(:disabled) {
        background: var(--accent-hover);
        border-color: var(--accent-hover);
      }

      .btn--secondary {
        background: var(--card);
        color: var(--text);
        border-color: var(--border);
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .field > span {
        font-size: 12px;
        font-weight: 500;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .field input,
      .field select {
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: var(--card);
        color: var(--text);
        font-size: 13px;
      }

      .field input:focus,
      .field select:focus {
        outline: none;
        border-color: var(--accent);
      }

      .callout {
        padding: 12px;
        border-radius: var(--radius-md);
        border: 1px solid;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
      }

      .callout.error {
        background: var(--error)11;
        border-color: var(--error)44;
        color: var(--error);
      }
    </style>
  `;
}
