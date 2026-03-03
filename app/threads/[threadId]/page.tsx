import ThreadClient from './ThreadClient'

export default async function Page({
  params,
}: {
  params: Promise<{ threadId: string }>
}) {
  const { threadId } = await params
  return <ThreadClient threadId={threadId} />
}