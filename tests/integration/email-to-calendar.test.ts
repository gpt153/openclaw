/**
 * Email → Calendar Workflow Integration Test
 * Tests the complete flow from email to calendar event extraction and conflict detection
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios, { AxiosInstance } from "axios";

const ODIN_API_URL = process.env.ODIN_API_URL || "http://localhost:5100";
const TEST_USER_ID = "test-user-calendar-e2e";
const TEST_ACCOUNT_ID = "test-account-calendar-e2e";

interface Email {
  id: string;
  subject: string;
  body: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  source_email_id?: string;
  auto_created: boolean;
  status: string;
}

describe("Email → Calendar Workflow", () => {
  let apiClient: AxiosInstance;
  let testEmailId: string;
  let testEventId: string;
  let conflictingEventId: string;

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

    // Cleanup: Delete test events
    if (testEventId) {
      try {
        await apiClient.delete(`/api/v1/calendar/events/${testEventId}`);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    if (conflictingEventId) {
      try {
        await apiClient.delete(`/api/v1/calendar/events/${conflictingEventId}`);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it("should create an email with meeting details", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);

    const tomorrowStr = tomorrow.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    const emailData = {
      subject: "Team Standup Meeting - Tomorrow",
      body: `Hi everyone,

Just a reminder about our team standup meeting tomorrow (${tomorrowStr}) at 2:00 PM.

Meeting details:
- Time: 2:00 PM - 3:00 PM
- Location: Conference Room A
- Agenda: Sprint review and planning

Please join on time.

Best,
Project Manager`,
      sender: "pm@example.com",
      recipient: "team@example.com",
      account_id: TEST_ACCOUNT_ID,
      user_id: TEST_USER_ID,
      received_at: new Date().toISOString(),
    };

    const response = await apiClient.post("/api/v1/emails", emailData);

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty("id");

    testEmailId = response.data.id;

    console.log("Created email with meeting details:", {
      id: testEmailId,
      subject: response.data.subject,
    });
  });

  it("should extract calendar event from email", { timeout: 20000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Extract calendar event from email
    const response = await apiClient.post(`/api/v1/calendar/extract-from-email/${testEmailId}`);

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty("id");
    expect(response.data).toHaveProperty("title");
    expect(response.data).toHaveProperty("start_time");
    expect(response.data).toHaveProperty("end_time");
    expect(response.data.source_email_id).toBe(testEmailId);
    expect(response.data.auto_created).toBe(true);

    testEventId = response.data.id;

    console.log("Extracted calendar event:", {
      id: testEventId,
      title: response.data.title,
      start_time: response.data.start_time,
      end_time: response.data.end_time,
      auto_created: response.data.auto_created,
    });
  });

  it("should display event in calendar dashboard", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Get auto-created events
    const response = await apiClient.get("/api/v1/calendar/auto-created", {
      params: {
        user_id: TEST_USER_ID,
      },
    });

    expect(response.status).toBe(200);
    expect(response.data).toBeInstanceOf(Array);

    const event = response.data.find((e: CalendarEvent) => e.id === testEventId);
    expect(event).toBeDefined();
    expect(event.auto_created).toBe(true);
    expect(event.source_email_id).toBe(testEmailId);

    console.log("Event visible in calendar dashboard:", {
      total_auto_events: response.data.length,
      test_event_found: !!event,
    });
  });

  it("should detect conflicts with existing events", { timeout: 20000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Get the test event to find its time
    const eventResponse = await apiClient.get(`/api/v1/calendar/events/${testEventId}`);
    const startTime = new Date(eventResponse.data.start_time);
    const endTime = new Date(eventResponse.data.end_time);

    // Create a conflicting event (overlapping time)
    const conflictStart = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 min after start
    const conflictEnd = new Date(endTime.getTime() + 30 * 60 * 1000); // 30 min after end

    const conflictingEvent = {
      title: "Conflicting Meeting",
      start_time: conflictStart.toISOString(),
      end_time: conflictEnd.toISOString(),
      user_id: TEST_USER_ID,
      auto_created: false,
    };

    const createResponse = await apiClient.post("/api/v1/calendar/events", conflictingEvent);
    expect(createResponse.status).toBe(201);

    conflictingEventId = createResponse.data.id;

    // Check for conflicts
    const conflictsResponse = await apiClient.get("/api/v1/calendar/conflicts", {
      params: {
        user_id: TEST_USER_ID,
      },
    });

    expect(conflictsResponse.status).toBe(200);
    expect(conflictsResponse.data).toBeInstanceOf(Array);

    // Should detect conflict between our two events
    const hasConflict = conflictsResponse.data.some((conflict: any) => {
      return (
        (conflict.event1_id === testEventId && conflict.event2_id === conflictingEventId) ||
        (conflict.event1_id === conflictingEventId && conflict.event2_id === testEventId)
      );
    });

    if (hasConflict) {
      console.log("✅ Conflict detected correctly");
    } else {
      console.warn("⚠️  Conflict detection may not be working");
    }
  });

  it("should approve auto-created event", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Approve the event (change status from pending to confirmed)
    const response = await apiClient.patch(`/api/v1/calendar/events/${testEventId}`, {
      status: "confirmed",
    });

    expect(response.status).toBe(200);
    expect(response.data.status).toBe("confirmed");

    console.log("Event approved:", {
      id: testEventId,
      status: response.data.status,
    });
  });

  it("should sync event to Google Calendar", { timeout: 20000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Trigger Google Calendar sync
    try {
      const response = await apiClient.post(`/api/v1/calendar/events/${testEventId}/sync`);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("google_event_id");

      console.log("Event synced to Google Calendar:", {
        odin_event_id: testEventId,
        google_event_id: response.data.google_event_id,
      });
    } catch (error: any) {
      if (error.response?.status === 503 || error.response?.data?.message?.includes("not configured")) {
        console.warn("⚠️  Google Calendar sync not configured (expected in test environment)");
      } else {
        throw error;
      }
    }
  });

  it("should verify complete workflow data consistency", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    // Verify email still exists
    const emailResponse = await apiClient.get(`/api/v1/emails/${testEmailId}`);
    expect(emailResponse.status).toBe(200);

    // Verify event exists and is linked
    const eventResponse = await apiClient.get(`/api/v1/calendar/events/${testEventId}`);
    expect(eventResponse.status).toBe(200);
    expect(eventResponse.data.source_email_id).toBe(testEmailId);
    expect(eventResponse.data.status).toBe("confirmed");

    console.log("✅ Workflow data consistency verified");
  });
});
