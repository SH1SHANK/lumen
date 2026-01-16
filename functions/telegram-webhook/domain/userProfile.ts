import { getUserProfile } from "../db/firebase.ts";

/**
 * Get a greeting-safe name for the user.
 * Prefers display_name, falls back to username, then to a neutral greeting.
 */
export async function getUserGreeting(
  firebaseUid: string
): Promise<string | null> {
  const profile = await getUserProfile(firebaseUid);

  if (!profile) return null;

  // Prefer display_name if present and non-empty
  if (profile.displayName && profile.displayName.trim()) {
    // Capitalize first letter of display name
    const name = profile.displayName.trim();
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // Fallback to username
  if (profile.username && profile.username.trim()) {
    const name = profile.username.trim();
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // No name available
  return null;
}
