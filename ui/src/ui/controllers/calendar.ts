export interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location?: string;
  attendees?: string[];
  description?: string;
  email_id?: string;
  source: "google" | "auto_created" | "manual";
  created_at: string;
  updated_at: string;
}

export interface ConflictingEvent {
  event_id: string;
  conflicts_with: string[];
  start_time: string;
  end_time: string;
}

export interface CalendarState {
  loading: boolean;
  error: string | null;
  events: CalendarEvent[];
  conflicts: ConflictingEvent[];
  view: "weekly" | "daily";
  currentDate: Date;
}

export async function fetchEvents(
  baseUrl: string,
  startDate: Date,
  endDate: Date,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    user_id: "samuel@153.se",
    limit: "1000",
  });

  const url = `${baseUrl}/api/v1/calendar/events?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`);
  }
  const events = await response.json();

  // Map Odin API format to UI format and filter by date range
  return events
    .filter((event: any) => {
      const eventStart = new Date(event.start_time);
      return eventStart >= startDate && eventStart <= endDate;
    })
    .map((event: any) => ({
      id: String(event.id),
      title: event.title,
      start_time: event.start_time,
      end_time: event.end_time,
      location: event.location,
      attendees: event.attendees || [],
      description: event.description,
      email_id: event.source_email_id ? String(event.source_email_id) : undefined,
      source: event.auto_created ? "auto_created" : "manual",
      created_at: event.created_at,
      updated_at: event.updated_at,
    }));
}

export async function fetchConflicts(
  baseUrl: string,
  startDate: Date,
  endDate: Date,
): Promise<ConflictingEvent[]> {
  const params = new URLSearchParams({
    user_id: "samuel@153.se",
    days_ahead: "7",
  });

  const url = `${baseUrl}/api/v1/calendar/conflicts?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch conflicts: ${response.statusText}`);
  }
  const conflicts = await response.json();

  // Map Odin API format to UI format
  return conflicts.map((conflict: any) => ({
    event_id: conflict.event1_id,
    conflicts_with: [conflict.event2_id],
    start_time: conflict.event1_start,
    end_time: conflict.event1_end,
  }));
}

export async function createEvent(
  baseUrl: string,
  event: Omit<CalendarEvent, "id" | "created_at" | "updated_at">,
): Promise<CalendarEvent> {
  const response = await fetch(`${baseUrl}/api/v1/calendar/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: "samuel@153.se",
      title: event.title,
      start_time: event.start_time,
      end_time: event.end_time,
      location: event.location,
      attendees: event.attendees,
      description: event.description,
      auto_created: false,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create event: ${response.statusText}`);
  }
  const data = await response.json();
  return {
    id: String(data.id),
    title: data.summary || data.title,
    start_time: data.start_time,
    end_time: data.end_time,
    location: data.location,
    attendees: data.attendees || [],
    description: data.description,
    email_id: data.source_email_id ? String(data.source_email_id) : undefined,
    source: data.auto_created ? "auto_created" : "manual",
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function updateEvent(
  baseUrl: string,
  eventId: string,
  updates: Partial<CalendarEvent>,
): Promise<CalendarEvent> {
  const response = await fetch(`${baseUrl}/api/v1/calendar/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: updates.title,
      start_time: updates.start_time,
      end_time: updates.end_time,
      location: updates.location,
      attendees: updates.attendees,
      description: updates.description,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update event: ${response.statusText}`);
  }
  const data = await response.json();
  return {
    id: String(data.id),
    title: data.summary || data.title,
    start_time: data.start_time,
    end_time: data.end_time,
    location: data.location,
    attendees: data.attendees || [],
    description: data.description,
    email_id: data.source_email_id ? String(data.source_email_id) : undefined,
    source: data.auto_created ? "auto_created" : "manual",
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function deleteEvent(
  baseUrl: string,
  eventId: string,
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/v1/calendar/events/${eventId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to delete event: ${response.statusText}`);
  }
}

export function getWeekBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function getDayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function eventsOverlap(
  event1: CalendarEvent,
  event2: CalendarEvent,
): boolean {
  const start1 = new Date(event1.start_time);
  const end1 = new Date(event1.end_time);
  const start2 = new Date(event2.start_time);
  const end2 = new Date(event2.end_time);

  return start1 < end2 && start2 < end1;
}
