// lib/threads.ts
import { createClient } from "@/lib/supabase/client";

export async function createOrGetThread(otherUserId: string) {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("create_or_get_thread_1to1", {
    other_user_id: otherUserId,
  });

  if (error) throw error;

  // data is the uuid returned by the function
  return data as string;
}