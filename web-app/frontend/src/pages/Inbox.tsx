import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bell, CheckCheck, CircleAlert, CircleCheck, Info, Search, Trash2, TriangleAlert, WandSparkles, type LucideIcon } from 'lucide-react'
import { format, formatDistanceToNowStrict, isSameDay, isToday, isYesterday } from 'date-fns'
import api from '../lib/api'
import type { Notification } from '../lib/types'
import { Avatar, Button, EmptyState, PageHeader, Skeleton } from '../components/ui'

type Channel = Notification['type']

/** Notifications are grouped into conversation channels by their type. */
export const channelMeta: Record<Channel, { name: string; description: string; icon: LucideIcon; tone: number }> = {
  success: { name: 'Completed workflows', description: 'Audits, tools, and agents that finished', icon: CircleCheck, tone: 0 },
  error: { name: 'Failed workflows', description: 'Runs that stopped with an error', icon: CircleAlert, tone: 3 },
  warning: { name: 'Needs review', description: 'Partial results and configuration gaps', icon: TriangleAlert, tone: 4 },
  info: { name: 'Workspace updates', description: 'Team, workspace, and system messages', icon: Info, tone: 1 },
}
const channelOrder: Channel[] = ['success', 'error', 'warning', 'info']

export function relativeTime(iso: string) {
  const date = new Date(iso)
  if (isToday(date)) return format(date, 'HH:mm')
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMM d')
}

function dayLabel(date: Date) {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMM d')
}

export function InboxPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const threadEnd = useRef<HTMLDivElement | null>(null)

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<{ notifications: Notification[]; unreadCount: number }>('/notifications')).data,
    refetchInterval: 30_000,
  })
  const notifications = useMemo(() => query.data?.notifications || [], [query.data])

  const conversations = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return channelOrder.map((type) => {
      const all = notifications.filter((item) => item.type === type)
      const matching = needle ? all.filter((item) => `${item.title} ${item.message}`.toLowerCase().includes(needle)) : all
      const unread = all.filter((item) => !item.isRead).length
      return { type, all, matching, unread, latest: all[0] }
    }).filter((item) => item.all.length > 0 && item.matching.length > 0 && (filter === 'all' || item.unread > 0))
  }, [notifications, search, filter])

  const requested = searchParams.get('channel') as Channel | null
  const active = conversations.find((item) => item.type === requested) || null
  const thread = useMemo(() => active ? [...active.matching].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)) : [], [active])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  const markRead = useMutation({
    mutationFn: async (ids: string[]) => { await Promise.all(ids.map((id) => api.patch(`/notifications/${id}/read`))) },
    onSuccess: refresh,
  })
  const markAll = useMutation({ mutationFn: async () => api.post('/notifications/read-all'), onSuccess: refresh })
  const remove = useMutation({ mutationFn: async (id: string) => api.delete(`/notifications/${id}`), onSuccess: refresh })

  // Opening a conversation reads it, as in any messaging client.
  const unreadInThread = active?.all.filter((item) => !item.isRead).map((item) => item.id).join(',') || ''
  useEffect(() => {
    if (unreadInThread && !markRead.isPending) markRead.mutate(unreadInThread.split(','))
  }, [unreadInThread])
  useEffect(() => {
    const list = threadEnd.current?.parentElement
    if (list) list.scrollTop = list.scrollHeight
  }, [active?.type, thread.length])

  const open = (type: Channel | null) => setSearchParams(type ? { channel: type } : {}, { replace: false })
  const unreadTotal = query.data?.unreadCount || 0

  return <div className="page-stack inbox-page">
    <PageHeader title="Inbox" description="Workflow results, failures, and workspace updates, delivered as they happen." actions={unreadTotal > 0 && <Button leading={<CheckCheck size={15} />} onClick={() => markAll.mutate()} loading={markAll.isPending}>Mark all read</Button>} />
    <div className={`messenger ${active ? 'has-thread' : ''}`}>
      <aside className="messenger-list card card-surface" aria-label="Conversations">
        <div className="messenger-list-head">
          <label className="search-pill"><Search size={15} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages" aria-label="Search messages" /></label>
          <div className="filter-group" role="tablist" aria-label="Filter conversations">
            {(['all', 'unread'] as const).map((value) => <button key={value} role="tab" aria-selected={filter === value} className={`filter-option ${filter === value ? 'selected' : ''}`} onClick={() => setFilter(value)}>{value}{value === 'unread' && unreadTotal > 0 ? ` · ${unreadTotal}` : ''}</button>)}
          </div>
        </div>
        {query.isLoading ? <div className="conversation-skeletons">{[0, 1, 2].map((index) => <div className="conversation-row" key={index}><Skeleton width={44} height={44} radius={14} /><span className="conversation-copy"><Skeleton width="60%" /><Skeleton width="85%" height={11} /></span></div>)}</div>
          : conversations.length ? <div className="conversation-list">{conversations.map(({ type, latest, unread, matching }) => {
            const meta = channelMeta[type]
            const Icon = meta.icon
            return <button key={type} className={`conversation-row ${active?.type === type ? 'active' : ''} ${unread ? 'is-unread' : ''}`} onClick={() => open(type)} aria-current={active?.type === type ? 'true' : undefined}>
              <Avatar name={meta.name} tone={meta.tone} size={44} icon={<Icon size={19} />} presence={unread ? 'online' : undefined} />
              <span className="conversation-copy"><strong>{meta.name}</strong><small>{latest?.title}{latest?.message ? ` · ${latest.message}` : ''}</small></span>
              <span className="conversation-meta"><time>{latest ? relativeTime(latest.createdAt) : ''}</time>{unread > 0 ? <span className="unread-badge">{unread}</span> : <span className="count-chip">{matching.length}</span>}</span>
            </button>
          })}</div>
            : <EmptyState illustration="chat" title={search || filter === 'unread' ? 'No matching messages' : 'Your inbox is empty'} detail={search || filter === 'unread' ? 'Try another search or switch back to all conversations.' : 'Workflow completions, failures, and workspace updates will arrive here.'} />}
      </aside>

      <section className="messenger-thread card card-glass" aria-label={active ? channelMeta[active.type].name : 'Conversation'}>
        {active ? <>
          <header className="thread-head">
            <button className="icon-button thread-back" onClick={() => open(null)} aria-label="Back to conversations"><ArrowLeft size={18} /></button>
            <Avatar name={channelMeta[active.type].name} tone={channelMeta[active.type].tone} size={42} icon={(() => { const Icon = channelMeta[active.type].icon; return <Icon size={18} /> })()} presence="online" />
            <div className="thread-title"><strong>{channelMeta[active.type].name}</strong><small>{channelMeta[active.type].description} · {active.all.length} messages</small></div>
          </header>
          <div className="thread-body" role="log" aria-live="polite">
            {thread.map((item, index) => {
              const date = new Date(item.createdAt)
              const showDay = index === 0 || !isSameDay(date, new Date(thread[index - 1].createdAt))
              return <div key={item.id} className="thread-item">
                {showDay && <div className="day-divider"><span>{dayLabel(date)}</span></div>}
                <article className={`bubble bubble-incoming bubble-${item.type}`}>
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                  <footer><time dateTime={item.createdAt} title={format(date, 'PPpp')}>{format(date, 'HH:mm')}</time><span className="read-state">{item.isRead ? <><CheckCheck size={13} /> Read</> : 'New'}</span>
                    <button className="bubble-action" onClick={() => remove.mutate(item.id)} aria-label={`Delete “${item.title}”`} disabled={remove.isPending}><Trash2 size={13} /></button></footer>
                </article>
              </div>
            })}
            <div ref={threadEnd} />
          </div>
          <footer className="thread-composer">
            <span className="composer-note"><Bell size={15} /> Messages here are sent automatically by your workflows and workspace.</span>
            <Link className="button button-primary button-sm" to="/app/tools"><WandSparkles size={14} /> Start a workflow</Link>
          </footer>
        </> : <div className="thread-placeholder">
          <EmptyState illustration="chat" title="Select a conversation" detail="Choose a channel to read its workflow updates. Opening a conversation marks its messages as read." />
        </div>}
      </section>
    </div>
    <p className="section-note">Showing your 50 most recent notifications{query.dataUpdatedAt ? `, updated ${formatDistanceToNowStrict(query.dataUpdatedAt, { addSuffix: true })}` : ''}. New messages arrive every 30 seconds.</p>
  </div>
}
