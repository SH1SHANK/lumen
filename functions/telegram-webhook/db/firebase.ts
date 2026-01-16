import { supabase } from "./client.ts";

export interface UserProfile {
  displayName: string | null;
  username: string | null;
}

/**
 * Fetch minimal user profile data from firebase_data.
 * Returns display_name and username for personalization.
 */
export async function getUserProfile(
  firebaseUid: string
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("firebase_data")
    .select("attrs")
    .ilike("name", `%${firebaseUid}`)
    .single();

  if (error || !data) {
    console.error(`[getUserProfile] Failed for uid ${firebaseUid}:`, error);
    return null;
  }

  // Extract fields from Firestore document structure
  const fields = data.attrs?.fields;
  if (!fields) return null;

  // Firestore stores values as {stringValue: "..."}, {integerValue: "..."}, etc.
  const displayName = fields.display_name?.stringValue ?? null;
  const username = fields.username?.stringValue ?? null;

  return {
    displayName,
    username,
  };
}
