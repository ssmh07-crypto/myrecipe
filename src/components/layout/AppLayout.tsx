import { BookMarked, BookOpen, Home, Plus, Search, Settings, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LoadingState } from '../ui/State'

const tabs = [
  { to: '/recipes', label: '홈', icon: Home },
  { to: '/recipes/search', label: '검색', icon: Search },
  { to: '/recipes/new', label: '추가', icon: Plus },
  { to: '/recipe-books', label: '레시피북', icon: BookMarked },
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
    <div className="min-h-screen bg-[#fff8f5] text-stone-900">
      {!hideHeader ? <header className="no-print sticky top-0 z-20 bg-[#fff8f5]/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <NavLink to="/recipes" className="flex items-center gap-2 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#ffdbd0] text-[#9a4022]">
              <BookOpen size={19} />
            </span>
            <span className="font-serif text-xl text-[#9a4022]">My Recipe Note</span>
          </NavLink>
          <NavLink
            to={user ? '/settings' : '/login'}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#9a4022] shadow-sm"
          >
            {user ? <Settings size={17} /> : null}
            {user ? '설정' : 'Log in'}
          </NavLink>
        </div>
      </header> : null}
      <main className={`mx-auto max-w-3xl ${hideHeader ? '' : 'px-4 pt-4'} ${hideNav ? 'pb-8' : 'pb-28'}`}>{children}</main>
      {!hideNav ? (
        <nav className="no-print fixed bottom-0 left-0 right-0 z-30 rounded-t-xl bg-white shadow-[0_-4px_16px_rgba(154,64,34,0.08)]">
          <div className="mx-auto grid max-w-3xl grid-cols-5 px-3 py-2">
            {tabs.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={label}
                to={to}
                className={() => {
                  const isActive = location.pathname === to
                  return (
                  `flex flex-col items-center gap-1 rounded-full px-2 py-2 text-xs transition ${isActive ? 'bg-[#ffdbd0] text-[#390b00]' : 'text-[#56423c]'}`
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
