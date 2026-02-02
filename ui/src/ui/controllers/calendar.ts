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
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  });

  const url = `${baseUrl}/api/calendar/?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchConflicts(
  baseUrl: string,
  startDate: Date,
  endDate: Date,
): Promise<ConflictingEvent[]> {
  const params = new URLSearchParams({
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  });

  const url = `${baseUrl}/api/calendar/conflicts?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch conflicts: ${response.statusText}`);
  }
  return response.json();
}

export async function createEvent(
  baseUrl: string,
  event: Omit<CalendarEvent, "id" | "created_at" | "updated_at">,
): Promise<CalendarEvent> {
  const response = await fetch(`${baseUrl}/api/calendar/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!response.ok) {
    throw new Error(`Failed to create event: ${response.statusText}`);
  }
  return response.json();
}

export async function updateEvent(
  baseUrl: string,
  eventId: string,
  updates: Partial<CalendarEvent>,
): Promise<CalendarEvent> {
  const response = await fetch(`${baseUrl}/api/calendar/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw new Error(`Failed to update event: ${response.statusText}`);
  }
  return response.json();
}

export async function deleteEvent(
  baseUrl: string,
  eventId: string,
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/calendar/${eventId}`, {
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
