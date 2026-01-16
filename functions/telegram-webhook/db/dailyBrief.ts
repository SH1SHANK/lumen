import { supabase } from "./client.ts";

export interface DailyBriefClass {
  courseName: string | null;
  classStartTime: string | null;
  classVenue: string | null;
}

export interface DailyBriefPayload {
  chat_id: number;
  firebase_uid: string;
  classes: DailyBriefClass[];
  attendance_percentage: number | null;
  attended_classes: number | null;
  total_classes: number | null;
  brief_date: string;
}

export async function getDailyBriefPayloads(
  todayDate: string
): Promise<DailyBriefPayload[]> {
  const { data, error } = await supabase.rpc("get_daily_brief_payloads", {
    p_today_date: todayDate,
  });

  if (error || !data) {
    throw error ?? new Error("Failed to fetch daily brief payloads");
  }

  return data as DailyBriefPayload[];
}
