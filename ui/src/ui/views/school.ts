/**
 * School Data View
 * Displays school news, messages, and notes for a child
 */

import { html, nothing } from 'lit';
import {
  type SchoolDataState,
  type SchoolDataItem,
  formatSchoolDataDate,
  getSchoolDataIcon,
  getSchoolDataColor,
} from '../controllers/school';

export interface SchoolViewProps {
  state: SchoolDataState;
  childId: number;
  childName: string;
  onRefresh: () => void;
  onFilterChange: (type: 'all' | 'news' | 'message' | 'note') => void;
  onSync: () => void;
  expandedItems?: Set<number>;
  onToggleExpand?: (itemId: number) => void;
}

export function renderSchoolData(props: SchoolViewProps) {
  const { state, childId, childName, onRefresh, onFilterChange, onSync, expandedItems = new Set(), onToggleExpand } = props;

  return html`
    <div class="school-data-container">
      <!-- Header -->
      <div class="school-header">
        <div class="school-title">
          <h3>📚 School Data - ${childName}</h3>
          <p class="school-subtitle">News, messages, and notes from Quiculum</p>
        </div>
        <div class="school-actions">
          <button @click=${onSync} class="btn-sync">
            🔄 Manual Sync
          </button>
          <button @click=${onRefresh} class="btn-refresh">
            ♻️ Refresh
          </button>
        </div>
      </div>

      <!-- Filter Tabs -->
      <div class="filter-tabs">
        <button
          class="filter-tab ${state.filterType === 'all' ? 'active' : ''}"
          @click=${() => onFilterChange('all')}
        >
          📋 All
        </button>
        <button
          class="filter-tab ${state.filterType === 'news' ? 'active' : ''}"
          @click=${() => onFilterChange('news')}
        >
          📰 News
        </button>
        <button
          class="filter-tab ${state.filterType === 'message' ? 'active' : ''}"
          @click=${() => onFilterChange('message')}
        >
          📧 Messages
        </button>
        <button
          class="filter-tab ${state.filterType === 'note' ? 'active' : ''}"
          @click=${() => onFilterChange('note')}
        >
          📝 Notes
        </button>
      </div>

      <!-- Content -->
      ${state.loading ? renderLoading() : nothing}
      ${state.error ? renderError(state.error) : nothing}
      ${!state.loading && !state.error ? renderItems(state.items, expandedItems, onToggleExpand) : nothing}
    </div>

    <style>
      .school-data-container {
        background: white;
        border-radius: 8px;
        padding: 20px;
        margin-top: 20px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      .school-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 2px solid #e5e7eb;
      }

      .school-title h3 {
        margin: 0 0 5px 0;
        font-size: 20px;
        color: #111827;
      }

      .school-subtitle {
        margin: 0;
        font-size: 14px;
        color: #6b7280;
      }

      .school-actions {
        display: flex;
        gap: 10px;
      }

      .btn-sync,
      .btn-refresh {
        padding: 8px 16px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        background: white;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
      }

      .btn-sync:hover,
      .btn-refresh:hover {
        background: #f9fafb;
        border-color: #9ca3af;
      }

      .filter-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 20px;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 10px;
      }

      .filter-tab {
        padding: 8px 16px;
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 14px;
        color: #6b7280;
        border-radius: 6px 6px 0 0;
        transition: all 0.2s;
      }

      .filter-tab:hover {
        background: #f3f4f6;
        color: #111827;
      }

      .filter-tab.active {
        background: #eff6ff;
        color: #2563eb;
        font-weight: 500;
      }

      .school-items {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .school-item {
        padding: 16px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: #fafafa;
        transition: all 0.2s;
        user-select: none;
      }

      .school-item:hover {
        background: white;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .school-item.expanded {
        background: white;
        border-color: #3b82f6;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
      }

      .item-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }

      .item-type-badge {
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
        color: white;
      }

      .item-date {
        font-size: 13px;
        color: #6b7280;
        margin-left: auto;
      }

      .item-title {
        font-size: 15px;
        font-weight: 500;
        color: #111827;
        margin: 0 0 8px 0;
      }

      .item-content {
        font-size: 14px;
        color: #4b5563;
        line-height: 1.5;
      }

      .item-content-expanded {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #e5e7eb;
        animation: slideDown 0.2s ease-out;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .item-metadata {
        margin-top: 12px;
        padding: 12px;
        background: #f9fafb;
        border-radius: 6px;
        font-size: 13px;
        color: #374151;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .item-metadata div {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }

      .item-metadata strong {
        color: #1f2937;
        min-width: 70px;
      }

      .loading {
        text-align: center;
        padding: 40px;
        color: #6b7280;
      }

      .error {
        padding: 20px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 6px;
        color: #dc2626;
      }

      .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: #6b7280;
      }

      .empty-state-icon {
        font-size: 48px;
        margin-bottom: 15px;
      }
    </style>
  `;
}

function renderLoading() {
  return html`
    <div class="loading">
      <div>⏳ Loading school data...</div>
    </div>
  `;
}

function renderError(error: string) {
  return html`
    <div class="error">
      <strong>Error loading school data:</strong> ${error}
    </div>
  `;
}

function renderItems(
  items: SchoolDataItem[],
  expandedItems: Set<number> = new Set(),
  onToggleExpand?: (itemId: number) => void
) {
  if (items.length === 0) {
    return html`
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div>No school data found</div>
        <div style="font-size: 13px; margin-top: 8px;">
          Data syncs automatically every day at 6:00 AM
        </div>
      </div>
    `;
  }

  return html`
    <div class="school-items">
      ${items.map((item) => renderItem(item, expandedItems, onToggleExpand))}
    </div>
  `;
}

function renderItem(
  item: SchoolDataItem,
  expandedItems: Set<number> = new Set(),
  onToggleExpand?: (itemId: number) => void
) {
  const icon = getSchoolDataIcon(item.type);
  const color = getSchoolDataColor(item.type);
  const date = formatSchoolDataDate(item.published_at);
  const isExpanded = expandedItems.has(item.id);

  return html`
    <div
      class="school-item ${isExpanded ? 'expanded' : ''}"
      @click=${() => onToggleExpand?.(item.id)}
      style="cursor: pointer;"
    >
      <div class="item-header">
        <span style="font-size: 18px;">${icon}</span>
        <span class="item-type-badge" style="background-color: ${color};">
          ${item.type.toUpperCase()}
        </span>
        <span class="item-date">${date}</span>
        <span style="margin-left: auto; font-size: 18px; color: #6b7280;">
          ${isExpanded ? '▼' : '▶'}
        </span>
      </div>

      <h4 class="item-title">${item.title || '(No title)'}</h4>

      ${isExpanded
        ? html`
            <div class="item-content-expanded">
              ${item.content
                ? html`<div class="item-content">${item.content}</div>`
                : html`<div class="item-content muted">(No content)</div>`}

              ${item.metadata && Object.keys(item.metadata).length > 0
                ? html`
                    <div class="item-metadata">
                      ${item.metadata.author
                        ? html`<div>📝 <strong>Author:</strong> ${item.metadata.author}</div>`
                        : nothing}
                      ${item.metadata.sender
                        ? html`<div>✉️ <strong>From:</strong> ${item.metadata.sender}</div>`
                        : nothing}
                      ${item.metadata.teacher
                        ? html`<div>👨‍🏫 <strong>Teacher:</strong> ${item.metadata.teacher}</div>`
                        : nothing}
                      ${item.metadata.subject
                        ? html`<div>📚 <strong>Subject:</strong> ${item.metadata.subject}</div>`
                        : nothing}
                    </div>
                  `
                : nothing}
            </div>
          `
        : nothing}
    </div>
  `;
}
