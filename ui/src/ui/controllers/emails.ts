import type { GatewayBrowserClient } from "../gateway";

/**
 * Map Odin API email format to UI Email format
 */
function mapOdinEmailToUI(odinEmail: any): Email {
  return {
    id: String(odinEmail.id),
    gmail_message_id: odinEmail.message_id || "",
    subject: odinEmail.subject || "",
    sender_email: odinEmail.sender || "",
    sender_name: null, // Not provided by Odin API
    received_at: odinEmail.received_at || new Date().toISOString(),
    snippet: odinEmail.summary || odinEmail.body?.substring(0, 200) || null,
    body_plain: odinEmail.body || null,
    body_html: null, // Not provided by Odin API
    category: odinEmail.category || null,
    priority: odinEmail.priority || null,
    labels: null,
    has_attachments: false, // Not provided by Odin API
    thread_id: null,
    in_reply_to: null,
    account_id: odinEmail.account_id || "",
    created_at: odinEmail.received_at || new Date().toISOString(),
    updated_at: odinEmail.received_at || new Date().toISOString(),
  };
}

export type EmailFilters = {
  category?: string;
  priority?: string;
  date_from?: string;
  date_to?: string;
  limit?: string;
};

export type Email = {
  id: string;
  gmail_message_id: string;
  subject: string;
  sender_email: string;
  sender_name: string | null;
  received_at: string;
  snippet: string | null;
  body_plain: string | null;
  body_html: string | null;
  category: string | null;
  priority: number | null;
  labels: string[] | null;
  has_attachments: boolean;
  thread_id: string | null;
  in_reply_to: string | null;
  account_id: string;
  created_at: string;
  updated_at: string;
};

export type EmailState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  emailsLoading: boolean;
  emails: Email[];
  selectedEmail: Email | null;
  emailError: string | null;
  searchQuery: string;
  filters: EmailFilters;
};

export async function loadEmails(state: EmailState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.emailsLoading) {
    return;
  }
  state.emailsLoading = true;
  state.emailError = null;
  try {
    const params = new URLSearchParams();
    // Add user_id (required by Odin API)
    params.append("user_id", "samuel");
    if (state.filters.category) params.append("category", state.filters.category);
    if (state.filters.priority) params.append("priority_min", state.filters.priority);
    if (state.filters.date_from) params.append("date_from", state.filters.date_from);
    if (state.filters.date_to) params.append("date_to", state.filters.date_to);
    params.append("limit", state.filters.limit || "50");

    const response = await fetch(`http://localhost:5100/api/v1/emails?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    // Odin API returns { emails: [...], total, limit, offset }
    // Filter out any null/undefined emails before mapping
    state.emails = Array.isArray(data.emails)
      ? data.emails.filter((e: any) => e != null).map(mapOdinEmailToUI)
      : [];
  } catch (err) {
    state.emailError = String(err);
    state.emails = [];
  } finally {
    state.emailsLoading = false;
  }
}

export async function searchEmails(state: EmailState, query: string) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.emailsLoading) {
    return;
  }
  state.emailsLoading = true;
  state.emailError = null;
  try {
    const response = await fetch("http://localhost:5100/api/v1/emails/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: "samuel", query, limit: 20 }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    // Odin API returns { emails: [...], total, query }
    // Filter out any null/undefined emails before mapping
    state.emails = Array.isArray(data.emails)
      ? data.emails.filter((e: any) => e != null).map(mapOdinEmailToUI)
      : [];
    state.searchQuery = query;
  } catch (err) {
    state.emailError = String(err);
    state.emails = [];
  } finally {
    state.emailsLoading = false;
  }
}

export async function createTaskFromEmail(state: EmailState, email: Email) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const response = await fetch("http://localhost:5100/api/emails/create-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_id: email.id }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (err) {
    state.emailError = String(err);
    throw err;
  }
}

export async function draftReply(state: EmailState, email: Email) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const response = await fetch("http://localhost:5100/api/emails/draft-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_id: email.id }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (err) {
    state.emailError = String(err);
    throw err;
  }
}

export async function archiveEmail(state: EmailState, email: Email) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const response = await fetch(`http://localhost:5100/api/emails/${email.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    // Remove from current list (with null safety)
    state.emails = (state.emails || []).filter((e) => e?.id !== email.id);
    if (state.selectedEmail?.id === email.id) {
      state.selectedEmail = null;
    }
  } catch (err) {
    state.emailError = String(err);
    throw err;
  }
}
