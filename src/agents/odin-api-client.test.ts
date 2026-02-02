/**
 * Tests for Odin API Client
 *
 * Comprehensive test suite for all API endpoints.
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from "vitest";
import {
  OdinApiClient,
  OdinApiError,
  OdinApiConnectionError,
  OdinApiTimeoutError,
  OdinApiServerError,
  OdinApiValidationError,
} from "./odin-api-client.js";

// ==============================================================================
// Test Configuration
// ==============================================================================

const TEST_CONFIG = {
  baseUrl: process.env.ODIN_API_URL || "http://localhost:5100",
  timeout: 10_000,
  maxRetries: 2,
  retryDelayMs: 100,
  debug: false,
};

const TEST_USER_ID = "test-user-openclaw";
const TEST_PLATFORM = "web";
const TEST_SESSION_ID = "test-session-123";

// ==============================================================================
// Helper Functions
// ==============================================================================

function skipIfOffline(): void {
  if (!process.env.ODIN_LIVE_TEST) {
    console.log("⏭️  Skipping live API test (set ODIN_LIVE_TEST=1 to run)");
  }
}

async function checkOdinHealth(client: OdinApiClient): Promise<boolean> {
  try {
    const health = await client.getHealth();
    return health.status === "healthy";
  } catch {
    return false;
  }
}

// ==============================================================================
// Test Suite
// ==============================================================================

describe("OdinApiClient", () => {
  let client: OdinApiClient;

  beforeEach(() => {
    client = new OdinApiClient(TEST_CONFIG);
  });

  describe("Initialization", () => {
    it("should create client with default config", () => {
      const defaultClient = new OdinApiClient();
      expect(defaultClient).toBeDefined();
    });

    it("should create client with custom config", () => {
      const customClient = new OdinApiClient({
        baseUrl: "http://custom:5100",
        timeout: 5000,
        debug: true,
      });
      expect(customClient).toBeDefined();
    });

    it("should use environment variable for base URL", () => {
      const originalEnv = process.env.ODIN_API_URL;
      process.env.ODIN_API_URL = "http://env-test:5100";

      const envClient = new OdinApiClient();
      expect(envClient).toBeDefined();

      // Restore
      if (originalEnv) {
        process.env.ODIN_API_URL = originalEnv;
      } else {
        delete process.env.ODIN_API_URL;
      }
    });
  });

  describe("Error Handling", () => {
    it("should create OdinApiError", () => {
      const error = new OdinApiError("Test error", 500, true);
      expect(error.message).toBe("Test error");
      expect(error.statusCode).toBe(500);
      expect(error.retryable).toBe(true);
      expect(error.name).toBe("OdinApiError");
    });

    it("should create OdinApiConnectionError", () => {
      const error = new OdinApiConnectionError("Connection failed");
      expect(error.message).toBe("Connection failed");
      expect(error.retryable).toBe(true);
      expect(error.name).toBe("OdinApiConnectionError");
    });

    it("should create OdinApiTimeoutError", () => {
      const error = new OdinApiTimeoutError("Request timed out");
      expect(error.message).toBe("Request timed out");
      expect(error.statusCode).toBe(408);
      expect(error.retryable).toBe(true);
      expect(error.name).toBe("OdinApiTimeoutError");
    });

    it("should create OdinApiServerError", () => {
      const error = new OdinApiServerError("Server error", 500);
      expect(error.message).toBe("Server error");
      expect(error.statusCode).toBe(500);
      expect(error.retryable).toBe(true);
      expect(error.name).toBe("OdinApiServerError");
    });

    it("should create OdinApiValidationError", () => {
      const error = new OdinApiValidationError("Invalid input");
      expect(error.message).toBe("Invalid input");
      expect(error.statusCode).toBe(400);
      expect(error.retryable).toBe(false);
      expect(error.name).toBe("OdinApiValidationError");
    });
  });

  describe("Health Check", () => {
    it("should get API health status", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const health = await client.getHealth();

      expect(health).toBeDefined();
      expect(health.status).toBe("healthy");
      expect(health.version).toBeDefined();
      expect(health.services).toBeDefined();
      expect(health.system).toBeDefined();
    });

    it("should get orchestrator health status", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const health = await client.getOrchestratorHealth();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
    });
  });

  describe("Email APIs", () => {
    beforeAll(async () => {
      if (process.env.ODIN_LIVE_TEST) {
        const isHealthy = await checkOdinHealth(client);
        if (!isHealthy) {
          console.warn("⚠️  Odin API not healthy, email tests may fail");
        }
      }
    });

    it("should list emails", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const emails = await client.listEmails({
        user_id: TEST_USER_ID,
        limit: 10,
      });

      expect(Array.isArray(emails)).toBe(true);
      expect(emails.length).toBeLessThanOrEqual(10);

      if (emails.length > 0) {
        const email = emails[0];
        expect(email.id).toBeDefined();
        expect(email.message_id).toBeDefined();
        expect(email.user_id).toBe(TEST_USER_ID);
        expect(email.sender).toBeDefined();
        expect(email.subject).toBeDefined();
        expect(email.category).toBeDefined();
        expect(email.priority).toBeGreaterThanOrEqual(1);
        expect(email.priority).toBeLessThanOrEqual(5);
      }
    });

    it("should list emails with category filter", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const emails = await client.listEmails({
        user_id: TEST_USER_ID,
        category: "work",
        limit: 10,
      });

      expect(Array.isArray(emails)).toBe(true);

      if (emails.length > 0) {
        emails.forEach((email) => {
          expect(email.category).toBe("work");
        });
      }
    });

    it("should list emails with priority filter", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const emails = await client.listEmails({
        user_id: TEST_USER_ID,
        priority_min: 4,
        limit: 10,
      });

      expect(Array.isArray(emails)).toBe(true);

      if (emails.length > 0) {
        emails.forEach((email) => {
          expect(email.priority).toBeGreaterThanOrEqual(4);
        });
      }
    });

    it("should search emails with semantic search", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const result = await client.searchEmails({
        query: "meeting",
        user_id: TEST_USER_ID,
        limit: 5,
        semantic: true,
      });

      expect(result).toBeDefined();
      expect(result.query).toBe("meeting");
      expect(result.semantic_used).toBe(true);
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it("should get email by ID", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      // First get list of emails
      const emails = await client.listEmails({
        user_id: TEST_USER_ID,
        limit: 1,
      });

      if (emails.length === 0) {
        console.log("⏭️  No emails to test getEmail");
        return;
      }

      const emailId = emails[0].id;
      const email = await client.getEmail(emailId);

      expect(email).toBeDefined();
      expect(email.id).toBe(emailId);
      expect(email.message_id).toBeDefined();
      expect(email.sender).toBeDefined();
    });

    it("should get unprocessed emails", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const emails = await client.getUnprocessedEmails(TEST_USER_ID);

      expect(Array.isArray(emails)).toBe(true);
    });
  });

  describe("Task APIs", () => {
    let createdTaskId: number | null = null;

    afterAll(async () => {
      // Cleanup: mark task as completed if created
      if (createdTaskId && process.env.ODIN_LIVE_TEST) {
        try {
          await client.completeTask(createdTaskId);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it("should create a task", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const task = await client.createTask({
        user_id: TEST_USER_ID,
        title: "Test task from OpenClaw API client",
        description: "This is a test task created during integration testing",
        priority: 3,
        tags: ["test", "openclaw"],
        source: "api-test",
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.user_id).toBe(TEST_USER_ID);
      expect(task.title).toBe("Test task from OpenClaw API client");
      expect(task.status).toBe("pending");
      expect(task.priority).toBe(3);
      expect(task.tags).toContain("test");
      expect(task.tags).toContain("openclaw");

      createdTaskId = task.id;
    });

    it("should list tasks", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const tasks = await client.listTasks({
        user_id: TEST_USER_ID,
        limit: 10,
      });

      expect(Array.isArray(tasks)).toBe(true);

      if (tasks.length > 0) {
        const task = tasks[0];
        expect(task.id).toBeDefined();
        expect(task.user_id).toBe(TEST_USER_ID);
        expect(task.title).toBeDefined();
        expect(task.status).toBeDefined();
      }
    });

    it("should list tasks with status filter", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const tasks = await client.listTasks({
        user_id: TEST_USER_ID,
        status: "pending",
        limit: 10,
      });

      expect(Array.isArray(tasks)).toBe(true);

      if (tasks.length > 0) {
        tasks.forEach((task) => {
          expect(task.status).toBe("pending");
        });
      }
    });

    it("should get task by ID", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      if (!createdTaskId) {
        console.log("⏭️  No task created to test getTask");
        return;
      }

      const task = await client.getTask(createdTaskId);

      expect(task).toBeDefined();
      expect(task.id).toBe(createdTaskId);
      expect(task.user_id).toBe(TEST_USER_ID);
    });

    it("should update task", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      if (!createdTaskId) {
        console.log("⏭️  No task created to test updateTask");
        return;
      }

      const updatedTask = await client.updateTask(createdTaskId, {
        status: "in_progress",
        priority: 4,
      });

      expect(updatedTask).toBeDefined();
      expect(updatedTask.id).toBe(createdTaskId);
      expect(updatedTask.status).toBe("in_progress");
      expect(updatedTask.priority).toBe(4);
    });

    it("should complete task", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      if (!createdTaskId) {
        console.log("⏭️  No task created to test completeTask");
        return;
      }

      const completedTask = await client.completeTask(createdTaskId);

      expect(completedTask).toBeDefined();
      expect(completedTask.id).toBe(createdTaskId);
      expect(completedTask.status).toBe("completed");
      expect(completedTask.completed_at).toBeDefined();
    });
  });

  describe("Calendar APIs", () => {
    it("should list auto-created calendar events", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const result = await client.getAutoCreatedEvents({
        user_id: TEST_USER_ID,
        limit: 10,
      });

      expect(result).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.events)).toBe(true);

      if (result.events.length > 0) {
        const event = result.events[0];
        expect(event.id).toBeDefined();
        expect(event.summary).toBeDefined();
      }
    });

    it("should extract calendar events from email", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      // First get an email
      const emails = await client.listEmails({
        user_id: TEST_USER_ID,
        limit: 1,
      });

      if (emails.length === 0) {
        console.log("⏭️  No emails to test extractCalendarEvents");
        return;
      }

      const result = await client.extractCalendarEvents({
        email_id: emails[0].id,
        user_id: TEST_USER_ID,
        auto_create: false,
      });

      expect(result).toBeDefined();
      expect(result.email_id).toBe(emails[0].id);
      expect(result.events_found).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.events)).toBe(true);
    });
  });

  describe("Family APIs", () => {
    it("should recognize family entities", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const result = await client.recognizeFamilyEntities({
        text: "Emma has a dental appointment on Monday",
        context_type: "email",
        user_id: TEST_USER_ID,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.entities)).toBe(true);

      if (result.entities.length > 0) {
        const entity = result.entities[0];
        expect(entity.entity_type).toBeDefined();
        expect(entity.entity_id).toBeDefined();
        expect(entity.confidence).toBeGreaterThanOrEqual(0);
        expect(entity.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("should search family data", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const result = await client.searchFamily({
        query: "dental",
        user_id: TEST_USER_ID,
        limit: 5,
      });

      expect(result).toBeDefined();
    });
  });

  describe("Orchestrator APIs", () => {
    it("should send message to orchestrator", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const result = await client.sendMessage({
        user_id: TEST_USER_ID,
        platform: TEST_PLATFORM,
        session_id: TEST_SESSION_ID,
        message: "Test message from API client",
        thinking_level: "low",
        model_preference: "haiku",
      });

      expect(result).toBeDefined();
    });

    it("should get orchestrator metrics", async () => {
      if (!process.env.ODIN_LIVE_TEST) {
        skipIfOffline();
        return;
      }

      const metrics = await client.getOrchestratorMetrics();

      expect(metrics).toBeDefined();
    });
  });

  describe("Retry Logic", () => {
    it("should retry on connection error", async () => {
      const failingClient = new OdinApiClient({
        baseUrl: "http://invalid-host-that-does-not-exist:9999",
        timeout: 1000,
        maxRetries: 2,
        retryDelayMs: 100,
      });

      await expect(failingClient.getHealth()).rejects.toThrow(OdinApiConnectionError);
    });

    it("should timeout on slow response", async () => {
      const slowClient = new OdinApiClient({
        ...TEST_CONFIG,
        timeout: 1, // 1ms timeout (will fail immediately)
      });

      await expect(slowClient.getHealth()).rejects.toThrow();
    });
  });
});
