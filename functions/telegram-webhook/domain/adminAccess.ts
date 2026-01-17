import { getIsAdmin } from "../db/firebase.ts";

export class AdminAccessDeniedError extends Error {
  constructor() {
    super("Admin access denied");
    this.name = "AdminAccessDeniedError";
  }
}

/**
 * Assert that a user is an admin.
 * Throws AdminAccessDeniedError if not.
 */
export async function assertAdmin(firebaseUid: string): Promise<void> {
  const isAdmin = await getIsAdmin(firebaseUid);
  if (!isAdmin) {
    throw new AdminAccessDeniedError();
  }
}
