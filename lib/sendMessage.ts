import { createSupabaseBrowserClient } from './supabaseClient'

type MessageType = 'scribble' | 'transform'

export async function sendImageMessage(
  params: {
    threadId: string
    type: MessageType
    pngBlob: Blob
    caption?: string | null
    canSend?: boolean
  },
  deps?: {
    supabase?: ReturnType<typeof createSupabaseBrowserClient>
  }
) {
  if (params.canSend === false) {
    throw new Error('Not your turn')
  }

  const supabase = deps?.supabase ?? createSupabaseBrowserClient()

  const { data: sess, error: sessErr } = await supabase.auth.getSession()
  if (sessErr) throw sessErr

  const userId = sess.session?.user.id
  if (!userId) throw new Error('Not authenticated')

  const messageId = crypto.randomUUID()

  const folder = params.type === 'scribble' ? 'scribbles' : 'transforms'
  const path = `${folder}/${params.threadId}/${messageId}.png`

  const { error: upErr } = await supabase.storage.from('scribbit').upload(path, params.pngBlob, {
    contentType: 'image/png',
    upsert: false,
  })
  if (upErr) throw upErr

  const { error: dbErr } = await supabase.from('messages').insert({
    id: messageId,
    thread_id: params.threadId,
    sender_id: userId,
    type: params.type,
    image_path: path,
    caption: params.caption ?? null,
  })
  if (dbErr) throw dbErr

  return { messageId, path }
}