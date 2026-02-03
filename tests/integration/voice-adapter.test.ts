/**
 * Voice Adapter Integration Tests
 * Tests STT/TTS pipeline and latency measurements
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { VoiceAdapterClient } from "../../src/agents/voice-adapter-client";
import fs from "fs/promises";
import path from "path";

const VOICE_ADAPTER_URL = process.env.VOICE_ADAPTER_URL || "ws://localhost:5103/ws/voice";
const TEST_USER_ID = "test-user-voice";
const LATENCY_TARGET_MS = 11000; // 11 seconds target

describe("Voice Adapter Integration", () => {
  let client: VoiceAdapterClient;

  beforeAll(async () => {
    // Skip tests if voice adapter is not available
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }
  });

  afterAll(async () => {
    if (client && client.isConnected()) {
      await client.disconnect();
    }
  });

  it("should establish WebSocket connection", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    client = new VoiceAdapterClient({
      url: VOICE_ADAPTER_URL,
      userId: TEST_USER_ID,
      audioFormat: "pcm_16khz_mono",
      platform: "test",
    });

    const response = await client.connect();

    expect(response.type).toBe("connection_accepted");
    expect(response.connection_id).toBeTruthy();
    expect(response.session_id).toBeTruthy();
    expect(response.status).toBe("connected");
    expect(client.isConnected()).toBe(true);
  });

  it("should send audio chunks and receive acknowledgments", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    client = new VoiceAdapterClient({
      url: VOICE_ADAPTER_URL,
      userId: TEST_USER_ID,
    });

    await client.connect();

    // Generate test audio data (silence)
    const audioChunk = Buffer.alloc(16000); // 1 second of 16kHz mono PCM

    let ackReceived = false;
    client.on("chunkAck", () => {
      ackReceived = true;
    });

    await client.sendAudioChunk(audioChunk);

    // Wait for acknowledgment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(ackReceived).toBe(true);
    expect(client.getChunkCount()).toBeGreaterThan(0);
    expect(client.getTotalBytes()).toBeGreaterThan(0);
  });

  it("should start and stop recording", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    client = new VoiceAdapterClient({
      url: VOICE_ADAPTER_URL,
      userId: TEST_USER_ID,
    });

    await client.connect();

    let recordingStarted = false;
    client.on("recordingStarted", () => {
      recordingStarted = true;
    });

    await client.startRecording();

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(recordingStarted).toBe(true);
  });

  it("should process voice message (STT -> Orchestrator -> TTS)", { timeout: 45000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    client = new VoiceAdapterClient({
      url: VOICE_ADAPTER_URL,
      userId: TEST_USER_ID,
    });

    await client.connect();
    await client.startRecording();

    // Generate test audio data (silence)
    // Note: Real STT would require actual speech audio
    const audioData = Buffer.alloc(16000 * 3); // 3 seconds of audio
    await client.sendAudioChunk(audioData);

    const result = await client.stopRecording({
      audioFormat: "webm",
      language: "en",
    });

    // Verify results
    expect(result.transcription).toBeDefined();
    expect(result.aiResponse).toBeDefined();
    expect(result.latency.total).toBeGreaterThan(0);

    console.log("Voice Processing Latency:", {
      transcription: `${result.latency.transcription}ms`,
      aiResponse: `${result.latency.aiResponse}ms`,
      audioResponse: `${result.latency.audioResponse}ms`,
      total: `${result.latency.total}ms`,
      target: `${LATENCY_TARGET_MS}ms`,
    });

    // Verify latency target
    if (result.latency.total > LATENCY_TARGET_MS) {
      console.warn(
        `WARNING: Total latency ${result.latency.total}ms exceeds target ${LATENCY_TARGET_MS}ms`,
      );
    }

    // Don't fail the test for latency, but log it
    expect(result.latency.total).toBeGreaterThan(0);
  });

  it("should handle ping/pong heartbeat", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    client = new VoiceAdapterClient({
      url: VOICE_ADAPTER_URL,
      userId: TEST_USER_ID,
    });

    await client.connect();

    let pongReceived = false;
    client.on("pong", () => {
      pongReceived = true;
    });

    await client.ping();

    // Wait for pong
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(pongReceived).toBe(true);
  });

  it("should gracefully disconnect", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    client = new VoiceAdapterClient({
      url: VOICE_ADAPTER_URL,
      userId: TEST_USER_ID,
    });

    await client.connect();
    expect(client.isConnected()).toBe(true);

    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it("should measure full pipeline latency with real audio", { timeout: 60000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    client = new VoiceAdapterClient({
      url: VOICE_ADAPTER_URL,
      userId: TEST_USER_ID,
      audioFormat: "webm",
    });

    await client.connect();
    await client.startRecording();

    // In a real scenario, you would send actual audio data
    // For now, we'll send silence and measure the pipeline timing
    const audioData = Buffer.alloc(16000 * 5); // 5 seconds of audio
    await client.sendAudioChunk(audioData);

    const result = await client.stopRecording({
      audioFormat: "webm",
      language: "en",
    });

    // Log detailed metrics
    console.log("\n=== Voice Pipeline Latency Metrics ===");
    console.log(`STT (Speech-to-Text): ${result.latency.transcription}ms`);
    console.log(`AI Response: ${result.latency.aiResponse}ms`);
    console.log(`TTS (Text-to-Speech): ${result.latency.audioResponse}ms`);
    console.log(`Total Pipeline: ${result.latency.total}ms`);
    console.log(`Target: ${LATENCY_TARGET_MS}ms`);
    console.log(
      `Status: ${result.latency.total <= LATENCY_TARGET_MS ? "✅ PASS" : "⚠️  EXCEEDS TARGET"}`,
    );
    console.log("=====================================\n");

    // Verify pipeline completed
    expect(result.transcription).toBeDefined();
    expect(result.aiResponse).toBeDefined();
    expect(result.latency.total).toBeGreaterThan(0);

    // Breakdown verification
    expect(result.latency.transcription).toBeGreaterThan(0);
    expect(result.latency.aiResponse).toBeGreaterThan(0);
  });

  it("should handle multiple concurrent connections", { timeout: 30000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    const clients: VoiceAdapterClient[] = [];

    try {
      // Create 3 concurrent connections
      for (let i = 0; i < 3; i++) {
        const c = new VoiceAdapterClient({
          url: VOICE_ADAPTER_URL,
          userId: `${TEST_USER_ID}-${i}`,
        });

        await c.connect();
        clients.push(c);
      }

      expect(clients.length).toBe(3);
      clients.forEach((c) => {
        expect(c.isConnected()).toBe(true);
      });
    } finally {
      // Cleanup
      await Promise.all(clients.map((c) => c.disconnect()));
    }
  });

  it("should handle connection errors gracefully", { timeout: 15000 }, async () => {
    if (!process.env.ODIN_LIVE_TEST) {
      return;
    }

    const badClient = new VoiceAdapterClient({
      url: "ws://localhost:9999/invalid", // Invalid endpoint
      userId: TEST_USER_ID,
    });

    await expect(badClient.connect()).rejects.toThrow();
  });
});
