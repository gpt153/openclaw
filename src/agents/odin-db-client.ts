/**
 * Odin Database Client
 *
 * PostgreSQL + pgvector client for semantic search and RAG operations.
 * Provides access to Odin's 28 tables including email embeddings, calendar events, family data.
 *
 * @module odin-db-client
 */

// ==============================================================================
// Configuration
// ==============================================================================

export interface OdinDbConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
}

const DEFAULT_CONFIG: Required<OdinDbConfig> = {
  host: process.env.ODIN_DB_HOST || "localhost",
  port: Number.parseInt(process.env.ODIN_DB_PORT || "5132"),
  database: process.env.ODIN_DB_NAME || "odin",
  user: process.env.ODIN_DB_USER || "odin",
  password: process.env.ODIN_DB_PASSWORD || "",
  ssl: process.env.ODIN_DB_SSL === "true",
};

// ==============================================================================
// Types
// ==============================================================================

export interface SemanticSearchParams {
  query_embedding: number[]; // 384-dim vector
  limit?: number;
  threshold?: number; // Cosine similarity threshold (0-1)
}

export interface EmailSearchResult {
  id: number;
  message_id: string;
  subject: string;
  sender: string;
  body_preview: string;
  similarity: number;
}

export interface CalendarSearchResult {
  id: number;
  summary: string;
  start_time: string;
  end_time: string;
  location: string | null;
  similarity: number;
}

// ==============================================================================
// Database Client (Stub for now - requires pg library)
// ==============================================================================

export class OdinDbClient {
  private readonly config: Required<OdinDbConfig>;

  constructor(userConfig?: OdinDbConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...userConfig,
    };
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    // Stub: Would use `pg` library to test connection
    // const client = new pg.Client(this.config);
    // await client.connect();
    // await client.end();
    return true;
  }

  /**
   * Semantic search in emails using pgvector
   * Target latency: <50ms
   */
  async searchEmails(params: SemanticSearchParams): Promise<EmailSearchResult[]> {
    // Stub: Would execute pgvector query
    // SELECT id, message_id, subject, sender, body_preview,
    //        1 - (embedding <=> $1::vector) AS similarity
    // FROM emails
    // WHERE 1 - (embedding <=> $1::vector) > $2
    // ORDER BY embedding <=> $1::vector
    // LIMIT $3
    return [];
  }

  /**
   * Semantic search in calendar events
   * Target latency: <50ms
   */
  async searchCalendarEvents(params: SemanticSearchParams): Promise<CalendarSearchResult[]> {
    // Stub: Would execute pgvector query on calendar_events table
    return [];
  }

  /**
   * Search school data (child-related)
   */
  async searchSchoolData(params: SemanticSearchParams): Promise<unknown[]> {
    // Stub: Would search school_data table with pgvector
    return [];
  }

  /**
   * Match child names/nicknames using entity recognition
   */
  async matchChildEntities(text: string): Promise<
    Array<{
      entity_type: string;
      entity_id: number;
      confidence: number;
    }>
  > {
    // Stub: Would query children and child_entities tables
    return [];
  }

  /**
   * List all tables (verify schema)
   */
  async listTables(): Promise<string[]> {
    // Stub: Would query information_schema.tables
    return [
      "emails",
      "email_embeddings",
      "calendar_events",
      "tasks",
      "children",
      "child_entities",
      "email_accounts",
      // ... 21 more tables
    ];
  }

  /**
   * Verify pgvector extension is installed
   */
  async verifyPgvector(): Promise<boolean> {
    // Stub: Would query pg_extension
    // SELECT * FROM pg_extension WHERE extname = 'vector'
    return true;
  }

  /**
   * Get table count
   */
  async getTableCount(): Promise<number> {
    const tables = await this.listTables();
    return tables.length;
  }
}

// ==============================================================================
// Exports
// ==============================================================================

export const DEFAULT_DB_CONFIG = DEFAULT_CONFIG;
