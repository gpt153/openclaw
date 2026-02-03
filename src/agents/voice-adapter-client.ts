/**
 * Voice Adapter WebSocket Client
 * Connects to Odin Voice Adapter for STT/TTS pipeline testing
 */

import { EventEmitter } from "events";
import WebSocket from "ws";

export interface VoiceAdapterConfig {
  url: string;
  userId: string;
  sessionId?: string;
  audioFormat?: string;
  platform?: string;
  sampleRate?: number;
  channels?: number;
}

export interface VoiceConnectionResponse {
  type: "connection_accepted";
  connection_id: string;
  session_id: string;
  status: string;
  message: string;
  timestamp: string;
}

export interface ChunkAckResponse {
  type: "chunk_ack";
  chunk_id: string;
  size_bytes: number;
  timestamp: string;
}

export interface TranscriptionResponse {
  type: "transcription";
  text: string;
  timestamp: string;
}

export interface AIResponse {
  type: "ai_response";
  text: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface AudioResponse {
  type: "audio_response";
  audio: string; // base64 encoded audio
  format: string;
  timestamp: string;
}

export interface ErrorResponse {
  type: "error";
  error_type: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export type VoiceAdapterMessage =
  | VoiceConnectionResponse
  | ChunkAckResponse
  | TranscriptionResponse
  | AIResponse
  | AudioResponse
  | ErrorResponse
  | { type: "ping" | "pong" | "recording_started"; timestamp: string }
  | { type: "connected"; sessionId: string; message: string }
  | { type: "auth_success"; userId: string }
  | { type: "claude_response"; text: string } // Orchestrator format
  | { type: "error"; message: string }; // Orchestrator error format

export interface VoiceProcessingResult {
  transcription: string;
  aiResponse: string;
  audioResponse?: Buffer;
  metadata?: Record<string, unknown>;
  latency: {
    transcription: number; // ms from start_recording to transcription
    aiResponse: number; // ms from transcription to ai_response
    audioResponse: number; // ms from ai_response to audio_response
    total: number; // ms total pipeline time
  };
}

export class VoiceAdapterClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Required<VoiceAdapterConfig>;
  private connectionId: string | null = null;
  private recordingStartTime: number | null = null;
  private transcriptionTime: number | null = null;
  private aiResponseTime: number | null = null;
  private audioChunks: Buffer[] = [];

  constructor(config: VoiceAdapterConfig) {
    super();
    this.config = {
      url: config.url,
      userId: config.userId,
      sessionId: config.sessionId || null!,
      audioFormat: config.audioFormat || "pcm_16khz_mono",
      platform: config.platform || "web",
      sampleRate: config.sampleRate || 16000,
      channels: config.channels || 1,
    };
  }

  /**
   * Connect to voice adapter WebSocket
   */
  async connect(): Promise<VoiceConnectionResponse> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.url);

      let connectedMessage: any = null;
      let authSuccessReceived = false;

      this.ws.on("open", () => {
        this.emit("connected");

        // Send auth message after connection
        this.sendControlMessage({
          type: "auth",
          userId: this.config.userId,
        }).catch((error) => {
          reject(error);
        });
      });

      this.ws.on("message", (data: WebSocket.RawData) => {
        try {
          const message: VoiceAdapterMessage = JSON.parse(data.toString());
          this.handleMessage(message);

          // Handle initial connection message
          if (message.type === "connected") {
            connectedMessage = message;
            this.connectionId = (message as any).sessionId;
          }

          // Handle auth success
          if (message.type === "auth_success") {
            authSuccessReceived = true;
            // Resolve with connection response
            resolve({
              type: "connection_accepted",
              connection_id: this.connectionId!,
              session_id: this.connectionId!,
              status: "connected",
              message: connectedMessage?.message || "Connected",
              timestamp: new Date().toISOString(),
            });
          }

          // Fallback for old protocol
          if (message.type === "connection_accepted") {
            this.connectionId = message.connection_id;
            resolve(message);
          }
        } catch (error) {
          this.emit("error", error);
        }
      });

      this.ws.on("error", (error) => {
        this.emit("error", error);
        reject(error);
      });

      this.ws.on("close", (code, reason) => {
        this.emit("disconnected", { code, reason: reason.toString() });
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!authSuccessReceived && (!connectedMessage || this.ws?.readyState !== WebSocket.OPEN)) {
          reject(new Error("Connection timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Send audio chunk to voice adapter
   */
  async sendAudioChunk(audioData: Buffer): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    this.ws.send(audioData);
    this.audioChunks.push(audioData);
  }

  /**
   * Start recording (accumulate audio for STT processing)
   */
  async startRecording(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    this.recordingStartTime = Date.now();
    this.transcriptionTime = null;
    this.aiResponseTime = null;
    this.audioChunks = [];

    await this.sendControlMessage({ type: "start_recording" });
  }

  /**
   * Stop recording and trigger voice processing (STT -> Orchestrator -> TTS)
   */
  async stopRecording(options?: {
    audioFormat?: string;
    language?: string;
  }): Promise<VoiceProcessingResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    return new Promise((resolve, reject) => {
      let transcription = "";
      let aiResponse = "";
      let audioResponse: Buffer | undefined;
      let metadata: Record<string, unknown> | undefined;

      const handleComplete = () => {
        if (!this.recordingStartTime) {
          reject(new Error("Recording was not started"));
          return;
        }

        const now = Date.now();
        const latency = {
          transcription: this.transcriptionTime
            ? this.transcriptionTime - this.recordingStartTime
            : 0,
          aiResponse:
            this.aiResponseTime && this.transcriptionTime
              ? this.aiResponseTime - this.transcriptionTime
              : 0,
          audioResponse: this.aiResponseTime ? now - this.aiResponseTime : 0,
          total: now - this.recordingStartTime,
        };

        resolve({
          transcription,
          aiResponse,
          audioResponse,
          metadata,
          latency,
        });

        // Cleanup listeners
        this.removeListener("transcription", handleTranscription);
        this.removeListener("aiResponse", handleAIResponse);
        this.removeListener("audioResponse", handleAudioResponse);
        this.removeListener("error", handleError);
      };

      const handleTranscription = (response: TranscriptionResponse) => {
        transcription = response.text;
        this.transcriptionTime = Date.now();
      };

      const handleAIResponse = (response: AIResponse) => {
        aiResponse = response.text;
        metadata = response.metadata;
        this.aiResponseTime = Date.now();

        // If no audio response expected, complete now
        // (some configurations might skip TTS)
        setTimeout(() => {
          if (!audioResponse) {
            handleComplete();
          }
        }, 2000); // Wait 2 seconds for audio response
      };

      const handleAudioResponse = (response: AudioResponse) => {
        audioResponse = Buffer.from(response.audio, "base64");
        handleComplete();
      };

      const handleError = (error: ErrorResponse) => {
        reject(new Error(`${error.error_type}: ${error.message}`));
      };

      // Register event listeners
      this.once("transcription", handleTranscription);
      this.once("aiResponse", handleAIResponse);
      this.once("audioResponse", handleAudioResponse);
      this.once("error", handleError);

      // Send stop recording message
      this.sendControlMessage({
        type: "stop_recording",
        audio_format: options?.audioFormat || "webm",
        language: options?.language || "en",
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        reject(new Error("Voice processing timeout (30s)"));
      }, 30000);
    });
  }

  /**
   * Send ping message
   */
  async ping(): Promise<void> {
    await this.sendControlMessage({ type: "ping" });
  }

  /**
   * Send control message
   */
  private async sendControlMessage(message: Record<string, unknown>): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: VoiceAdapterMessage): void {
    this.emit("message", message);

    switch (message.type) {
      case "connected":
        this.emit("connected", message);
        break;
      case "auth_success":
        this.emit("authSuccess", message);
        break;
      case "connection_accepted":
        this.emit("connectionAccepted", message);
        break;
      case "chunk_ack":
        this.emit("chunkAck", message);
        break;
      case "transcription":
        this.emit("transcription", message);
        break;
      case "ai_response":
        this.emit("aiResponse", message);
        break;
      case "claude_response":
        // Orchestrator uses 'claude_response' instead of 'ai_response'
        // Emit as 'aiResponse' for compatibility
        this.emit("aiResponse", {
          type: "ai_response",
          text: (message as any).text,
          metadata: {},
          timestamp: new Date().toISOString(),
        });
        break;
      case "audio_response":
        this.emit("audioResponse", message);
        break;
      case "error":
        // Handle both error formats
        if ("error_type" in message) {
          // Standard format
          this.emit("error", message);
        } else {
          // Orchestrator format (simplified)
          this.emit("error", {
            type: "error",
            error_type: "unknown",
            message: (message as any).message || "Unknown error",
            details: {},
            timestamp: new Date().toISOString(),
          });
        }
        break;
      case "ping":
        // Respond to ping with pong
        this.sendControlMessage({ type: "pong" }).catch(() => {});
        break;
      case "pong":
        this.emit("pong");
        break;
      case "recording_started":
        this.emit("recordingStarted");
        break;
    }
  }

  /**
   * Disconnect from voice adapter
   */
  async disconnect(): Promise<void> {
    if (!this.ws) return;

    return new Promise((resolve) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendControlMessage({ type: "stop" }).catch(() => {});

        this.ws.once("close", () => {
          this.ws = null;
          resolve();
        });

        // Force close after 2 seconds
        setTimeout(() => {
          if (this.ws) {
            this.ws.close();
            this.ws = null;
          }
          resolve();
        }, 2000);
      } else {
        this.ws = null;
        resolve();
      }
    });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection ID
   */
  getConnectionId(): string | null {
    return this.connectionId;
  }

  /**
   * Get total audio chunks sent
   */
  getChunkCount(): number {
    return this.audioChunks.length;
  }

  /**
   * Get total audio bytes sent
   */
  getTotalBytes(): number {
    return this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  }
}
