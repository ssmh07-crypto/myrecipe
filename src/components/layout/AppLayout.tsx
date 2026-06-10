import { BookMarked, BookOpen, CalendarDays, Home, Plus, Settings, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LoadingState } from '../ui/State'

const tabs = [
  { to: '/recipes', label: 'Home', icon: Home },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/recipes/add', label: 'Add', icon: Plus },
  { to: '/recipe-books', label: 'Book', icon: BookMarked },
  { to: '/premium', label: 'Premium', icon: Sparkles },
]

export const AppLayout = ({
  children,
  requireAuth = true,
  hideHeader = false,
  hideNav = false,
}: {
  children: ReactNode
  requireAuth?: boolean
  hideHeader?: boolean
  hideNav?: boolean
}) => {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading && requireAuth) return <main className="min-h-screen bg-[#fff8ec] p-4"><LoadingState /></main>
  if (requireAuth && !user) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen bg-[#fbf9f8] text-[#1b1c1c]">
      {!hideHeader ? <header className="no-print sticky top-0 z-20 bg-[#fbf9f8]/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-16 max-w-xl items-center justify-between px-4">
          <NavLink to="/recipes" className="flex items-center gap-2 font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#ffdbc9] text-[#974400]">
              <BookOpen size={19} />
            </span>
            <span className="text-[22px] font-bold leading-7 text-[#974400]">My Recipe Note</span>
          </NavLink>
          <NavLink
            to={user ? '/settings' : '/login'}
            className="inline-flex min-h-10 items-center gap-2 rounded-full p-2 text-sm font-semibold text-[#974400] transition hover:bg-[#e4e2e1]"
            aria-label={user ? '설정' : '로그인'}
          >
            {user ? <Settings size={22} /> : <span className="px-2">Log in</span>}
          </NavLink>
        </div>
      </header> : null}
      <main className={`mx-auto max-w-3xl ${hideHeader ? '' : 'px-4 pt-4'} ${hideNav ? 'pb-8' : 'pb-28'}`}>{children}</main>
      {!hideNav ? (
        <nav className="no-print fixed bottom-0 left-0 right-0 z-30 rounded-t-xl border-t border-[#ddc1b3] bg-white shadow-[0_-4px_16px_rgba(154,64,34,0.08)]">
          <div className="mx-auto grid max-w-xl grid-cols-5 px-2 pb-2 pt-1">
            {tabs.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={label}
                to={to}
                className={() => {
                  const isActive = location.pathname === to || (to === '/recipes/add' && ['/recipes/import', '/recipes/new'].some((path) => location.pathname.startsWith(path)))
                  return (
                  `flex min-h-14 flex-col items-center justify-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition active:scale-90 ${isActive ? 'bg-[#c8f17a] text-[#4e6e00]' : 'text-[#564338]'}`
                  )
                }}
              >
                <Icon size={20} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  )
}
