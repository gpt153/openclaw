export type TaskPriority = 1 | 2 | 3 | 4 | 5;

export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
  created_at: string;
  updated_at: string;
  email_id?: string;
}

export interface TaskFilters {
  status?: TaskStatus | "all";
  priority?: "all" | "high" | "medium" | "low";
  due_date?: "today" | "this_week" | "overdue" | "all";
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority: TaskPriority;
  due_date?: string;
  email_id?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
}

export interface TasksState {
  loading: boolean;
  error: string | null;
  tasks: Task[];
  filters: TaskFilters;
}

export async function fetchTasks(
  baseUrl: string,
  filters: TaskFilters,
): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") {
    params.append("status", filters.status);
  }
  if (filters.priority && filters.priority !== "all") {
    params.append("priority", filters.priority);
  }
  if (filters.due_date && filters.due_date !== "all") {
    params.append("due_date", filters.due_date);
  }

  const url = `${baseUrl}/api/tasks/?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch tasks: ${response.statusText}`);
  }
  return response.json();
}

export async function createTask(
  baseUrl: string,
  task: CreateTaskRequest,
): Promise<Task> {
  const response = await fetch(`${baseUrl}/api/tasks/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  if (!response.ok) {
    throw new Error(`Failed to create task: ${response.statusText}`);
  }
  return response.json();
}

export async function updateTask(
  baseUrl: string,
  taskId: string,
  updates: UpdateTaskRequest,
): Promise<Task> {
  const response = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw new Error(`Failed to update task: ${response.statusText}`);
  }
  return response.json();
}

export async function deleteTask(
  baseUrl: string,
  taskId: string,
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to delete task: ${response.statusText}`);
  }
}

export async function bulkDeleteTasks(
  baseUrl: string,
  taskIds: string[],
): Promise<void> {
  await Promise.all(taskIds.map((id) => deleteTask(baseUrl, id)));
}

export async function bulkCompleteTasks(
  baseUrl: string,
  taskIds: string[],
): Promise<void> {
  await Promise.all(
    taskIds.map((id) => updateTask(baseUrl, id, { status: "done" })),
  );
}
