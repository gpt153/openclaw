import { html, nothing } from "lit";
import type { CalendarEvent, ConflictingEvent } from "../controllers/calendar";

export interface CalendarViewProps {
  loading: boolean;
  error: string | null;
  events: CalendarEvent[];
  conflicts: ConflictingEvent[];
  view: "weekly" | "daily";
  currentDate: Date;
  selectedEvent: CalendarEvent | null;
  onViewChange: (view: "weekly" | "daily") => void;
  onDateChange: (date: Date) => void;
  onEventSelect: (event: CalendarEvent | null) => void;
  onEventUpdate: (eventId: string, updates: Partial<CalendarEvent>) => void;
  onEventDelete: (eventId: string) => void;
  onRefresh: () => void;
}

export function renderCalendar(props: CalendarViewProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">Calendar</div>
          <div class="card-sub">View and manage your schedule</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn" @click=${() => props.onRefresh()}>
            Refresh
          </button>
          <div class="btn-group">
            <button
              class="btn ${props.view === "weekly" ? "active" : ""}"
              @click=${() => props.onViewChange("weekly")}
            >
              Weekly
            </button>
            <button
              class="btn ${props.view === "daily" ? "active" : ""}"
              @click=${() => props.onViewChange("daily")}
            >
              Daily
            </button>
          </div>
        </div>
      </div>

      ${renderDateNavigation(props)}

      ${
        props.conflicts.length > 0
          ? html`
            <div class="callout danger" style="margin-top: 12px;">
              <strong>⚠️ ${props.conflicts.length} Scheduling Conflicts Detected</strong>
              <div style="margin-top: 8px;">
                ${props.conflicts.map((conflict) => {
                  const event = props.events.find((e) => e.id === conflict.event_id);
                  return html`
                    <div>• ${event?.title ?? "Unknown event"} overlaps with ${conflict.conflicts_with.length} other event(s)</div>
                  `;
                })}
              </div>
            </div>
          `
          : nothing
      }

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${props.error}
          </div>`
          : nothing
      }

      ${
        props.loading
          ? html`<div class="muted" style="margin-top: 20px; text-align: center;">
            Loading events...
          </div>`
          : props.view === "weekly"
            ? renderWeeklyView(props)
            : renderDailyView(props)
      }
    </section>

    ${props.selectedEvent ? renderEventModal(props) : nothing}
  `;
}

function renderDateNavigation(props: CalendarViewProps) {
  const dateStr = props.view === "weekly"
    ? formatWeekRange(props.currentDate)
    : props.currentDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  return html`
    <div class="row" style="justify-content: space-between; align-items: center; margin-top: 16px;">
      <button
        class="btn"
        @click=${() => {
          const newDate = new Date(props.currentDate);
          if (props.view === "weekly") {
            newDate.setDate(newDate.getDate() - 7);
          } else {
            newDate.setDate(newDate.getDate() - 1);
          }
          props.onDateChange(newDate);
        }}
      >
        ←
      </button>
      <div class="date-display">${dateStr}</div>
      <button
        class="btn"
        @click=${() => {
          const newDate = new Date(props.currentDate);
          if (props.view === "weekly") {
            newDate.setDate(newDate.getDate() + 7);
          } else {
            newDate.setDate(newDate.getDate() + 1);
          }
          props.onDateChange(newDate);
        }}
      >
        →
      </button>
    </div>
  `;
}

function renderWeeklyView(props: CalendarViewProps) {
  const weekStart = getWeekStart(props.currentDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });

  return html`
    <div class="calendar-weekly" style="margin-top: 20px;">
      <div class="calendar-header">
        ${days.map((day) => html`
          <div class="calendar-day-header">
            <div class="day-name">${day.toLocaleDateString("en-US", { weekday: "short" })}</div>
            <div class="day-date">${day.getDate()}</div>
          </div>
        `)}
      </div>
      <div class="calendar-grid">
        ${days.map((day) => renderDayColumn(day, props))}
      </div>
    </div>
  `;
}

function renderDayColumn(day: Date, props: CalendarViewProps) {
  const dayEvents = props.events.filter((event) => {
    const eventDate = new Date(event.start_time);
    return isSameDay(eventDate, day);
  });

  const conflictIds = new Set(
    props.conflicts.flatMap((c) => [c.event_id, ...c.conflicts_with]),
  );

  return html`
    <div class="calendar-day-column">
      ${
        dayEvents.length === 0
          ? html`<div class="muted" style="padding: 8px; text-align: center;">
            No events
          </div>`
          : dayEvents.map((event) => {
              const hasConflict = conflictIds.has(event.id);
              return renderEventCard(event, hasConflict, props);
            })
      }
    </div>
  `;
}

function renderEventCard(event: CalendarEvent, hasConflict: boolean, props: CalendarViewProps) {
  const startTime = new Date(event.start_time).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = new Date(event.end_time).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const sourceClass = event.source === "google"
    ? "google"
    : event.source === "auto_created"
      ? "auto"
      : "manual";

  return html`
    <div
      class="event-card ${sourceClass} ${hasConflict ? "conflict" : ""}"
      @click=${() => props.onEventSelect(event)}
    >
      ${hasConflict ? html`<span class="conflict-icon" title="Scheduling conflict">⚠️</span>` : nothing}
      <div class="event-time">${startTime} - ${endTime}</div>
      <div class="event-title">${event.title}</div>
      ${event.location ? html`<div class="event-location">📍 ${event.location}</div>` : nothing}
      ${event.email_id ? html`<div class="event-email-icon" title="Auto-created from email">📧</div>` : nothing}
    </div>
  `;
}

function renderDailyView(props: CalendarViewProps) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dayEvents = props.events.filter((event) => {
    const eventDate = new Date(event.start_time);
    return isSameDay(eventDate, props.currentDate);
  });

  const conflictIds = new Set(
    props.conflicts.flatMap((c) => [c.event_id, ...c.conflicts_with]),
  );

  const now = new Date();
  const currentHour = now.getHours();
  const showCurrentTime = isSameDay(now, props.currentDate);

  return html`
    <div class="calendar-daily" style="margin-top: 20px; position: relative;">
      ${hours.map((hour) => {
        const hourEvents = dayEvents.filter((event) => {
          const eventHour = new Date(event.start_time).getHours();
          return eventHour === hour;
        });

        const isCurrentHour = showCurrentTime && hour === currentHour;

        return html`
          <div class="calendar-hour-slot ${isCurrentHour ? "current" : ""}">
            <div class="hour-label">
              ${formatHour(hour)}
              ${isCurrentHour ? html`<span class="current-time-indicator">•</span>` : nothing}
            </div>
            <div class="hour-events">
              ${
                hourEvents.length === 0
                  ? html`<div class="hour-empty"></div>`
                  : hourEvents.map((event) => {
                      const hasConflict = conflictIds.has(event.id);
                      return renderDailyEventCard(event, hasConflict, props);
                    })
              }
            </div>
          </div>
        `;
      })}
    </div>
  `;
}

function renderDailyEventCard(event: CalendarEvent, hasConflict: boolean, props: CalendarViewProps) {
  const startTime = new Date(event.start_time).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = new Date(event.end_time).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const sourceClass = event.source === "google"
    ? "google"
    : event.source === "auto_created"
      ? "auto"
      : "manual";

  return html`
    <div
      class="event-card-daily ${sourceClass} ${hasConflict ? "conflict" : ""}"
      @click=${() => props.onEventSelect(event)}
    >
      ${hasConflict ? html`<span class="conflict-icon">⚠️</span>` : nothing}
      <div class="event-time-daily">${startTime} - ${endTime}</div>
      <div class="event-title-daily">${event.title}</div>
      ${event.location ? html`<div class="event-location-daily">📍 ${event.location}</div>` : nothing}
      ${event.attendees && event.attendees.length > 0 ? html`
        <div class="event-attendees-daily">
          👥 ${event.attendees.length} attendee${event.attendees.length !== 1 ? "s" : ""}
        </div>
      ` : nothing}
      ${event.email_id ? html`<span class="event-email-icon">📧</span>` : nothing}
    </div>
  `;
}

function renderEventModal(props: CalendarViewProps) {
  if (!props.selectedEvent) {
    return nothing;
  }

  const event = props.selectedEvent;
  const startTime = new Date(event.start_time).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = new Date(event.end_time).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const sourceLabel = event.source === "google"
    ? "Google Calendar"
    : event.source === "auto_created"
      ? "Auto-created"
      : "Manual";

  return html`
    <div class="modal-overlay" @click=${() => props.onEventSelect(null)}>
      <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>${event.title}</h2>
          <button class="btn-close" @click=${() => props.onEventSelect(null)}>×</button>
        </div>
        <div class="modal-body">
          <div class="event-details">
            <div class="detail-row">
              <strong>Time:</strong>
              <span>${startTime} — ${endTime}</span>
            </div>
            ${
              event.location
                ? html`
                  <div class="detail-row">
                    <strong>Location:</strong>
                    <span>${event.location}</span>
                  </div>
                `
                : nothing
            }
            ${
              event.attendees && event.attendees.length > 0
                ? html`
                  <div class="detail-row">
                    <strong>Attendees:</strong>
                    <div style="margin-top: 4px;">
                      ${event.attendees.map((attendee) => html`<div>• ${attendee}</div>`)}
                    </div>
                  </div>
                `
                : nothing
            }
            ${
              event.description
                ? html`
                  <div class="detail-row">
                    <strong>Description:</strong>
                    <div style="margin-top: 4px; white-space: pre-wrap;">
                      ${event.description}
                    </div>
                  </div>
                `
                : nothing
            }
            <div class="detail-row">
              <strong>Source:</strong>
              <span>${sourceLabel}</span>
            </div>
            ${
              event.email_id
                ? html`
                  <div class="detail-row">
                    <strong>Linked Email:</strong>
                    <span>📧 ${event.email_id}</span>
                  </div>
                `
                : nothing
            }
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" @click=${() => props.onEventSelect(null)}>
            Close
          </button>
          ${
            event.source !== "google"
              ? html`
                <button
                  class="btn danger"
                  @click=${() => {
                    props.onEventDelete(event.id);
                    props.onEventSelect(null);
                  }}
                >
                  Delete Event
                </button>
              `
              : nothing
          }
        </div>
      </div>
    </div>
  `;
}

function getWeekStart(date: Date): Date {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function formatWeekRange(date: Date): string {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return `${startStr} - ${endStr}`;
}

function formatHour(hour: number): string {
  if (hour === 0) {
    return "12 AM";
  }
  if (hour < 12) {
    return `${hour} AM`;
  }
  if (hour === 12) {
    return "12 PM";
  }
  return `${hour - 12} PM`;
}
