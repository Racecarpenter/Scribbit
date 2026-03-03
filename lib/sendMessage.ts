import { createSupabaseBrowserClient } from './supabaseClient'

type MessageType = 'scribble' | 'transform'

export async function sendImageMessage(params: {
  threadId: string
  type: MessageType
  pngBlob: Blob
  caption?: string | null
}) {
  const supabase = createSupabaseBrowserClient()

  const { data: sess } = await supabase.auth.getSession()
  const userId = sess.session?.user.id
  if (!userId) throw new Error('Not authenticated')

  const messageId = crypto.randomUUID()

  const folder = params.type === 'scribble' ? 'scribbles' : 'transforms'
  const path = `${folder}/${params.threadId}/${messageId}.png`

  const { error: upErr } = await supabase.storage
    .from('scribbit')
    .upload(path, params.pngBlob, {
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