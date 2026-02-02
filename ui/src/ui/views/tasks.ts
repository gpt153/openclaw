import { html, nothing } from "lit";
import type { Task, TaskStatus, TaskPriority, TaskFilters } from "../controllers/tasks";
import { formatAgo } from "../format";

export interface TasksViewProps {
  loading: boolean;
  error: string | null;
  tasks: Task[];
  filters: TaskFilters;
  viewMode: "kanban" | "list";
  selectedTasks: Set<string>;
  showCreateModal: boolean;
  createForm: {
    title: string;
    description: string;
    priority: TaskPriority;
    due_date: string;
  };
  onViewModeChange: (mode: "kanban" | "list") => void;
  onFilterChange: (filters: TaskFilters) => void;
  onTaskSelect: (taskId: string, selected: boolean) => void;
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void;
  onTaskDelete: (taskId: string) => void;
  onBulkDelete: () => void;
  onBulkComplete: () => void;
  onShowCreateModal: () => void;
  onHideCreateModal: () => void;
  onCreateFormChange: (field: string, value: string | number) => void;
  onCreateTask: () => void;
  onRefresh: () => void;
}

export function renderTasks(props: TasksViewProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">Task Management</div>
          <div class="card-sub">Organize and track your tasks</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn" @click=${() => props.onRefresh()}>
            Refresh
          </button>
          <button class="btn" @click=${() => props.onShowCreateModal()}>
            + New Task
          </button>
          <div class="btn-group">
            <button
              class="btn ${props.viewMode === "kanban" ? "active" : ""}"
              @click=${() => props.onViewModeChange("kanban")}
            >
              Kanban
            </button>
            <button
              class="btn ${props.viewMode === "list" ? "active" : ""}"
              @click=${() => props.onViewModeChange("list")}
            >
              List
            </button>
          </div>
        </div>
      </div>

      ${renderFilters(props)}

      ${
        props.selectedTasks.size > 0
          ? html`
            <div class="row" style="gap: 8px; margin-top: 12px;">
              <span class="muted">${props.selectedTasks.size} selected</span>
              <button class="btn btn-sm" @click=${() => props.onBulkComplete()}>
                Mark Complete
              </button>
              <button class="btn btn-sm danger" @click=${() => props.onBulkDelete()}>
                Delete Selected
              </button>
            </div>
          `
          : nothing
      }

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${props.error}
          </div>`
          : nothing
      }

      ${
        props.loading
          ? html`<div class="muted" style="margin-top: 20px; text-align: center;">
            Loading tasks...
          </div>`
          : props.viewMode === "kanban"
            ? renderKanban(props)
            : renderList(props)
      }
    </section>

    ${props.showCreateModal ? renderCreateModal(props) : nothing}
  `;
}

function renderFilters(props: TasksViewProps) {
  return html`
    <div class="row" style="gap: 16px; margin-top: 16px; flex-wrap: wrap;">
      <label class="field" style="flex: 0 0 auto; min-width: 150px;">
        <span>Status</span>
        <select
          .value=${props.filters.status ?? "all"}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value as TaskStatus | "all";
            props.onFilterChange({ ...props.filters, status: value });
          }}
        >
          <option value="all">All</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </label>

      <label class="field" style="flex: 0 0 auto; min-width: 150px;">
        <span>Priority</span>
        <select
          .value=${props.filters.priority ?? "all"}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            props.onFilterChange({ ...props.filters, priority: value as TaskFilters["priority"] });
          }}
        >
          <option value="all">All</option>
          <option value="high">High (4-5)</option>
          <option value="medium">Medium (2-3)</option>
          <option value="low">Low (1)</option>
        </select>
      </label>

      <label class="field" style="flex: 0 0 auto; min-width: 150px;">
        <span>Due Date</span>
        <select
          .value=${props.filters.due_date ?? "all"}
          @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            props.onFilterChange({ ...props.filters, due_date: value as TaskFilters["due_date"] });
          }}
        >
          <option value="all">All</option>
          <option value="today">Today</option>
          <option value="this_week">This Week</option>
          <option value="overdue">Overdue</option>
        </select>
      </label>
    </div>
  `;
}

function renderKanban(props: TasksViewProps) {
  const todoTasks = props.tasks.filter((t) => t.status === "todo");
  const inProgressTasks = props.tasks.filter((t) => t.status === "in_progress");
  const doneTasks = props.tasks.filter((t) => t.status === "done");

  return html`
    <div class="kanban-board" style="margin-top: 20px;">
      ${renderKanbanColumn("To Do", "todo", todoTasks, props)}
      ${renderKanbanColumn("In Progress", "in_progress", inProgressTasks, props)}
      ${renderKanbanColumn("Done", "done", doneTasks, props)}
    </div>
  `;
}

function renderKanbanColumn(
  title: string,
  status: TaskStatus,
  tasks: Task[],
  props: TasksViewProps,
) {
  return html`
    <div class="kanban-column">
      <div class="kanban-column-header">
        <h3>${title}</h3>
        <span class="badge">${tasks.length}</span>
      </div>
      <div
        class="kanban-column-content"
        @drop=${(e: DragEvent) => handleDrop(e, status, props)}
        @dragover=${(e: DragEvent) => e.preventDefault()}
      >
        ${
          tasks.length === 0
            ? html`<div class="muted" style="padding: 20px; text-align: center;">
              No tasks
            </div>`
            : tasks.map((task) => renderTaskCard(task, props))
        }
      </div>
    </div>
  `;
}

function renderTaskCard(task: Task, props: TasksViewProps) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();
  const priorityClass = task.priority >= 4 ? "high" : task.priority >= 2 ? "medium" : "low";

  return html`
    <div
      class="task-card"
      draggable="true"
      @dragstart=${(e: DragEvent) => {
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", task.id);
        }
      }}
    >
      <div class="task-card-header">
        <input
          type="checkbox"
          .checked=${props.selectedTasks.has(task.id)}
          @change=${(e: Event) => {
            const checked = (e.target as HTMLInputElement).checked;
            props.onTaskSelect(task.id, checked);
          }}
        />
        <span class="priority-badge ${priorityClass}">P${task.priority}</span>
      </div>
      <div class="task-card-title">${task.title}</div>
      ${
        task.description
          ? html`<div class="task-card-description">${task.description}</div>`
          : nothing
      }
      <div class="task-card-footer">
        ${
          task.due_date
            ? html`<span class="task-due-date ${isOverdue ? "overdue" : ""}">
              Due: ${formatDueDate(task.due_date)}
            </span>`
            : nothing
        }
        ${
          task.email_id
            ? html`<span class="task-email-icon" title="Linked to email">📧</span>`
            : nothing
        }
        <button
          class="btn btn-sm danger"
          @click=${() => props.onTaskDelete(task.id)}
        >
          Delete
        </button>
      </div>
    </div>
  `;
}

function renderList(props: TasksViewProps) {
  return html`
    <div class="task-list" style="margin-top: 20px;">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 40px;">
              <input type="checkbox" @change=${(e: Event) => {
                const checked = (e.target as HTMLInputElement).checked;
                props.tasks.forEach((task) => props.onTaskSelect(task.id, checked));
              }} />
            </th>
            <th>Title</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Due Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${
            props.tasks.length === 0
              ? html`<tr>
                <td colspan="6" class="muted" style="text-align: center; padding: 20px;">
                  No tasks found
                </td>
              </tr>`
              : props.tasks.map((task) => renderTaskRow(task, props))
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderTaskRow(task: Task, props: TasksViewProps) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();

  return html`
    <tr class="task-row">
      <td>
        <input
          type="checkbox"
          .checked=${props.selectedTasks.has(task.id)}
          @change=${(e: Event) => {
            const checked = (e.target as HTMLInputElement).checked;
            props.onTaskSelect(task.id, checked);
          }}
        />
      </td>
      <td>
        <div class="task-row-title">
          ${task.title}
          ${task.email_id ? html`<span class="task-email-icon">📧</span>` : nothing}
        </div>
      </td>
      <td>
        <select
          .value=${task.status}
          @change=${(e: Event) => {
            const status = (e.target as HTMLSelectElement).value as TaskStatus;
            props.onTaskUpdate(task.id, { status });
          }}
        >
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </td>
      <td>
        <span class="priority-badge ${task.priority >= 4 ? "high" : task.priority >= 2 ? "medium" : "low"}">
          P${task.priority}
        </span>
      </td>
      <td>
        <span class="${isOverdue ? "overdue" : ""}">
          ${task.due_date ? formatDueDate(task.due_date) : "—"}
        </span>
      </td>
      <td>
        <button
          class="btn btn-sm danger"
          @click=${() => props.onTaskDelete(task.id)}
        >
          Delete
        </button>
      </td>
    </tr>
  `;
}

function renderCreateModal(props: TasksViewProps) {
  return html`
    <div class="modal-overlay" @click=${() => props.onHideCreateModal()}>
      <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Create New Task</h2>
          <button class="btn-close" @click=${() => props.onHideCreateModal()}>×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="field">
              <span>Title *</span>
              <input
                type="text"
                .value=${props.createForm.title}
                @input=${(e: Event) => {
                  const value = (e.target as HTMLInputElement).value;
                  props.onCreateFormChange("title", value);
                }}
                placeholder="Task title"
              />
            </label>
            <label class="field">
              <span>Description</span>
              <textarea
                .value=${props.createForm.description}
                @input=${(e: Event) => {
                  const value = (e.target as HTMLTextAreaElement).value;
                  props.onCreateFormChange("description", value);
                }}
                placeholder="Task description (markdown supported)"
                rows="4"
              ></textarea>
            </label>
            <label class="field">
              <span>Priority</span>
              <select
                .value=${String(props.createForm.priority)}
                @change=${(e: Event) => {
                  const value = Number((e.target as HTMLSelectElement).value);
                  props.onCreateFormChange("priority", value);
                }}
              >
                <option value="1">1 (Lowest)</option>
                <option value="2">2 (Low)</option>
                <option value="3">3 (Medium)</option>
                <option value="4">4 (High)</option>
                <option value="5">5 (Highest)</option>
              </select>
            </label>
            <label class="field">
              <span>Due Date</span>
              <input
                type="date"
                .value=${props.createForm.due_date}
                @input=${(e: Event) => {
                  const value = (e.target as HTMLInputElement).value;
                  props.onCreateFormChange("due_date", value);
                }}
              />
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" @click=${() => props.onHideCreateModal()}>
            Cancel
          </button>
          <button
            class="btn primary"
            ?disabled=${!props.createForm.title.trim()}
            @click=${() => props.onCreateTask()}
          >
            Create Task
          </button>
        </div>
      </div>
    </div>
  `;
}

function handleDrop(e: DragEvent, newStatus: TaskStatus, props: TasksViewProps) {
  e.preventDefault();
  const taskId = e.dataTransfer?.getData("text/plain");
  if (taskId) {
    props.onTaskUpdate(taskId, { status: newStatus });
  }
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return "Tomorrow";
  }

  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `${Math.abs(diffDays)}d ago`;
  }
  if (diffDays <= 7) {
    return `In ${diffDays}d`;
  }

  return date.toLocaleDateString();
}
