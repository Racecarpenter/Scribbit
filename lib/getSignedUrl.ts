import { createSupabaseBrowserClient } from './supabaseClient'

export async function getSignedUrl(path: string, expiresInSeconds = 60 * 30) {
  const supabase = createSupabaseBrowserClient()

  const { data, error } = await supabase.storage
    .from('scribbit')
    .createSignedUrl(path, expiresInSeconds)

  if (error) throw error
  return data.signedUrl
}