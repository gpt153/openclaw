import type { GatewayBrowserClient } from "../gateway";

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
    if (state.filters.category) params.append("category", state.filters.category);
    if (state.filters.priority) params.append("priority", state.filters.priority);
    if (state.filters.date_from) params.append("date_from", state.filters.date_from);
    if (state.filters.date_to) params.append("date_to", state.filters.date_to);
    params.append("limit", state.filters.limit || "50");

    const response = await fetch(`http://localhost:5100/api/emails/?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    state.emails = Array.isArray(data) ? data : [];
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
    const response = await fetch("http://localhost:5100/api/emails/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 20 }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    state.emails = Array.isArray(data.results) ? data.results : [];
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
    // Remove from current list
    state.emails = state.emails.filter((e) => e.id !== email.id);
    if (state.selectedEmail?.id === email.id) {
      state.selectedEmail = null;
    }
  } catch (err) {
    state.emailError = String(err);
    throw err;
  }
}
