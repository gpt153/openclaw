/**
 * Odin API Client
 *
 * Comprehensive TypeScript client for all Odin backend REST APIs.
 * Provides strongly-typed access to email, task, calendar, family, and orchestrator services.
 *
 * @module odin-api-client
 */

// ==============================================================================
// Configuration
// ==============================================================================

export interface OdinApiConfig {
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  debug?: boolean;
}

const DEFAULT_API_URL = "http://localhost:5100";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

// ==============================================================================
// Error Types
// ==============================================================================

export class OdinApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "OdinApiError";
  }
}

export class OdinApiConnectionError extends OdinApiError {
  constructor(message: string) {
    super(message, undefined, true);
    this.name = "OdinApiConnectionError";
  }
}

export class OdinApiTimeoutError extends OdinApiError {
  constructor(message: string) {
    super(message, 408, true);
    this.name = "OdinApiTimeoutError";
  }
}

export class OdinApiServerError extends OdinApiError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode, statusCode >= 500);
    this.name = "OdinApiServerError";
  }
}

export class OdinApiValidationError extends OdinApiError {
  constructor(message: string) {
    super(message, 400, false);
    this.name = "OdinApiValidationError";
  }
}

// ==============================================================================
// Type Definitions - Email
// ==============================================================================

export interface EmailListParams {
  user_id: string;
  skip?: number;
  limit?: number;
  category?: string;
  priority_min?: number;
  account_id?: string;
}

export interface EmailSearchParams {
  query: string;
  user_id: string;
  limit?: number;
  semantic?: boolean;
  account_id?: string;
}

export interface EmailResponse {
  id: number;
  message_id: string;
  user_id: string;
  sender: string;
  subject: string;
  category: string;
  priority: number;
  summary: string | null;
  action_items: string[];
  sentiment: string;
  received_at: string;
  body_preview?: string;
  account_id?: string;
}

export interface EmailSearchResponse {
  results: EmailResponse[];
  total: number;
  query: string;
  semantic_used: boolean;
}

export interface BatchProcessRequest {
  email_ids: number[];
  force_reanalyze?: boolean;
}

// ==============================================================================
// Type Definitions - Tasks
// ==============================================================================

export interface TaskCreateParams {
  user_id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority?: number;
  tags?: string[];
  source?: string;
}

export interface TaskFromEmailRequest {
  email_id: number;
  action_item: string;
  due_date?: string;
}

export interface TaskUpdateParams {
  title?: string;
  description?: string;
  status?: "pending" | "in_progress" | "completed" | "cancelled";
  priority?: number;
  due_date?: string;
  tags?: string[];
}

export interface TaskResponse {
  id: number;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  due_date: string | null;
  tags: string[];
  source: string | null;
  source_id: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TaskListParams {
  user_id?: string;
  status?: string;
  priority_min?: number;
  tag?: string;
  due_before?: string;
  source?: string;
  limit?: number;
}

// ==============================================================================
// Type Definitions - Calendar
// ==============================================================================

export interface CalendarEventExtractParams {
  email_id: number;
  user_id: string;
  auto_create?: boolean;
}

export interface CalendarEventResponse {
  id: number;
  summary: string;
  start: string | null;
  end: string | null;
  location: string | null;
  created_at: string | null;
}

export interface CalendarAutoCreatedParams {
  user_id: string;
  limit?: number;
}

export interface CalendarConflictsParams {
  user_id: string;
  start_time: string;
  end_time: string;
}

// ==============================================================================
// Type Definitions - Family
// ==============================================================================

export interface FamilyRecognizeRequest {
  text: string;
  context_type: string;
  user_id: string;
}

export interface FamilyEntityResponse {
  entity_type: string;
  entity_id: number;
  entity_name: string;
  confidence: number;
}

export interface FamilySearchParams {
  query: string;
  user_id: string;
  child_id?: number;
  limit?: number;
}

// ==============================================================================
// Type Definitions - Orchestrator
// ==============================================================================

export interface OrchestratorMessageParams {
  user_id: string;
  platform: string;
  session_id: string;
  message: string;
  images?: Buffer[];
  thinking_level?: "off" | "low" | "medium" | "high";
  model_preference?: "haiku" | "sonnet" | "opus" | "auto";
}

export interface OrchestratorSessionParams {
  user_id: string;
  platform: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
  services: Record<string, unknown>;
  system: Record<string, unknown>;
}

// ==============================================================================
// Utility Functions
// ==============================================================================

function debugLog(config: Required<OdinApiConfig>, message: string, data?: unknown): void {
  if (config.debug) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [odin-api-client] ${message}`, data ?? "");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffDelay(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * Math.pow(2, attempt - 1);
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof OdinApiError) {
    return error.retryable;
  }
  if (
    error instanceof TypeError &&
    (error.message.includes("fetch") || error.message.includes("network"))
  ) {
    return true;
  }
  return false;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: Required<OdinApiConfig>,
  attempt = 1,
): Promise<Response> {
  try {
    debugLog(config, `Request attempt ${attempt}/${config.maxRetries}`, {
      url,
      method: options.method,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      debugLog(config, `Response received: ${response.status}`, {
        status: response.status,
        statusText: response.statusText,
      });

      if (response.ok) {
        return response;
      }

      if (response.status >= 400 && response.status < 500) {
        const errorText = await response.text();
        throw new OdinApiValidationError(
          `API rejected request: ${response.statusText} - ${errorText}`,
        );
      }

      const errorText = await response.text();
      throw new OdinApiServerError(
        `API server error: ${response.statusText} - ${errorText}`,
        response.status,
      );
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new OdinApiTimeoutError(`Request timed out after ${config.timeout}ms`);
      }

      throw error;
    }
  } catch (error: unknown) {
    debugLog(config, `Request failed (attempt ${attempt}/${config.maxRetries})`, {
      error: error instanceof Error ? error.message : String(error),
      retryable: isRetryableError(error),
    });

    if (attempt >= config.maxRetries || !isRetryableError(error)) {
      if (error instanceof OdinApiError) {
        throw error;
      }
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new OdinApiConnectionError(
          `Failed to connect to Odin API at ${url}. Is it running? Error: ${error.message}`,
        );
      }
      throw new OdinApiError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const backoffMs = getBackoffDelay(attempt, config.retryDelayMs);
    debugLog(config, `Retrying in ${backoffMs}ms...`);
    await sleep(backoffMs);

    return fetchWithRetry(url, options, config, attempt + 1);
  }
}

// ==============================================================================
// OdinApiClient Class
// ==============================================================================

export class OdinApiClient {
  private readonly config: Required<OdinApiConfig>;

  constructor(userConfig?: OdinApiConfig) {
    this.config = {
      baseUrl: userConfig?.baseUrl ?? process.env.ODIN_API_URL ?? DEFAULT_API_URL,
      timeout: userConfig?.timeout ?? DEFAULT_TIMEOUT_MS,
      maxRetries: userConfig?.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryDelayMs: userConfig?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      debug: userConfig?.debug ?? false,
    };
  }

  // ============================================================================
  // Email APIs
  // ============================================================================

  async listEmails(params: EmailListParams): Promise<EmailResponse[]> {
    const queryParams = new URLSearchParams({
      user_id: params.user_id,
      skip: String(params.skip ?? 0),
      limit: String(params.limit ?? 50),
    });

    if (params.category) queryParams.set("category", params.category);
    if (params.priority_min) queryParams.set("priority_min", String(params.priority_min));
    if (params.account_id) queryParams.set("account_id", params.account_id);

    const url = `${this.config.baseUrl}/api/v1/emails?${queryParams}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as EmailResponse[];
  }

  async getEmail(emailId: number): Promise<EmailResponse> {
    const url = `${this.config.baseUrl}/api/v1/emails/${emailId}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as EmailResponse;
  }

  async searchEmails(params: EmailSearchParams): Promise<EmailSearchResponse> {
    const url = `${this.config.baseUrl}/api/v1/emails/search`;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: params.query,
          user_id: params.user_id,
          limit: params.limit ?? 20,
          semantic: params.semantic ?? true,
          account_id: params.account_id,
        }),
      },
      this.config,
    );

    return (await response.json()) as EmailSearchResponse;
  }

  async processEmailsBatch(request: BatchProcessRequest): Promise<{ status: string }> {
    const url = `${this.config.baseUrl}/api/v1/emails/process-batch`;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
      this.config,
    );

    return (await response.json()) as { status: string };
  }

  async getUnprocessedEmails(userId: string): Promise<EmailResponse[]> {
    const url = `${this.config.baseUrl}/api/v1/emails/unprocessed/${userId}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as EmailResponse[];
  }

  // ============================================================================
  // Task APIs
  // ============================================================================

  async createTask(params: TaskCreateParams): Promise<TaskResponse> {
    const url = `${this.config.baseUrl}/api/v1/tasks`;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      },
      this.config,
    );

    return (await response.json()) as TaskResponse;
  }

  async createTaskFromEmail(request: TaskFromEmailRequest): Promise<TaskResponse> {
    const url = `${this.config.baseUrl}/api/v1/tasks/from-email`;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
      this.config,
    );

    return (await response.json()) as TaskResponse;
  }

  async listTasks(params: TaskListParams): Promise<TaskResponse[]> {
    const queryParams = new URLSearchParams({
      limit: String(params.limit ?? 50),
    });

    if (params.user_id) queryParams.set("user_id", params.user_id);
    if (params.status) queryParams.set("status", params.status);
    if (params.priority_min) queryParams.set("priority_min", String(params.priority_min));
    if (params.tag) queryParams.set("tag", params.tag);
    if (params.due_before) queryParams.set("due_before", params.due_before);
    if (params.source) queryParams.set("source", params.source);

    const url = `${this.config.baseUrl}/api/v1/tasks?${queryParams}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as TaskResponse[];
  }

  async getTask(taskId: number): Promise<TaskResponse> {
    const url = `${this.config.baseUrl}/api/v1/tasks/${taskId}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as TaskResponse;
  }

  async updateTask(taskId: number, params: TaskUpdateParams): Promise<TaskResponse> {
    const url = `${this.config.baseUrl}/api/v1/tasks/${taskId}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      },
      this.config,
    );

    return (await response.json()) as TaskResponse;
  }

  async completeTask(taskId: number): Promise<TaskResponse> {
    const url = `${this.config.baseUrl}/api/v1/tasks/${taskId}/complete`;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as TaskResponse;
  }

  async getTasksByEmail(emailId: number): Promise<TaskResponse[]> {
    const url = `${this.config.baseUrl}/api/v1/tasks/by-email/${emailId}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as TaskResponse[];
  }

  // ============================================================================
  // Calendar APIs
  // ============================================================================

  async extractCalendarEvents(
    params: CalendarEventExtractParams,
  ): Promise<{ email_id: number; events_found: number; events: unknown[] }> {
    const queryParams = new URLSearchParams({
      user_id: params.user_id,
      auto_create: String(params.auto_create ?? false),
    });

    const url = `${this.config.baseUrl}/api/v1/calendar/extract-from-email/${params.email_id}?${queryParams}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as {
      email_id: number;
      events_found: number;
      events: unknown[];
    };
  }

  async getAutoCreatedEvents(
    params: CalendarAutoCreatedParams,
  ): Promise<{ total: number; events: CalendarEventResponse[] }> {
    const queryParams = new URLSearchParams({
      user_id: params.user_id,
      limit: String(params.limit ?? 20),
    });

    const url = `${this.config.baseUrl}/api/v1/calendar/auto-created?${queryParams}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as { total: number; events: CalendarEventResponse[] };
  }

  async getCalendarConflicts(params: CalendarConflictsParams): Promise<unknown[]> {
    const queryParams = new URLSearchParams({
      user_id: params.user_id,
      start_time: params.start_time,
      end_time: params.end_time,
    });

    const url = `${this.config.baseUrl}/api/v1/calendar/conflicts?${queryParams}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as unknown[];
  }

  // ============================================================================
  // Family APIs
  // ============================================================================

  async recognizeFamilyEntities(
    request: FamilyRecognizeRequest,
  ): Promise<{ entities: FamilyEntityResponse[] }> {
    const url = `${this.config.baseUrl}/api/v1/family/recognize-entities`;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
      this.config,
    );

    return (await response.json()) as { entities: FamilyEntityResponse[] };
  }

  async getChildEntities(
    childId: number,
    userId: string,
  ): Promise<{ child_id: number; entities: unknown[] }> {
    const queryParams = new URLSearchParams({ user_id: userId });

    const url = `${this.config.baseUrl}/api/v1/family/child/${childId}/entities?${queryParams}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as { child_id: number; entities: unknown[] };
  }

  async searchFamily(params: FamilySearchParams): Promise<unknown> {
    const url = `${this.config.baseUrl}/api/v1/family/search`;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      },
      this.config,
    );

    return await response.json();
  }

  // ============================================================================
  // Orchestrator APIs
  // ============================================================================

  async sendMessage(params: OrchestratorMessageParams): Promise<unknown> {
    const url = `${this.config.baseUrl.replace("5100", "5105")}/api/v1/orchestrator/message`;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      },
      this.config,
    );

    return await response.json();
  }

  async getSession(params: OrchestratorSessionParams): Promise<unknown> {
    const url = `${this.config.baseUrl.replace("5100", "5105")}/api/v1/orchestrator/session/${params.user_id}/${params.platform}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return await response.json();
  }

  async getOrchestratorHealth(): Promise<HealthResponse> {
    const url = `${this.config.baseUrl.replace("5100", "5105")}/api/v1/orchestrator/health`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as HealthResponse;
  }

  async getOrchestratorMetrics(): Promise<unknown> {
    const url = `${this.config.baseUrl.replace("5100", "5105")}/api/v1/orchestrator/metrics`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return await response.json();
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  async getHealth(): Promise<HealthResponse> {
    const url = `${this.config.baseUrl}/health`;

    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      this.config,
    );

    return (await response.json()) as HealthResponse;
  }
}

// ==============================================================================
// Exports
// ==============================================================================

export const DEFAULT_CONFIG: Required<OdinApiConfig> = {
  baseUrl: DEFAULT_API_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  maxRetries: DEFAULT_MAX_RETRIES,
  retryDelayMs: DEFAULT_RETRY_DELAY_MS,
  debug: false,
};
