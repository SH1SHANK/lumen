import { supabase } from "./client.ts";

export interface ReminderRow {
  chat_id: number;
  class_id: string;
  course_name: string;
  class_start_time: string;
  class_venue: string | null;
}

export async function getPendingClassReminders(): Promise<ReminderRow[]> {
  const { data, error } = await supabase.rpc("get_pending_class_reminders");

  if (error || !data) {
    throw error ?? new Error("Failed to fetch pending reminders");
  }

  return data as ReminderRow[];
}
