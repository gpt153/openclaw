/**
 * Email → Task Workflow Integration Test
 * Tests the complete flow from email intelligence to task creation
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios, { AxiosInstance } from "axios";

const ODIN_API_URL = process.env.ODIN_API_URL || "http://localhost:5100";
const TEST_USER_ID = "test-user-e2e";
const TEST_ACCOUNT_ID = "test-account-e2e";

interface Email {
  id: string;
  subject: string;
  body: string;
  priority: number;
  category: string;
  action_items?: string[];
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: number;
  source_email_id?: string;
  status: string;
}

describe("Email → Task Workflow", () => {
  let apiClient: AxiosInstance;
  let testEmailId: string;
  let testTaskId: string;

  beforeAll(async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    apiClient = axios.create({
      baseURL: ODIN_API_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });
  });

  afterAll(async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Cleanup: Delete test task
    if (testTaskId) {
      try {
        await apiClient.delete(`/api/v1/tasks/${testTaskId}`);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it("should create an email with action items", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Create a test email with action items
    const emailData = {
      subject: "Project Meeting Follow-up - Action Items",
      body: `Hi team,

Following up on our meeting today. Here are the action items:

1. Review the Q1 budget proposal by Friday
2. Schedule a demo with the client next week
3. Update the project timeline document

Please confirm receipt.

Best regards,
Test Manager`,
      sender: "manager@example.com",
      recipient: "team@example.com",
      account_id: TEST_ACCOUNT_ID,
      user_id: TEST_USER_ID,
      received_at: new Date().toISOString(),
    };

    const response = await apiClient.post("/api/v1/emails", emailData);

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty("id");
    expect(response.data).toHaveProperty("subject");
    expect(response.data).toHaveProperty("priority");
    expect(response.data).toHaveProperty("category");

    testEmailId = response.data.id;

    console.log("Created email:", {
      id: testEmailId,
      subject: response.data.subject,
      priority: response.data.priority,
      category: response.data.category,
    });
  });

  it("should process email and extract action items", { timeout: 20000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Wait for email processing to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get email with action items
    const response = await apiClient.get(`/api/v1/emails/${testEmailId}`);

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty("action_items");
    expect(response.data.action_items).toBeDefined();

    if (response.data.action_items && response.data.action_items.length > 0) {
      console.log("Extracted action items:", response.data.action_items);
    } else {
      console.warn("No action items extracted (intelligence may not be configured)");
    }
  });

  it("should create a task from email", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Create task from email
    const taskData = {
      source_email_id: testEmailId,
      user_id: TEST_USER_ID,
    };

    const response = await apiClient.post("/api/v1/tasks/from-email", taskData);

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty("id");
    expect(response.data).toHaveProperty("title");
    expect(response.data).toHaveProperty("description");
    expect(response.data).toHaveProperty("priority");
    expect(response.data.source_email_id).toBe(testEmailId);

    testTaskId = response.data.id;

    console.log("Created task from email:", {
      id: testTaskId,
      title: response.data.title,
      priority: response.data.priority,
      source_email_id: response.data.source_email_id,
    });
  });

  it("should inherit priority from email", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Get the original email
    const emailResponse = await apiClient.get(`/api/v1/emails/${testEmailId}`);
    const emailPriority = emailResponse.data.priority;

    // Get the task
    const taskResponse = await apiClient.get(`/api/v1/tasks/${testTaskId}`);
    const taskPriority = taskResponse.data.priority;

    // Task should inherit or be close to email priority
    expect(taskPriority).toBeGreaterThanOrEqual(emailPriority - 1);
    expect(taskPriority).toBeLessThanOrEqual(emailPriority + 1);

    console.log("Priority inheritance:", {
      email_priority: emailPriority,
      task_priority: taskPriority,
    });
  });

  it("should link task to email", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Get tasks linked to email
    const response = await apiClient.get(`/api/v1/tasks/by-email/${testEmailId}`);

    expect(response.status).toBe(200);
    expect(response.data).toBeInstanceOf(Array);
    expect(response.data.length).toBeGreaterThan(0);

    const linkedTask = response.data.find((t: Task) => t.id === testTaskId);
    expect(linkedTask).toBeDefined();

    console.log("Linked tasks:", response.data.length);
  });

  it("should display task in task dashboard", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Get all tasks for user
    const response = await apiClient.get("/api/v1/tasks", {
      params: {
        user_id: TEST_USER_ID,
        status: "pending",
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toBeInstanceOf(Array);

    const task = response.data.find((t: Task) => t.id === testTaskId);
    expect(task).toBeDefined();
    expect(task.source_email_id).toBe(testEmailId);

    console.log("Task visible in dashboard:", {
      total_tasks: response.data.length,
      test_task_found: !!task,
    });
  });

  it("should mark task as complete", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Complete the task
    const response = await apiClient.post(`/api/v1/tasks/${testTaskId}/complete`);

    expect(response.status).toBe(200);
    expect(response.data.status).toBe("completed");

    console.log("Task marked complete:", {
      id: testTaskId,
      status: response.data.status,
    });
  });

  it("should verify complete workflow data consistency", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Verify email still exists
    const emailResponse = await apiClient.get(`/api/v1/emails/${testEmailId}`);
    expect(emailResponse.status).toBe(200);

    // Verify task exists and is linked
    const taskResponse = await apiClient.get(`/api/v1/tasks/${testTaskId}`);
    expect(taskResponse.status).toBe(200);
    expect(taskResponse.data.source_email_id).toBe(testEmailId);
    expect(taskResponse.data.status).toBe("completed");

    // Verify linkage in both directions
    const linkedTasksResponse = await apiClient.get(`/api/v1/tasks/by-email/${testEmailId}`);
    expect(linkedTasksResponse.data.some((t: Task) => t.id === testTaskId)).toBe(true);

    console.log("✅ Workflow data consistency verified");
  });
});
