/**
 * Odin Bridge - HTTP interface to Odin's Python orchestrator
 *
 * Connects OpenClaw Gateway (web UI) to Odin's orchestration layer.
 * Replaces Pi agent with HTTP calls to Python backend.
 *
 * @module odin-bridge
 */

import type { ImageContent } from "@mariozechner/pi-ai";

export interface OdinAgentRequest {
  user_id: string;
  platform: string;
  session_id: string;
  message: string;
  images?: Buffer[];
  skill_context?: unknown;
  thinking_level?: "off" | "low" | "medium" | "high";
  model_preference?: "haiku" | "sonnet" | "opus" | "auto";
}

export interface OdinAgentResponse {
  run_id: string;
  status: "streaming" | "complete" | "error";
  messages: unknown[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cost: number;
  };
  model_used: string;
}

export interface OdinBridgeConfig {
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  debug?: boolean;
}

interface RetryConfig {
  attempt: number;
  maxRetries: number;
  delayMs: number;
}

const DEFAULT_BASE_URL = "http://localhost:5105";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * Generate a consistent session ID for Odin from gateway parameters.
 * Ensures same user on same platform gets same session ID across page refreshes.
 *
 * @param userId - User identifier (e.g., "admin")
 * @param platform - Platform name (e.g., "web")
 * @param sessionHint - Optional session hint from gateway
 * @returns Consistent session ID string
 */
export function generateOdinSessionId(
  userId: string,
  platform: string,
  sessionHint?: string,
): string {
  // If we have a specific session hint, use it with prefix
  if (sessionHint && !sessionHint.startsWith("probe-")) {
    // Extract stable part of session ID (e.g., "web_admin_xxx" -> "web_admin")
    const stablePart = sessionHint.split("_").slice(0, 2).join("_");
    return `odin_${platform}_${userId}_${stablePart}`;
  }

  // Default: use user + platform for persistent session
  return `odin_${platform}_${userId}`;
}

export class OdinBridgeError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "OdinBridgeError";
  }
}

export class OdinConnectionError extends OdinBridgeError {
  constructor(message: string) {
    super(message, undefined, true);
    this.name = "OdinConnectionError";
  }
}

export class OdinTimeoutError extends OdinBridgeError {
  constructor(message: string) {
    super(message, 408, true);
    this.name = "OdinTimeoutError";
  }
}

export class OdinServerError extends OdinBridgeError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode, statusCode >= 500 && statusCode < 600);
    this.name = "OdinServerError";
  }
}

export class OdinValidationError extends OdinBridgeError {
  constructor(message: string) {
    super(message, 400, false);
    this.name = "OdinValidationError";
  }
}

/**
 * Map OdinBridgeError to user-friendly message for WebUI display.
 *
 * @param error - The caught error
 * @returns User-friendly error message
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  if (error instanceof OdinConnectionError) {
    return "The AI service is temporarily unavailable. Please try again in a moment.";
  }

  if (error instanceof OdinTimeoutError) {
    return "The request is taking longer than expected. Please try again.";
  }

  if (error instanceof OdinServerError) {
    if (error.statusCode === 429) {
      return "Too many requests. Please wait a few seconds before trying again.";
    }
    if (error.message.includes("too many clients")) {
      return "The AI service is currently busy. Please try again in a moment.";
    }
    return "The AI service encountered an error. Please try again.";
  }

  if (error instanceof OdinValidationError) {
    // Parse validation errors for user-friendly messages
    const msg = error.message.toLowerCase();
    if (msg.includes("message") && msg.includes("required")) {
      return "Please enter a message to send.";
    }
    if (msg.includes("user_id") || msg.includes("session")) {
      return "Session error. Please refresh the page and try again.";
    }
    return "Invalid request. Please check your input and try again.";
  }

  // Generic fallback
  if (error instanceof Error) {
    // Log the actual error for debugging
    console.error("[odin-bridge] Unhandled error:", error.message);
  }

  return "Something went wrong. Please try again.";
}

/**
 * Determine if an error is retryable automatically.
 *
 * @param error - The caught error
 * @returns Whether the error should trigger automatic retry
 */
export function shouldAutoRetry(error: unknown): boolean {
  if (error instanceof OdinConnectionError) return true;
  if (error instanceof OdinTimeoutError) return true;
  if (error instanceof OdinServerError) {
    // Retry 5xx errors except rate limiting
    return error.statusCode !== undefined && error.statusCode >= 500 && error.statusCode !== 429;
  }
  return false;
}

/**
 * Quick health check for Odin orchestrator.
 *
 * @param baseUrl - Orchestrator base URL
 * @param timeoutMs - Health check timeout
 * @returns Whether orchestrator is healthy
 */
export async function checkOdinHealth(
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = 3000,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

function debugLog(config: OdinBridgeConfig, message: string, data?: unknown): void {
  if (config.debug) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? JSON.stringify(data, null, 2) : "";
    console.error(`[${timestamp}] [odin-bridge] ${message}]`, dataStr);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffDelay(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * Math.pow(2, attempt - 1);
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof OdinBridgeError) {
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
  config: Required<OdinBridgeConfig>,
  retryConfig: RetryConfig,
): Promise<Response> {
  const { attempt, maxRetries, delayMs } = retryConfig;

  try {
    debugLog(config, `Request attempt ${attempt}/${maxRetries}`, { url, method: options.method });

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
        contentType: response.headers.get("content-type"),
      });

      if (response.ok) {
        return response;
      }

      if (response.status >= 400 && response.status < 500) {
        const errorText = await response.text();
        throw new OdinValidationError(
          `Odin rejected request: ${response.statusText} - ${errorText}`,
        );
      }

      const errorText = await response.text();
      throw new OdinServerError(
        `Odin server error: ${response.statusText} - ${errorText}`,
        response.status,
      );
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new OdinTimeoutError(`Request timed out after ${config.timeout}ms`);
      }

      throw error;
    }
  } catch (error: unknown) {
    debugLog(config, `Request failed (attempt ${attempt}/${maxRetries})`, {
      error: error instanceof Error ? error.message : String(error),
      retryable: isRetryableError(error),
    });

    if (attempt >= maxRetries || !isRetryableError(error)) {
      if (error instanceof OdinBridgeError) {
        throw error;
      }
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new OdinConnectionError(
          `Failed to connect to Odin orchestrator at ${url}. Is it running? Error: ${error.message}`,
        );
      }
      throw new OdinBridgeError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const backoffMs = getBackoffDelay(attempt, delayMs);
    debugLog(config, `Retrying in ${backoffMs}ms...`);
    await sleep(backoffMs);

    return fetchWithRetry(url, options, config, {
      attempt: attempt + 1,
      maxRetries,
      delayMs,
    });
  }
}

async function* parseStreamingResponse(
  response: Response,
  config: Required<OdinBridgeConfig>,
): AsyncGenerator<OdinAgentResponse, void, undefined> {
  const contentType = response.headers.get("content-type") || "";

  debugLog(config, "Parsing streaming response", { contentType });

  const isSSE = contentType.includes("text/event-stream");
  const isJSONL =
    contentType.includes("application/x-ndjson") || contentType.includes("application/jsonl");

  if (!isSSE && !isJSONL && !contentType.includes("application/json")) {
    throw new OdinValidationError(
      `Unexpected content type from Odin: ${contentType}. Expected SSE, JSONL, or JSON.`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new OdinBridgeError("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (buffer.trim()) {
          const line = buffer.trim();
          if (isSSE && line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data !== "[DONE]") {
              try {
                yield JSON.parse(data) as OdinAgentResponse;
              } catch (error) {
                debugLog(config, "Failed to parse SSE data", { data, error });
              }
            }
          } else if (isJSONL || !isSSE) {
            try {
              yield JSON.parse(line) as OdinAgentResponse;
            } catch (error) {
              debugLog(config, "Failed to parse JSONL line", { line, error });
            }
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (isSSE) {
          if (trimmed.startsWith("data: ")) {
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;
            try {
              yield JSON.parse(data) as OdinAgentResponse;
            } catch (error) {
              debugLog(config, "Failed to parse SSE data", { data, error });
            }
          }
        } else {
          try {
            yield JSON.parse(trimmed) as OdinAgentResponse;
          } catch (error) {
            debugLog(config, "Failed to parse JSONL line", { trimmed, error });
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* runOdinAgent(
  params: OdinAgentRequest,
  userConfig?: OdinBridgeConfig,
): AsyncGenerator<OdinAgentResponse, void, undefined> {
  const config: Required<OdinBridgeConfig> = {
    baseUrl: userConfig?.baseUrl || process.env.ODIN_ORCHESTRATOR_URL || DEFAULT_BASE_URL,
    timeout: userConfig?.timeout ?? DEFAULT_TIMEOUT_MS,
    maxRetries: userConfig?.maxRetries ?? DEFAULT_MAX_RETRIES,
    retryDelayMs: userConfig?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    debug: userConfig?.debug ?? false,
  };

  if (!params.user_id) {
    throw new OdinValidationError("user_id is required");
  }
  if (!params.platform) {
    throw new OdinValidationError("platform is required");
  }
  if (!params.session_id) {
    throw new OdinValidationError("session_id is required");
  }
  if (!params.message) {
    throw new OdinValidationError("message is required");
  }

  const url = `${config.baseUrl}/api/v1/orchestrator/message`;
  const body = {
    user_id: params.user_id,
    platform: params.platform,
    session_id: params.session_id,
    message: params.message,
    images: params.images,
    skill_context: params.skill_context,
    thinking_level: params.thinking_level,
    model_preference: params.model_preference,
  };

  debugLog(config, "Sending request to Odin", {
    url,
    body: { ...body, images: body.images?.length },
  });

  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream, application/x-ndjson",
      },
      body: JSON.stringify(body),
    },
    config,
    {
      attempt: 1,
      maxRetries: config.maxRetries,
      delayMs: config.retryDelayMs,
    },
  );

  yield* parseStreamingResponse(response, config);
}

export { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_RETRIES };
