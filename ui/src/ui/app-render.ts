import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";
import { refreshChatAvatar } from "./app-chat";
import { renderChatControls, renderTab, renderThemeToggle } from "./app-render.helpers";
import { loadChannels } from "./controllers/channels";
import { loadChatHistory } from "./controllers/chat";
import {
  applyConfig,
  loadConfig,
  runUpdate,
  saveConfig,
  updateConfigFormValue,
  removeConfigFormValue,
} from "./controllers/config";
import {
  loadCronRuns,
  toggleCronJob,
  runCronJob,
  removeCronJob,
  addCronJob,
  loadBackendAutomations,
} from "./controllers/cron";
import { loadDebug, callDebugMethod } from "./controllers/debug";
import {
  loadEmails,
  searchEmails,
  createTaskFromEmail,
  draftReply,
  archiveEmail,
} from "./controllers/emails";
import {
  fetchEvents,
  fetchConflicts,
  createEvent,
  updateEvent,
  deleteEvent,
  getWeekBounds,
  getDayBounds,
} from "./controllers/calendar";
import {
  approveDevicePairing,
  loadDevices,
  rejectDevicePairing,
  revokeDeviceToken,
  rotateDeviceToken,
} from "./controllers/devices";
import {
  fetchChildren,
  updatePrivacyLevel,
  fetchAuditLog,
  toggleSchoolData,
  type ChildProfile,
  type PrivacyLevel,
} from "./controllers/family";
import {
  fetchSchoolData,
  syncSchoolData,
  type SchoolDataState,
} from "./controllers/school";
import {
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
  bulkDeleteTasks,
  bulkCompleteTasks,
  type Task,
  type TaskFilters,
} from "./controllers/tasks";
import {
  loadExecApprovals,
  removeExecApprovalsFormValue,
  saveExecApprovals,
  updateExecApprovalsFormValue,
} from "./controllers/exec-approvals";
import { loadLogs } from "./controllers/logs";
import { loadNodes } from "./controllers/nodes";
import { loadPresence } from "./controllers/presence";
import { deleteSession, loadSessions, patchSession } from "./controllers/sessions";
import {
  installSkill,
  loadSkills,
  saveSkillApiKey,
  updateSkillEdit,
  updateSkillEnabled,
} from "./controllers/skills";
import { icons } from "./icons";
import { TAB_GROUPS, subtitleForTab, titleForTab } from "./navigation";
import { renderChannels } from "./views/channels";
import { renderChat } from "./views/chat";
import { renderConfig } from "./views/config";
import { renderCron } from "./views/cron";
import { renderDebug } from "./views/debug";
import { renderEmails } from "./views/emails";
import { renderCalendar } from "./views/calendar";
import { renderExecApprovalPrompt } from "./views/exec-approval";
import { renderFamily } from "./views/family";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation";
import { renderInstances } from "./views/instances";
import { renderLogs } from "./views/logs";
import { renderNodes } from "./views/nodes";
import { renderOverview } from "./views/overview";
import { renderSchoolData } from "./views/school";
import { renderSessions } from "./views/sessions";
import { renderSkills } from "./views/skills";
import { renderTasks } from "./views/tasks";

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;

function getOdinApiBaseUrl(): string {
  // When running on odin.153.se, use the public mcp endpoint
  if (window.location.hostname === "odin.153.se") {
    const protocol = window.location.protocol;
    return `${protocol}//mcp-odin.153.se`;
  }
  // Default to localhost for local development
  return "http://localhost:5100";
}

async function loadCalendarEvents(state: AppViewState) {
  if (state.calendarLoading) {
    return;
  }
  state.calendarLoading = true;
  state.calendarError = null;
  try {
    const baseUrl = getOdinApiBaseUrl();
    const bounds = state.calendarView === "weekly"
      ? getWeekBounds(state.calendarCurrentDate)
      : getDayBounds(state.calendarCurrentDate);

    const [events, conflicts] = await Promise.all([
      fetchEvents(baseUrl, bounds.start, bounds.end),
      fetchConflicts(baseUrl, bounds.start, bounds.end),
    ]);

    state.calendarEvents = events;
    state.calendarConflicts = conflicts;
  } catch (err) {
    state.calendarError = String(err);
    state.calendarEvents = [];
    state.calendarConflicts = [];
  } finally {
    state.calendarLoading = false;
  }
}

async function loadFamilyData(state: AppViewState) {
  if (state.familyLoading) {
    return;
  }
  state.familyLoading = true;
  state.familyError = null;
  try {
    const baseUrl = getOdinApiBaseUrl();
    const familyState = {
      children: state.familyChildren,
      loading: state.familyLoading,
      error: state.familyError,
      selectedChildId: state.familySelectedChildId,
      auditLog: state.familyAuditLog,
      auditLoading: state.familyAuditLoading,
    };
    await fetchChildren(familyState, baseUrl);
    state.familyChildren = familyState.children;
    state.familyError = familyState.error;

    // Auto-load school data for children with school_data_enabled
    for (const child of state.familyChildren) {
      if (child.school_data_enabled) {
        await loadSchoolDataForChild(state, child.id);
      }
    }
  } catch (err) {
    state.familyError = String(err);
    state.familyChildren = [];
  } finally {
    state.familyLoading = false;
  }
}

async function loadSchoolDataForChild(state: AppViewState, childId: string) {
  const childIdNum = parseInt(childId);
  if (state.schoolLoadingByChildId[childId]) {
    return;
  }

  state.schoolLoadingByChildId[childId] = true;
  const filterType = state.schoolFilterByChildId[childId] || 'all';

  if (!state.schoolDataByChildId[childId]) {
    state.schoolDataByChildId[childId] = {
      items: [],
      error: null,
    };
  }

  try {
    const baseUrl = getOdinApiBaseUrl();
    const schoolDataState: SchoolDataState = {
      items: state.schoolDataByChildId[childId].items || [],
      loading: true,
      error: null,
      filterType: filterType,
    };

    await fetchSchoolData(schoolDataState, baseUrl, childIdNum);
    state.schoolDataByChildId[childId] = {
      items: schoolDataState.items,
      error: schoolDataState.error,
    };
  } catch (err) {
    state.schoolDataByChildId[childId] = {
      items: [],
      error: String(err),
    };
  } finally {
    state.schoolLoadingByChildId[childId] = false;
  }
}

async function filterSchoolDataForChild(state: AppViewState, childId: string, filterType: 'all' | 'news' | 'message' | 'note') {
  state.schoolFilterByChildId[childId] = filterType;
  await loadSchoolDataForChild(state, childId);
}

async function syncAllSchoolData(state: AppViewState) {
  try {
    const baseUrl = getOdinApiBaseUrl();
    const result = await syncSchoolData(baseUrl, 'samuel@153.se');
    if (result.success) {
      // Reload school data for all children
      for (const child of state.familyChildren) {
        await loadSchoolDataForChild(state, child.id);
      }
    }
  } catch (err) {
    console.error('Failed to sync school data:', err);
  }
}

export async function loadChildrenWithSchoolData(state: AppViewState) {
  console.log('[School] loadChildrenWithSchoolData started');
  state.familyLoading = true;
  state.familyError = null;
  try {
    const baseUrl = getOdinApiBaseUrl();
    console.log('[School] baseUrl:', baseUrl);
    const { fetchChildrenWithSchoolData } = await import('./controllers/school');
    console.log('[School] Calling fetchChildrenWithSchoolData...');
    const children = await fetchChildrenWithSchoolData(baseUrl, 'samuel@153.se');
    console.log('[School] Fetched children:', children.length);
    state.familyChildren = children;

    // Auto-select first child if none selected
    if (!state.schoolSelectedChildId && children.length > 0) {
      console.log('[School] Auto-selecting first child:', children[0].id);
      state.schoolSelectedChildId = children[0].id;
      await loadSchoolDataForChild(state, children[0].id);
    } else if (state.schoolSelectedChildId) {
      await loadSchoolDataForChild(state, state.schoolSelectedChildId);
    }
  } catch (err) {
    console.error('[School] Failed to load children with school data:', err);
    state.familyChildren = [];
    state.familyError = String(err);
  } finally {
    console.log('[School] Loading finished, familyLoading = false');
    state.familyLoading = false;
  }
}

async function loadTasksData(state: AppViewState) {
  if (state.tasksLoading) {
    return;
  }
  state.tasksLoading = true;
  state.tasksError = null;
  try {
    const baseUrl = getOdinApiBaseUrl();
    const tasks = await fetchTasks(baseUrl, state.tasksFilters);
    state.tasks = tasks;
  } catch (err) {
    state.tasksError = String(err);
    state.tasks = [];
  } finally {
    state.tasksLoading = false;
  }
}

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

export function renderApp(state: AppViewState) {
  const presenceCount = state.presenceEntries.length;
  const sessionsCount = state.sessionsResult?.count ?? null;
  const cronNext = state.cronStatus?.nextWakeAtMs ?? null;
  const chatDisabledReason = state.connected ? null : "Disconnected from gateway.";
  const isChat = state.tab === "chat";
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;

  return html`
    <div class="shell ${isChat ? "shell--chat" : ""} ${chatFocus ? "shell--chat-focus" : ""} ${state.settings.navCollapsed ? "shell--nav-collapsed" : ""} ${state.onboarding ? "shell--onboarding" : ""}">
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="nav-collapse-toggle"
            @click=${() =>
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              })}
            title="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
            aria-label="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
          >
            <span class="nav-collapse-toggle__icon">${icons.menu}</span>
          </button>
          <div class="brand">
            <div class="brand-logo">
              <img src="/favicon.svg" alt="OpenClaw" />
            </div>
            <div class="brand-text">
              <div class="brand-title">OPENCLAW</div>
              <div class="brand-sub">Gateway Dashboard</div>
            </div>
          </div>
        </div>
        <div class="topbar-status">
          <div class="pill">
            <span class="statusDot ${state.connected ? "ok" : ""}"></span>
            <span>Health</span>
            <span class="mono">${state.connected ? "OK" : "Offline"}</span>
          </div>
          ${renderThemeToggle(state)}
        </div>
      </header>
      <aside class="nav ${state.settings.navCollapsed ? "nav--collapsed" : ""}">
        ${TAB_GROUPS.map((group) => {
          const isGroupCollapsed = state.settings.navGroupsCollapsed[group.label] ?? false;
          const hasActiveTab = group.tabs.some((tab) => tab === state.tab);
          return html`
            <div class="nav-group ${isGroupCollapsed && !hasActiveTab ? "nav-group--collapsed" : ""}">
              <button
                class="nav-label"
                @click=${() => {
                  const next = { ...state.settings.navGroupsCollapsed };
                  next[group.label] = !isGroupCollapsed;
                  state.applySettings({
                    ...state.settings,
                    navGroupsCollapsed: next,
                  });
                }}
                aria-expanded=${!isGroupCollapsed}
              >
                <span class="nav-label__text">${group.label}</span>
                <span class="nav-label__chevron">${isGroupCollapsed ? "+" : "−"}</span>
              </button>
              <div class="nav-group__items">
                ${group.tabs.map((tab) => renderTab(state, tab))}
              </div>
            </div>
          `;
        })}
        <div class="nav-group nav-group--links">
          <div class="nav-label nav-label--static">
            <span class="nav-label__text">Resources</span>
          </div>
          <div class="nav-group__items">
            <a
              class="nav-item nav-item--external"
              href="https://docs.openclaw.ai"
              target="_blank"
              rel="noreferrer"
              title="Docs (opens in new tab)"
            >
              <span class="nav-item__icon" aria-hidden="true">${icons.book}</span>
              <span class="nav-item__text">Docs</span>
            </a>
          </div>
        </div>
      </aside>
      <main class="content ${isChat ? "content--chat" : ""}">
        <section class="content-header">
          <div>
            <div class="page-title">${titleForTab(state.tab)}</div>
            <div class="page-sub">${subtitleForTab(state.tab)}</div>
          </div>
          <div class="page-meta">
            ${state.lastError ? html`<div class="pill danger">${state.lastError}</div>` : nothing}
            ${isChat ? renderChatControls(state) : nothing}
          </div>
        </section>

        ${
          state.tab === "overview"
            ? renderOverview({
                connected: state.connected,
                hello: state.hello,
                settings: state.settings,
                password: state.password,
                lastError: state.lastError,
                presenceCount,
                sessionsCount,
                cronEnabled: state.cronStatus?.enabled ?? null,
                cronNext,
                lastChannelsRefresh: state.channelsLastSuccess,
                onSettingsChange: (next) => state.applySettings(next),
                onPasswordChange: (next) => (state.password = next),
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.resetToolStream();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                },
                onConnect: () => state.connect(),
                onRefresh: () => state.loadOverview(),
              })
            : nothing
        }

        ${
          state.tab === "channels"
            ? renderChannels({
                connected: state.connected,
                loading: state.channelsLoading,
                snapshot: state.channelsSnapshot,
                lastError: state.channelsError,
                lastSuccessAt: state.channelsLastSuccess,
                whatsappMessage: state.whatsappLoginMessage,
                whatsappQrDataUrl: state.whatsappLoginQrDataUrl,
                whatsappConnected: state.whatsappLoginConnected,
                whatsappBusy: state.whatsappBusy,
                configSchema: state.configSchema,
                configSchemaLoading: state.configSchemaLoading,
                configForm: state.configForm,
                configUiHints: state.configUiHints,
                configSaving: state.configSaving,
                configFormDirty: state.configFormDirty,
                nostrProfileFormState: state.nostrProfileFormState,
                nostrProfileAccountId: state.nostrProfileAccountId,
                onRefresh: (probe) => loadChannels(state, probe),
                onWhatsAppStart: (force) => state.handleWhatsAppStart(force),
                onWhatsAppWait: () => state.handleWhatsAppWait(),
                onWhatsAppLogout: () => state.handleWhatsAppLogout(),
                onConfigPatch: (path, value) => updateConfigFormValue(state, path, value),
                onConfigSave: () => state.handleChannelConfigSave(),
                onConfigReload: () => state.handleChannelConfigReload(),
                onNostrProfileEdit: (accountId, profile) =>
                  state.handleNostrProfileEdit(accountId, profile),
                onNostrProfileCancel: () => state.handleNostrProfileCancel(),
                onNostrProfileFieldChange: (field, value) =>
                  state.handleNostrProfileFieldChange(field, value),
                onNostrProfileSave: () => state.handleNostrProfileSave(),
                onNostrProfileImport: () => state.handleNostrProfileImport(),
                onNostrProfileToggleAdvanced: () => state.handleNostrProfileToggleAdvanced(),
              })
            : nothing
        }

        ${
          state.tab === "instances"
            ? renderInstances({
                loading: state.presenceLoading,
                entries: state.presenceEntries,
                lastError: state.presenceError,
                statusMessage: state.presenceStatus,
                onRefresh: () => loadPresence(state),
              })
            : nothing
        }

        ${
          state.tab === "sessions"
            ? renderSessions({
                loading: state.sessionsLoading,
                result: state.sessionsResult,
                error: state.sessionsError,
                activeMinutes: state.sessionsFilterActive,
                limit: state.sessionsFilterLimit,
                includeGlobal: state.sessionsIncludeGlobal,
                includeUnknown: state.sessionsIncludeUnknown,
                basePath: state.basePath,
                onFiltersChange: (next) => {
                  state.sessionsFilterActive = next.activeMinutes;
                  state.sessionsFilterLimit = next.limit;
                  state.sessionsIncludeGlobal = next.includeGlobal;
                  state.sessionsIncludeUnknown = next.includeUnknown;
                },
                onRefresh: () => loadSessions(state),
                onPatch: (key, patch) => patchSession(state, key, patch),
                onDelete: (key) => deleteSession(state, key),
              })
            : nothing
        }

        ${
          state.tab === "cron"
            ? renderCron({
                loading: state.cronLoading,
                status: state.cronStatus,
                jobs: state.cronJobs,
                backendAutomations: state.backendAutomations,
                backendAutomationsLoading: state.backendAutomationsLoading,
                error: state.cronError,
                busy: state.cronBusy,
                form: state.cronForm,
                channels: state.channelsSnapshot?.channelMeta?.length
                  ? state.channelsSnapshot.channelMeta.map((entry) => entry.id)
                  : (state.channelsSnapshot?.channelOrder ?? []),
                channelLabels: state.channelsSnapshot?.channelLabels ?? {},
                channelMeta: state.channelsSnapshot?.channelMeta ?? [],
                runsJobId: state.cronRunsJobId,
                runs: state.cronRuns,
                onFormChange: (patch) => (state.cronForm = { ...state.cronForm, ...patch }),
                onRefresh: () => state.loadCron(),
                onAdd: () => addCronJob(state),
                onToggle: (job, enabled) => toggleCronJob(state, job, enabled),
                onRun: (job) => runCronJob(state, job),
                onRemove: (job) => removeCronJob(state, job),
                onLoadRuns: (jobId) => loadCronRuns(state, jobId),
                onRefreshBackend: () => {
                  const baseUrl = getOdinApiBaseUrl();
                  loadBackendAutomations(state, baseUrl);
                },
              })
            : nothing
        }

        ${
          state.tab === "emails"
            ? renderEmails({
                loading: state.emailsLoading,
                emails: state.emails as any[],
                selectedEmail: state.selectedEmail as any,
                error: state.emailError,
                searchQuery: state.emailSearchQuery,
                filters: state.emailFilters as any,
                onRefresh: () => loadEmails(state as any),
                onSearch: (query) => {
                  state.emailSearchQuery = query;
                  if (query.trim()) {
                    searchEmails(state as any, query);
                  } else {
                    loadEmails(state as any);
                  }
                },
                onFilterChange: (filters) => {
                  state.emailFilters = filters;
                  loadEmails(state as any);
                },
                onSelectEmail: (email) => (state.selectedEmail = email),
                onCreateTask: (email) => createTaskFromEmail(state as any, email),
                onDraftReply: (email) => draftReply(state as any, email),
                onArchive: (email) => archiveEmail(state as any, email),
              })
            : nothing
        }

        ${
          state.tab === "calendar"
            ? renderCalendar({
                loading: state.calendarLoading,
                error: state.calendarError,
                events: state.calendarEvents as any[],
                conflicts: state.calendarConflicts as any[],
                view: state.calendarView,
                currentDate: state.calendarCurrentDate,
                selectedEvent: state.calendarSelectedEvent as any,
                onViewChange: (view) => {
                  state.calendarView = view;
                  loadCalendarEvents(state);
                },
                onDateChange: (date) => {
                  state.calendarCurrentDate = date;
                  loadCalendarEvents(state);
                },
                onEventSelect: (event) => (state.calendarSelectedEvent = event),
                onEventUpdate: async (eventId, updates) => {
                  try {
                    const baseUrl = getOdinApiBaseUrl();
                    await updateEvent(baseUrl, eventId, updates as any);
                    await loadCalendarEvents(state);
                  } catch (err) {
                    state.calendarError = String(err);
                  }
                },
                onEventDelete: async (eventId) => {
                  try {
                    const baseUrl = getOdinApiBaseUrl();
                    await deleteEvent(baseUrl, eventId);
                    state.calendarSelectedEvent = null;
                    await loadCalendarEvents(state);
                  } catch (err) {
                    state.calendarError = String(err);
                  }
                },
                onRefresh: () => loadCalendarEvents(state),
              })
            : nothing
        }

        ${
          state.tab === "family"
            ? renderFamily({
                state: {
                  children: state.familyChildren,
                  loading: state.familyLoading,
                  error: state.familyError,
                  selectedChildId: state.familySelectedChildId,
                  auditLog: state.familyAuditLog,
                  auditLoading: state.familyAuditLoading,
                },
                onRefresh: () => loadFamilyData(state),
                onEditChild: (childId) => {
                  // TODO: Implement edit modal
                  console.log("Edit child:", childId);
                },
                onPrivacySettings: (childId) => {
                  state.familySelectedChildId = childId;
                },
                onViewAudit: async (childId) => {
                  state.familySelectedChildId = childId;
                  state.familyAuditLoading = true;
                  try {
                    const baseUrl = getOdinApiBaseUrl();
                    const familyState = {
                      children: state.familyChildren,
                      loading: state.familyLoading,
                      error: state.familyError,
                      selectedChildId: childId,
                      auditLog: state.familyAuditLog,
                      auditLoading: true,
                    };
                    await fetchAuditLog(familyState, baseUrl, childId);
                    state.familyAuditLog = familyState.auditLog;
                  } finally {
                    state.familyAuditLoading = false;
                  }
                },
                onCloseAudit: () => {
                  state.familySelectedChildId = null;
                  state.familyAuditLog = [];
                },
                onUpdatePrivacy: async (childId, level) => {
                  try {
                    const baseUrl = getOdinApiBaseUrl();
                    const familyState = {
                      children: state.familyChildren,
                      loading: state.familyLoading,
                      error: state.familyError,
                      selectedChildId: state.familySelectedChildId,
                      auditLog: state.familyAuditLog,
                      auditLoading: state.familyAuditLoading,
                    };
                    await updatePrivacyLevel(familyState, baseUrl, childId, level);
                    await loadFamilyData(state);
                  } catch (err) {
                    state.familyError = String(err);
                  }
                },
                onToggleSchoolData: async (childId, enabled) => {
                  try {
                    const baseUrl = getOdinApiBaseUrl();
                    const familyState = {
                      children: state.familyChildren,
                      loading: state.familyLoading,
                      error: state.familyError,
                      selectedChildId: state.familySelectedChildId,
                      auditLog: state.familyAuditLog,
                      auditLoading: state.familyAuditLoading,
                    };
                    await toggleSchoolData(familyState, baseUrl, childId, enabled);
                    await loadFamilyData(state);
                  } catch (err) {
                    state.familyError = String(err);
                  }
                },
                schoolDataByChildId: state.schoolDataByChildId,
                schoolLoadingByChildId: state.schoolLoadingByChildId,
                schoolFilterByChildId: state.schoolFilterByChildId,
                onLoadSchoolData: (childId) => loadSchoolDataForChild(state, childId),
                onFilterSchoolData: (childId, filterType) => filterSchoolDataForChild(state, childId, filterType),
                onSyncSchoolData: () => syncAllSchoolData(state),
              })
            : nothing
        }

        ${
          state.tab === "school"
            ? html`
                <div class="school-tab-container">
                  ${state.familyLoading
                    ? html`<div class="loading-spinner">Loading children...</div>`
                    : state.familyChildren.filter((c: any) => c.school_data_enabled).length === 0
                    ? html`
                        <div class="empty-state">
                          <div class="empty-state-icon">📚</div>
                          <h3>No School Data Enabled</h3>
                          <p>Enable school data for children in the Family tab first.</p>
                        </div>
                      `
                    : html`
                        <!-- Child Selector -->
                        <div class="child-selector">
                          <label for="school-child-select">Select Child:</label>
                          <select
                            id="school-child-select"
                            @change=${(e: Event) => {
                              const target = e.target as HTMLSelectElement;
                              state.schoolSelectedChildId = target.value;
                              loadSchoolDataForChild(state, target.value);
                            }}
                          >
                            ${state.familyChildren
                              .filter((c: any) => c.school_data_enabled)
                              .map(
                                (child: any) => html`
                                  <option
                                    value=${child.id}
                                    ?selected=${state.schoolSelectedChildId === child.id}
                                  >
                                    ${child.name}
                                  </option>
                                `
                              )}
                          </select>
                        </div>

                        <!-- School Data Display -->
                        ${state.schoolSelectedChildId
                          ? (() => {
                              const selectedChild = state.familyChildren.find(
                                (c: any) => c.id === state.schoolSelectedChildId
                              );
                              const childId = state.schoolSelectedChildId;
                              const schoolData = state.schoolDataByChildId[childId];
                              const loading = state.schoolLoadingByChildId[childId];
                              const filterType = state.schoolFilterByChildId[childId] || 'all';

                              return renderSchoolData({
                                state: {
                                  items: schoolData?.items || [],
                                  loading: loading || false,
                                  error: schoolData?.error || null,
                                  filterType: filterType,
                                },
                                childId: parseInt(childId),
                                childName: selectedChild?.name || 'Unknown',
                                onRefresh: () => loadSchoolDataForChild(state, childId),
                                onFilterChange: (type) => filterSchoolDataForChild(state, childId, type),
                                onSync: () => syncAllSchoolData(state),
                              });
                            })()
                          : nothing}
                      `}
                </div>

                <style>
                  .school-tab-container {
                    padding: 20px;
                    max-width: 1200px;
                    margin: 0 auto;
                  }

                  .child-selector {
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                    margin-bottom: 20px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                  }

                  .child-selector label {
                    font-weight: 500;
                    color: #374151;
                  }

                  .child-selector select {
                    padding: 8px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 6px;
                    font-size: 14px;
                    min-width: 200px;
                    cursor: pointer;
                  }

                  .child-selector select:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                  }

                  .loading-spinner {
                    text-align: center;
                    padding: 60px;
                    font-size: 16px;
                    color: #6b7280;
                  }

                  .empty-state {
                    text-align: center;
                    padding: 80px 20px;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                  }

                  .empty-state-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                  }

                  .empty-state h3 {
                    margin: 0 0 10px 0;
                    color: #111827;
                    font-size: 20px;
                  }

                  .empty-state p {
                    margin: 0;
                    color: #6b7280;
                    font-size: 14px;
                  }
                </style>
              `
            : nothing
        }

        ${
          state.tab === "tasks"
            ? renderTasks({
                loading: state.tasksLoading,
                error: state.tasksError,
                tasks: state.tasks,
                filters: state.tasksFilters,
                viewMode: state.tasksViewMode,
                selectedTasks: state.tasksSelectedTasks,
                showCreateModal: state.tasksShowCreateModal,
                createForm: state.tasksCreateForm,
                onViewModeChange: (mode) => {
                  state.tasksViewMode = mode;
                },
                onFilterChange: (filters) => {
                  state.tasksFilters = filters;
                  loadTasksData(state);
                },
                onTaskSelect: (taskId, selected) => {
                  if (selected) {
                    state.tasksSelectedTasks.add(taskId);
                  } else {
                    state.tasksSelectedTasks.delete(taskId);
                  }
                  state.tasksSelectedTasks = new Set(state.tasksSelectedTasks);
                },
                onTaskUpdate: async (taskId, updates) => {
                  try {
                    const baseUrl = getOdinApiBaseUrl();
                    await updateTask(baseUrl, taskId, updates);
                    await loadTasksData(state);
                  } catch (err) {
                    state.tasksError = String(err);
                  }
                },
                onTaskDelete: async (taskId) => {
                  try {
                    const baseUrl = getOdinApiBaseUrl();
                    await deleteTask(baseUrl, taskId);
                    await loadTasksData(state);
                  } catch (err) {
                    state.tasksError = String(err);
                  }
                },
                onBulkDelete: async () => {
                  try {
                    const baseUrl = getOdinApiBaseUrl();
                    await bulkDeleteTasks(baseUrl, Array.from(state.tasksSelectedTasks));
                    state.tasksSelectedTasks.clear();
                    await loadTasksData(state);
                  } catch (err) {
                    state.tasksError = String(err);
                  }
                },
                onBulkComplete: async () => {
                  try {
                    const baseUrl = getOdinApiBaseUrl();
                    await bulkCompleteTasks(baseUrl, Array.from(state.tasksSelectedTasks));
                    state.tasksSelectedTasks.clear();
                    await loadTasksData(state);
                  } catch (err) {
                    state.tasksError = String(err);
                  }
                },
                onShowCreateModal: () => {
                  state.tasksShowCreateModal = true;
                },
                onHideCreateModal: () => {
                  state.tasksShowCreateModal = false;
                  state.tasksCreateForm = {
                    title: "",
                    description: "",
                    priority: 3,
                    due_date: "",
                  };
                },
                onCreateFormChange: (field, value) => {
                  state.tasksCreateForm = {
                    ...state.tasksCreateForm,
                    [field]: value,
                  };
                },
                onCreateTask: async () => {
                  try {
                    const baseUrl = getOdinApiBaseUrl();
                    await createTask(baseUrl, state.tasksCreateForm);
                    state.tasksShowCreateModal = false;
                    state.tasksCreateForm = {
                      title: "",
                      description: "",
                      priority: 3,
                      due_date: "",
                    };
                    await loadTasksData(state);
                  } catch (err) {
                    state.tasksError = String(err);
                  }
                },
                onRefresh: () => loadTasksData(state),
              })
            : nothing
        }

        ${
          state.tab === "skills"
            ? renderSkills({
                loading: state.skillsLoading,
                report: state.skillsReport,
                error: state.skillsError,
                filter: state.skillsFilter,
                edits: state.skillEdits,
                messages: state.skillMessages,
                busyKey: state.skillsBusyKey,
                onFilterChange: (next) => (state.skillsFilter = next),
                onRefresh: () => loadSkills(state, { clearMessages: true }),
                onToggle: (key, enabled) => updateSkillEnabled(state, key, enabled),
                onEdit: (key, value) => updateSkillEdit(state, key, value),
                onSaveKey: (key) => saveSkillApiKey(state, key),
                onInstall: (skillKey, name, installId) =>
                  installSkill(state, skillKey, name, installId),
              })
            : nothing
        }

        ${
          state.tab === "nodes"
            ? renderNodes({
                loading: state.nodesLoading,
                nodes: state.nodes,
                devicesLoading: state.devicesLoading,
                devicesError: state.devicesError,
                devicesList: state.devicesList,
                configForm:
                  state.configForm ??
                  (state.configSnapshot?.config as Record<string, unknown> | null),
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                configFormMode: state.configFormMode,
                execApprovalsLoading: state.execApprovalsLoading,
                execApprovalsSaving: state.execApprovalsSaving,
                execApprovalsDirty: state.execApprovalsDirty,
                execApprovalsSnapshot: state.execApprovalsSnapshot,
                execApprovalsForm: state.execApprovalsForm,
                execApprovalsSelectedAgent: state.execApprovalsSelectedAgent,
                execApprovalsTarget: state.execApprovalsTarget,
                execApprovalsTargetNodeId: state.execApprovalsTargetNodeId,
                onRefresh: () => loadNodes(state),
                onDevicesRefresh: () => loadDevices(state),
                onDeviceApprove: (requestId) => approveDevicePairing(state, requestId),
                onDeviceReject: (requestId) => rejectDevicePairing(state, requestId),
                onDeviceRotate: (deviceId, role, scopes) =>
                  rotateDeviceToken(state, { deviceId, role, scopes }),
                onDeviceRevoke: (deviceId, role) => revokeDeviceToken(state, { deviceId, role }),
                onLoadConfig: () => loadConfig(state),
                onLoadExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return loadExecApprovals(state, target);
                },
                onBindDefault: (nodeId) => {
                  if (nodeId) {
                    updateConfigFormValue(state, ["tools", "exec", "node"], nodeId);
                  } else {
                    removeConfigFormValue(state, ["tools", "exec", "node"]);
                  }
                },
                onBindAgent: (agentIndex, nodeId) => {
                  const basePath = ["agents", "list", agentIndex, "tools", "exec", "node"];
                  if (nodeId) {
                    updateConfigFormValue(state, basePath, nodeId);
                  } else {
                    removeConfigFormValue(state, basePath);
                  }
                },
                onSaveBindings: () => saveConfig(state),
                onExecApprovalsTargetChange: (kind, nodeId) => {
                  state.execApprovalsTarget = kind;
                  state.execApprovalsTargetNodeId = nodeId;
                  state.execApprovalsSnapshot = null;
                  state.execApprovalsForm = null;
                  state.execApprovalsDirty = false;
                  state.execApprovalsSelectedAgent = null;
                },
                onExecApprovalsSelectAgent: (agentId) => {
                  state.execApprovalsSelectedAgent = agentId;
                },
                onExecApprovalsPatch: (path, value) =>
                  updateExecApprovalsFormValue(state, path, value),
                onExecApprovalsRemove: (path) => removeExecApprovalsFormValue(state, path),
                onSaveExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return saveExecApprovals(state, target);
                },
              })
            : nothing
        }

        ${
          state.tab === "chat"
            ? renderChat({
                sessionKey: state.sessionKey,
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.chatAttachments = [];
                  state.chatStream = null;
                  state.chatStreamStartedAt = null;
                  state.chatRunId = null;
                  state.chatQueue = [];
                  state.resetToolStream();
                  state.resetChatScroll();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                  void loadChatHistory(state);
                  void refreshChatAvatar(state);
                },
                thinkingLevel: state.chatThinkingLevel,
                showThinking,
                loading: state.chatLoading,
                sending: state.chatSending,
                compactionStatus: state.compactionStatus,
                assistantAvatarUrl: chatAvatarUrl,
                messages: state.chatMessages,
                toolMessages: state.chatToolMessages,
                stream: state.chatStream,
                streamStartedAt: state.chatStreamStartedAt,
                draft: state.chatMessage,
                queue: state.chatQueue,
                connected: state.connected,
                canSend: state.connected,
                disabledReason: chatDisabledReason,
                error: state.lastError,
                sessions: state.sessionsResult,
                focusMode: chatFocus,
                onRefresh: () => {
                  state.resetToolStream();
                  return Promise.all([loadChatHistory(state), refreshChatAvatar(state)]);
                },
                onToggleFocusMode: () => {
                  if (state.onboarding) {
                    return;
                  }
                  state.applySettings({
                    ...state.settings,
                    chatFocusMode: !state.settings.chatFocusMode,
                  });
                },
                onChatScroll: (event) => state.handleChatScroll(event),
                onDraftChange: (next) => (state.chatMessage = next),
                attachments: state.chatAttachments,
                onAttachmentsChange: (next) => (state.chatAttachments = next),
                onSend: () => state.handleSendChat(),
                canAbort: Boolean(state.chatRunId),
                onAbort: () => void state.handleAbortChat(),
                onQueueRemove: (id) => state.removeQueuedMessage(id),
                onNewSession: () => state.handleSendChat("/new", { restoreDraft: true }),
                // Sidebar props for tool output viewing
                sidebarOpen: state.sidebarOpen,
                sidebarContent: state.sidebarContent,
                sidebarError: state.sidebarError,
                splitRatio: state.splitRatio,
                onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
                onCloseSidebar: () => state.handleCloseSidebar(),
                onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
                assistantName: state.assistantName,
                assistantAvatar: state.assistantAvatar,
              })
            : nothing
        }

        ${
          state.tab === "config"
            ? renderConfig({
                raw: state.configRaw,
                originalRaw: state.configRawOriginal,
                valid: state.configValid,
                issues: state.configIssues,
                loading: state.configLoading,
                saving: state.configSaving,
                applying: state.configApplying,
                updating: state.updateRunning,
                connected: state.connected,
                schema: state.configSchema,
                schemaLoading: state.configSchemaLoading,
                uiHints: state.configUiHints,
                formMode: state.configFormMode,
                formValue: state.configForm,
                originalValue: state.configFormOriginal,
                searchQuery: state.configSearchQuery,
                activeSection: state.configActiveSection,
                activeSubsection: state.configActiveSubsection,
                onRawChange: (next) => {
                  state.configRaw = next;
                },
                onFormModeChange: (mode) => (state.configFormMode = mode),
                onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
                onSearchChange: (query) => (state.configSearchQuery = query),
                onSectionChange: (section) => {
                  state.configActiveSection = section;
                  state.configActiveSubsection = null;
                },
                onSubsectionChange: (section) => (state.configActiveSubsection = section),
                onReload: () => loadConfig(state),
                onSave: () => saveConfig(state),
                onApply: () => applyConfig(state),
                onUpdate: () => runUpdate(state),
              })
            : nothing
        }

        ${
          state.tab === "debug"
            ? renderDebug({
                loading: state.debugLoading,
                status: state.debugStatus,
                health: state.debugHealth,
                models: state.debugModels,
                heartbeat: state.debugHeartbeat,
                eventLog: state.eventLog,
                callMethod: state.debugCallMethod,
                callParams: state.debugCallParams,
                callResult: state.debugCallResult,
                callError: state.debugCallError,
                onCallMethodChange: (next) => (state.debugCallMethod = next),
                onCallParamsChange: (next) => (state.debugCallParams = next),
                onRefresh: () => loadDebug(state),
                onCall: () => callDebugMethod(state),
              })
            : nothing
        }

        ${
          state.tab === "logs"
            ? renderLogs({
                loading: state.logsLoading,
                error: state.logsError,
                file: state.logsFile,
                entries: state.logsEntries,
                filterText: state.logsFilterText,
                levelFilters: state.logsLevelFilters,
                autoFollow: state.logsAutoFollow,
                truncated: state.logsTruncated,
                onFilterTextChange: (next) => (state.logsFilterText = next),
                onLevelToggle: (level, enabled) => {
                  state.logsLevelFilters = { ...state.logsLevelFilters, [level]: enabled };
                },
                onToggleAutoFollow: (next) => (state.logsAutoFollow = next),
                onRefresh: () => loadLogs(state, { reset: true }),
                onExport: (lines, label) => state.exportLogs(lines, label),
                onScroll: (event) => state.handleLogsScroll(event),
              })
            : nothing
        }
      </main>
      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
    </div>
  `;
}
