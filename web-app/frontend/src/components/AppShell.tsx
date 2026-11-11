import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, ArrowLeftRight, BarChart3, Bell, BriefcaseBusiness, CalendarDays, ChevronDown, CircleHelp,
  FileBarChart2, FolderKanban, Gauge, Globe2, LayoutDashboard, LogOut, Menu, Moon, PanelLeftClose,
  PanelLeftOpen, Search, Settings2, ShieldCheck, Sun, Users, WandSparkles, X, type LucideIcon,
} from 'lucide-react'
import api from '../lib/api'
import { SessionProvider } from '../lib/session'
import type { Notification, ThemeChoice, User, Workspace } from '../lib/types'
import { BrandLogo } from './BrandLogo'
import { LoadingBlock } from './ui'

const navItems: Array<{ label: string; to: string; icon: LucideIcon }> = [
  { label: 'Overview', to: '/app', icon: LayoutDashboard },
  { label: 'Marketing projects', to: '/app/projects', icon: FolderKanban },
  { label: 'Website audit', to: '/app/audit', icon: Gauge },
  { label: 'AI marketing tools', to: '/app/tools', icon: WandSparkles },
  { label: 'SEO intelligence', to: '/app/seo', icon: BarChart3 },
  { label: 'Competitor intelligence', to: '/app/competitors', icon: Globe2 },
  { label: 'Content studio', to: '/app/content', icon: CalendarDays },
  { label: 'Campaign studio', to: '/app/campaigns', icon: BriefcaseBusiness },
  { label: 'AI agents', to: '/app/agents', icon: Users },
  { label: 'Reports & documents', to: '/app/reports', icon: FileBarChart2 },
  { label: 'Integrations', to: '/app/integrations', icon: ArrowLeftRight },
  { label: 'Execution history', to: '/app/executions', icon: Activity },
  { label: 'Settings', to: '/app/settings', icon: Settings2 },
]

function initials(user: User) {
  return `${user.firstName.slice(0, 1)}${user.lastName.slice(0, 1)}`.toUpperCase()
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [workspaceMenu, setWorkspaceMenu] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [noticeMenu, setNoticeMenu] = useState(false)
  const [searchText, setSearchText] = useState('')
  const deferredSearch = useMemo(() => searchText.trim(), [searchText])

  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => (await api.get<{ user: User; workspace: Workspace }>('/auth/me')).data,
  })
  const user = session.data?.user
  const workspace = session.data?.workspace
  const [theme, setThemeState] = useState<ThemeChoice>('light')
  useEffect(() => {
    const persisted = user?.theme || localStorage.getItem('theme') || 'light'
    const next = persisted === 'dark' || persisted === 'system' ? persisted : 'light'
    setThemeState(next)
    const dark = next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.dataset.theme = next
    localStorage.setItem('theme', next)
  }, [user?.theme])

  const setTheme = (next: ThemeChoice) => {
    setThemeState(next)
    localStorage.setItem('theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches))
    document.documentElement.dataset.theme = next
    void api.put('/auth/profile', { theme: next }).catch(() => undefined)
    queryClient.setQueryData(['session'], (current: typeof session.data | undefined) => current ? { ...current, user: { ...current.user, theme: next } } : current)
  }

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => (await api.get<{ workspaces: Workspace[] }>('/workspaces')).data.workspaces,
    enabled: Boolean(user),
  })
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<{ notifications: Notification[]; unreadCount: number }>('/notifications')).data,
    enabled: Boolean(user),
    refetchInterval: 30_000,
  })
  const searchResults = useQuery({
    queryKey: ['global-search', deferredSearch],
    queryFn: async () => {
      const [projects, reports] = await Promise.all([
        api.get<{ projects: Array<{ id: string; name: string; companyName?: string }> }>('/projects'),
        api.get<{ reports: Array<{ id: string; title: string }> }>('/reports', { params: { search: deferredSearch } }),
      ])
      const q = deferredSearch.toLowerCase()
      return {
        projects: projects.data.projects.filter((project) => `${project.name} ${project.companyName || ''}`.toLowerCase().includes(q)).slice(0, 4),
        reports: reports.data.reports.slice(0, 4),
      }
    },
    enabled: Boolean(user && deferredSearch.length >= 2),
  })

  const switchWorkspace = useMutation({
    mutationFn: async (id: string) => (await api.post<{ token: string }>(`/workspaces/${id}/switch`)).data,
    onSuccess: ({ token }) => {
      localStorage.setItem('auth_token', token)
      queryClient.clear()
      setWorkspaceMenu(false)
      navigate('/app')
    },
  })

  useEffect(() => setMobileOpen(false), [location.pathname])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault()
        document.getElementById('global-search')?.focus()
      }
      if (event.key === 'Escape') {
        setWorkspaceMenu(false)
        setUserMenu(false)
        setNoticeMenu(false)
        setSearchText('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const markAllRead = async () => {
    await api.post('/notifications/read-all')
    await queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }
  const markRead = async (notification: Notification) => {
    if (!notification.isRead) await api.patch(`/notifications/${notification.id}/read`)
    setNoticeMenu(false)
    await queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }
  const signOut = async () => {
    await api.post('/auth/logout').catch(() => undefined)
    localStorage.removeItem('auth_token')
    queryClient.clear()
    navigate('/login')
  }

  if (session.isLoading || !user || !workspace) return <div className="app-loading"><LoadingBlock label="Opening your workspace" /></div>

  const iconSize = 17
  return <SessionProvider value={{ user, workspace, theme, setTheme }}>
    <div className={`app-frame ${collapsed ? 'is-collapsed' : ''} ${location.pathname === '/app' ? 'dashboard-frame' : ''}`}>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <BrandLogo />
        <div className="workspace-picker-wrap">
          <button className="workspace-picker" onClick={() => setWorkspaceMenu((value) => !value)} aria-expanded={workspaceMenu}>
            <span className="workspace-avatar">{workspace.name.slice(0, 1).toUpperCase()}</span>
            <span className="workspace-copy"><strong>{workspace.name}</strong><small>{workspace.plan} workspace</small></span>
            <ChevronDown size={14} />
          </button>
          {workspaceMenu && <div className="menu-popover workspace-menu">
            <div className="menu-caption">Your workspaces</div>
            {(workspaces.data || []).map((item) => <button key={item.id} className="menu-option" onClick={() => switchWorkspace.mutate(item.id)} disabled={switchWorkspace.isPending || item.id === workspace.id}>
              <span className="workspace-avatar small">{item.name.slice(0, 1).toUpperCase()}</span><span>{item.name}</span>{item.id === workspace.id && <span className="menu-check">Current</span>}
            </button>)}
            <Link className="menu-option menu-link" to="/app/settings" onClick={() => setWorkspaceMenu(false)}><Settings2 size={15} /> Workspace settings</Link>
          </div>}
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          <div className="nav-caption">Workspace</div>
          {navItems.map(({ label, to, icon: Icon }) => <NavLink key={to} end={to === '/app'} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={collapsed ? label : undefined}>
            <Icon size={iconSize} strokeWidth={1.8} /><span>{label}</span>
          </NavLink>)}
        </nav>
        <div className="sidebar-bottom">
          <Link className="nav-item" to="/app/team"><Users size={iconSize} strokeWidth={1.8} /><span>Team access</span></Link>
          <div className="sidebar-help"><ShieldCheck size={15} /><span>Workspace data is private</span></div>
          <button className="collapse-button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}<span>{collapsed ? 'Expand' : 'Collapse sidebar'}</span>
          </button>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="breadcrumbs"><span>{workspace.name}</span><span className="crumb-divider">/</span><span className="crumb-current">{navItems.find((item) => item.to === location.pathname)?.label || (location.pathname.startsWith('/app/projects/') ? 'Project' : location.pathname.split('/').filter(Boolean).at(-1)?.replace(/-/g, ' ') || 'Overview')}</span></div>
          <div className="topbar-actions">
            <div className="global-search-wrap">
              <Search size={15} aria-hidden="true" />
              <input id="global-search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search projects and reports" aria-label="Search projects and reports" />
              {!searchText && <kbd>/</kbd>}
              {searchText && <button className="search-clear" onClick={() => setSearchText('')} aria-label="Clear search"><X size={13} /></button>}
              {deferredSearch.length >= 2 && <div className="menu-popover search-results">
                {searchResults.isLoading ? <div className="search-empty">Searching workspace…</div> : <>
                  {searchResults.data?.projects.map((project) => <Link key={project.id} to={`/app/projects/${project.id}`} className="search-result" onClick={() => setSearchText('')}><FolderKanban size={14} /><span>{project.name}</span><small>Project</small></Link>)}
                  {searchResults.data?.reports.map((report) => <Link key={report.id} to={`/app/reports/${report.id}`} className="search-result" onClick={() => setSearchText('')}><FileBarChart2 size={14} /><span>{report.title}</span><small>Report</small></Link>)}
                  {!searchResults.data?.projects.length && !searchResults.data?.reports.length && <div className="search-empty">No matching projects or reports</div>}
                </>}
              </div>}
            </div>
            <button className="icon-button theme-button" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="popover-wrap">
              <button className="icon-button notification-button" onClick={() => setNoticeMenu((value) => !value)} aria-label={`Notifications${notifications.data?.unreadCount ? `, ${notifications.data.unreadCount} unread` : ''}`} aria-expanded={noticeMenu}>
                <Bell size={17} />{Boolean(notifications.data?.unreadCount) && <span className="notification-dot" />}
              </button>
              {noticeMenu && <div className="menu-popover notifications-popover">
                <div className="popover-heading"><strong>Notifications</strong>{Boolean(notifications.data?.unreadCount) && <button onClick={() => void markAllRead()}>Mark all read</button>}</div>
                {(notifications.data?.notifications || []).slice(0, 8).map((notification) => <button key={notification.id} className={`notification-row ${notification.isRead ? '' : 'unread'}`} onClick={() => void markRead(notification)}>
                  <span className={`notification-mark ${notification.type}`} />
                  <span><strong>{notification.title}</strong><small>{notification.message}</small></span>
                </button>)}
                {!notifications.data?.notifications.length && <div className="search-empty">You're all caught up</div>}
              </div>}
            </div>
            <div className="popover-wrap user-wrap">
              <button className="profile-button" onClick={() => setUserMenu((value) => !value)} aria-expanded={userMenu}>
                <span className="profile-avatar">{initials(user)}</span><span className="profile-name">{user.firstName} {user.lastName}</span><ChevronDown size={13} />
              </button>
              {userMenu && <div className="menu-popover user-menu">
                <div className="user-menu-head"><strong>{user.firstName} {user.lastName}</strong><small>{user.email}</small></div>
                <Link className="menu-option menu-link" to="/app/settings" onClick={() => setUserMenu(false)}><Settings2 size={15} /> Account settings</Link>
                <Link className="menu-option menu-link" to="/app/team" onClick={() => setUserMenu(false)}><Users size={15} /> Workspace team</Link>
                <button className="menu-option menu-link" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>
              </div>}
            </div>
          </div>
        </header>
        <main className="page-content"><Outlet /></main>
        <footer className="app-footer"><span>AI Marketing Suite · AIScripto</span><a href="https://www.aiscripto.com" target="_blank" rel="noreferrer">aiscripto.com</a><span className="footer-spacer" /><button className="footer-help" onClick={() => navigate('/app/integrations')}><CircleHelp size={13} /> Connection help</button></footer>
      </section>
    </div>
  </SessionProvider>
}
