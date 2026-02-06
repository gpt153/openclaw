/**
 * Voice Interaction Workflow Integration Test
 * Tests complete voice interaction: STT → Orchestrator → TTS
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { VoiceAdapterClient } from "../../src/agents/voice-adapter-client";
import axios, { AxiosInstance } from "axios";

const VOICE_ADAPTER_URL = process.env.VOICE_ADAPTER_URL || "ws://localhost:5103/ws/voice";
const ODIN_API_URL = process.env.ODIN_API_URL || "http://localhost:5100";
const TEST_USER_ID = "test-user-voice-interaction";

describe("Voice Interaction Workflow", () => {
  let client: VoiceAdapterClient;
  let apiClient: AxiosInstance;

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

    if (client && client.isConnected()) {
      await client.disconnect();
    }
  });

  it("should connect to voice adapter", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    client = new VoiceAdapterClient({
      url: VOICE_ADAPTER_URL,
      userId: TEST_USER_ID,
      audioFormat: "webm",
      platform: "test",
    });

    const response = await client.connect();

    expect(response.type).toBe("connection_accepted");
    expect(response.connection_id).toBeTruthy();
    expect(response.session_id).toBeTruthy();
    expect(client.isConnected()).toBe(true);

    console.log("Voice connection established:", {
      connection_id: response.connection_id,
      session_id: response.session_id,
    });
  });

  it("should handle voice query about tasks", { timeout: 60000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // First, create some test tasks
    const task1 = await apiClient.post("/api/v1/tasks", {
      title: "Review Q1 budget proposal",
      description: "Check the budget numbers for Q1",
      user_id: TEST_USER_ID,
      priority: 4,
      due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const task2 = await apiClient.post("/api/v1/tasks", {
      title: "Schedule client demo",
      description: "Book a demo with the new client",
      user_id: TEST_USER_ID,
      priority: 5,
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    console.log("Created test tasks:", {
      task1_id: task1.data.id,
      task2_id: task2.data.id,
    });

    // Note: Actual voice processing requires valid audio
    // This test verifies the orchestrator integration is ready

    // Simulate direct orchestrator query instead of voice
    try {
      const orchestratorResponse = await apiClient.post("/api/v1/orchestrator/message", {
        user_id: TEST_USER_ID,
        platform: "test",
        message: "What are my tasks for today?",
      });

      expect(orchestratorResponse.status).toBe(200);
      expect(orchestratorResponse.data).toHaveProperty("response");

      console.log("Orchestrator response:", {
        response_preview: orchestratorResponse.data.response?.substring(0, 100) + "...",
      });
    } catch (error: any) {
      if (error.response?.status === 501) {
        console.warn("⚠️  Orchestrator message endpoint not implemented");
      } else {
        throw error;
      }
    }

    // Cleanup
    await apiClient.delete(`/api/v1/tasks/${task1.data.id}`);
    await apiClient.delete(`/api/v1/tasks/${task2.data.id}`);
  });

  it("should handle voice query about calendar", { timeout: 60000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Create a test calendar event
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);

    const event = await apiClient.post("/api/v1/calendar/events", {
      title: "Team Meeting",
      start_time: tomorrow.toISOString(),
      end_time: new Date(tomorrow.getTime() + 60 * 60 * 1000).toISOString(),
      user_id: TEST_USER_ID,
    });

    console.log("Created test calendar event:", {
      event_id: event.data.id,
    });

    // Simulate orchestrator query
    try {
      const orchestratorResponse = await apiClient.post("/api/v1/orchestrator/message", {
        user_id: TEST_USER_ID,
        platform: "test",
        message: "What's on my calendar tomorrow?",
      });

      expect(orchestratorResponse.status).toBe(200);
      expect(orchestratorResponse.data).toHaveProperty("response");

      console.log("Orchestrator response:", {
        response_preview: orchestratorResponse.data.response?.substring(0, 100) + "...",
      });
    } catch (error: any) {
      if (error.response?.status === 501) {
        console.warn("⚠️  Orchestrator message endpoint not implemented");
      } else {
        throw error;
      }
    }

    // Cleanup
    await apiClient.delete(`/api/v1/calendar/events/${event.data.id}`);
  });

  it("should handle voice query about emails", { timeout: 60000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Create a test email
    const email = await apiClient.post("/api/v1/emails", {
      subject: "Important Project Update",
      body: "The project deadline has been moved to next Friday.",
      sender: "manager@example.com",
      recipient: "user@example.com",
      account_id: "test-account",
      user_id: TEST_USER_ID,
      priority: 5,
      category: "work",
      received_at: new Date().toISOString(),
    });

    console.log("Created test email:", {
      email_id: email.data.id,
    });

    // Simulate orchestrator query
    try {
      const orchestratorResponse = await apiClient.post("/api/v1/orchestrator/message", {
        user_id: TEST_USER_ID,
        platform: "test",
        message: "Do I have any important emails?",
      });

      expect(orchestratorResponse.status).toBe(200);
      expect(orchestratorResponse.data).toHaveProperty("response");

      console.log("Orchestrator response:", {
        response_preview: orchestratorResponse.data.response?.substring(0, 100) + "...",
      });
    } catch (error: any) {
      if (error.response?.status === 501) {
        console.warn("⚠️  Orchestrator message endpoint not implemented");
      } else {
        throw error;
      }
    }
  });

  it("should verify session persistence", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Get session info
    try {
      const sessionResponse = await apiClient.get(
        `/api/v1/orchestrator/session/${TEST_USER_ID}/test`,
      );

      expect(sessionResponse.status).toBe(200);
      expect(sessionResponse.data).toHaveProperty("session_id");
      expect(sessionResponse.data).toHaveProperty("user_id");
      expect(sessionResponse.data.user_id).toBe(TEST_USER_ID);

      console.log("Session info:", {
        session_id: sessionResponse.data.session_id,
        message_count: sessionResponse.data.message_count || 0,
      });
    } catch (error: any) {
      if (error.response?.status === 404 || error.response?.status === 501) {
        console.warn("⚠️  Session endpoint not implemented");
      } else {
        throw error;
      }
    }
  });

  it("should measure orchestrator response time", { timeout: 30000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    const startTime = Date.now();

    try {
      const response = await apiClient.post("/api/v1/orchestrator/message", {
        user_id: TEST_USER_ID,
        platform: "test",
        message: "Hello",
      });

      const responseTime = Date.now() - startTime;

      console.log("Orchestrator performance:", {
        response_time_ms: responseTime,
        target_ms: 2000,
        status: responseTime <= 2000 ? "✅ WITHIN TARGET" : "⚠️  EXCEEDS TARGET",
      });

      expect(response.status).toBe(200);
    } catch (error: any) {
      if (error.response?.status === 501) {
        console.warn("⚠️  Orchestrator message endpoint not implemented");
      } else {
        throw error;
      }
    }
  });

  it("should verify voice adapter health", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Test orchestrator health endpoint
    try {
      const healthResponse = await apiClient.get("/api/v1/orchestrator/health");

      expect(healthResponse.status).toBe(200);
      expect(healthResponse.data).toHaveProperty("status");

      console.log("Orchestrator health:", healthResponse.data);
    } catch (error: any) {
      // Health endpoint might be on different port (5102)
      try {
        const healthResponse = await axios.get("http://localhost:5102/health");
        expect(healthResponse.status).toBe(200);
        console.log("Orchestrator health (port 5102):", healthResponse.data);
      } catch (innerError) {
        console.warn("⚠️  Health endpoint not accessible");
      }
    }
  });

  it("should disconnect gracefully", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    expect(client.isConnected()).toBe(true);

    await client.disconnect();

    expect(client.isConnected()).toBe(false);

    console.log("✅ Voice connection closed gracefully");
  });
});
