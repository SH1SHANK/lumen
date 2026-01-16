import { supabase } from "./client.ts";

export interface UserEnrollment {
  courseIDs: string[];
  batchID: string;
}

export interface ClassRecord {
  classID: string;
  courseID: string;
  courseName: string;
  classDate: string;
  classStartTime: string;
  classEndTime: string;
  classVenue?: string;
  batchID: string;
}

// Get user's enrolled courses and batch
export async function getUserEnrollment(
  userID: string
): Promise<UserEnrollment | null> {
  const { data, error } = await supabase
    .from("userCourseRecords")
    .select("enrolledCourses, batchID")
    .eq("userID", userID)
    .single();

  if (error || !data) return null;
  return {
    courseIDs: data.enrolledCourses || [],
    batchID: data.batchID,
  };
}

// Get classes by date for a specific batch and courses
export async function getClassesByDate(
  batchID: string,
  courseIDs: string[],
  date: string
): Promise<ClassRecord[]> {
  const { data: classes, error } = await supabase
    .from("timetableRecords")
    .select("*")
    .eq("classDate", date)
    .eq("batchID", batchID)
    .in("courseID", courseIDs)
    .order("classStartTime");

  if (error) {
    console.error("Error fetching classes:", error);
    return [];
  }

  return classes || [];
}
