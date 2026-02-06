export type PrivacyLevel = "full" | "limited" | "minimal";
export type ChildType = "biological" | "foster";

export interface ChildProfile {
  id: string;
  name: string;
  age: number;
  type: ChildType;
  privacy_level: PrivacyLevel;
  school_data_enabled: boolean;
  school_name?: string;
  grade?: string;
  activities?: string[];
  medical_info?: string;
  avatar_url?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  child_id: string;
  action: string;
  user: string;
  data_type: string;
}

export interface FamilyState {
  children: ChildProfile[];
  loading: boolean;
  error: string | null;
  selectedChildId: string | null;
  auditLog: AuditEntry[];
  auditLoading: boolean;
}

/**
 * Check if a field is accessible based on privacy level
 */
export function canAccessField(profile: ChildProfile, field: string): boolean {
  // Basic info always visible
  if (field === "name" || field === "age" || field === "type") {
    return true;
  }

  // Minimal privacy: only basic info
  if (profile.privacy_level === "minimal") {
    return false;
  }

  // Limited privacy: school basics only
  if (profile.privacy_level === "limited") {
    return ["school_name", "grade"].includes(field);
  }

  // Full privacy: all fields accessible
  return true;
}

/**
 * Fetch all children profiles
 */
export async function fetchChildren(state: FamilyState, baseUrl: string): Promise<void> {
  state.loading = true;
  state.error = null;
  try {
    const response = await fetch(`${baseUrl}/api/v1/children/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: '1' }) // TODO: Get actual user_id
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch children: ${response.statusText}`);
    }
    state.children = await response.json();
  } catch (err) {
    state.error = String(err);
  } finally {
    state.loading = false;
  }
}

/**
 * Fetch specific child data (server validates privacy)
 */
export async function fetchChildData(
  baseUrl: string,
  childId: string,
  dataType: string,
): Promise<unknown> {
  const response = await fetch(
    `${baseUrl}/api/v1/children/${childId}/${dataType}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch ${dataType}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Update child privacy level
 */
export async function updatePrivacyLevel(
  state: FamilyState,
  baseUrl: string,
  childId: string,
  level: PrivacyLevel,
): Promise<void> {
  try {
    const response = await fetch(
      `${baseUrl}/api/v1/children/${childId}/privacy`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privacy_level: level }),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to update privacy: ${response.statusText}`);
    }

    // Update local state
    const child = state.children.find((c) => c.id === childId);
    if (child) {
      child.privacy_level = level;
    }
  } catch (err) {
    state.error = String(err);
  }
}

/**
 * Fetch audit log for a child
 */
export async function fetchAuditLog(
  state: FamilyState,
  baseUrl: string,
  childId: string,
): Promise<void> {
  state.auditLoading = true;
  try {
    const response = await fetch(
      `${baseUrl}/api/v1/children/${childId}/audit`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch audit log: ${response.statusText}`);
    }
    state.auditLog = await response.json();
  } catch (err) {
    state.error = String(err);
  } finally {
    state.auditLoading = false;
  }
}

/**
 * Toggle school data for a child
 */
export async function toggleSchoolData(
  state: FamilyState,
  baseUrl: string,
  childId: string,
  enabled: boolean,
): Promise<void> {
  try {
    const response = await fetch(
      `${baseUrl}/api/v1/children/${childId}/school-data`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      },
    );
    if (!response.ok) {
      throw new Error(`Failed to toggle school data: ${response.statusText}`);
    }

    // Update local state
    const child = state.children.find((c) => c.id === childId);
    if (child) {
      child.school_data_enabled = enabled;
    }
  } catch (err) {
    state.error = String(err);
  }
}
