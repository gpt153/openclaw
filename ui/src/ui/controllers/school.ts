/**
 * School Data Controller
 * Manages school data (news, messages, notes) from Quiculum
 */

export interface SchoolDataItem {
  id: number;
  child_id: number;
  type: 'news' | 'message' | 'note';
  title: string;
  content: string;
  source_url: string;
  published_at: string | null;
  synced_at: string;
  metadata: Record<string, any>;
}

export interface SchoolDataState {
  items: SchoolDataItem[];
  loading: boolean;
  error: string | null;
  filterType: 'all' | 'news' | 'message' | 'note';
}

/**
 * Fetch school data for a child
 */
export async function fetchSchoolData(
  state: SchoolDataState,
  baseUrl: string,
  childId: number,
  limit: number = 20
): Promise<void> {
  state.loading = true;
  state.error = null;

  try {
    const typeParam = state.filterType !== 'all' ? `&data_type=${state.filterType}` : '';
    const response = await fetch(
      `${baseUrl}/api/v1/school/${childId}/data?limit=${limit}${typeParam}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch school data: ${response.statusText}`);
    }

    const data = await response.json();
    state.items = data.items || [];
  } catch (err) {
    state.error = String(err);
    state.items = [];
  } finally {
    state.loading = false;
  }
}

/**
 * Trigger manual sync of school data
 */
export async function syncSchoolData(
  baseUrl: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/school/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to sync: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: data.success,
      message: `Synced ${data.total_synced} items (${data.news_synced} news, ${data.messages_synced} messages, ${data.notes_synced} notes)`,
    };
  } catch (err) {
    return {
      success: false,
      message: String(err),
    };
  }
}

/**
 * Format date for display
 */
export function formatSchoolDataDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown date';

  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Invalid date';
  }
}

/**
 * Get icon for data type
 */
export function getSchoolDataIcon(type: string): string {
  switch (type) {
    case 'news':
      return '\uD83D\uDCF0'; // 📰
    case 'message':
      return '\uD83D\uDCE7'; // 📧
    case 'note':
      return '\uD83D\uDCDD'; // 📝
    default:
      return '\uD83D\uDCC4'; // 📄
  }
}

/**
 * Get color for data type
 */
export function getSchoolDataColor(type: string): string {
  switch (type) {
    case 'news':
      return '#3b82f6'; // blue
    case 'message':
      return '#10b981'; // green
    case 'note':
      return '#f59e0b'; // amber
    default:
      return '#6b7280'; // gray
  }
}
