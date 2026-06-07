import { BookMarked, BookOpen, Home, Plus, Search, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LoadingState } from '../ui/State'

const tabs = [
  { to: '/recipes', label: '홈', icon: Home },
  { to: '/recipes?focus=search', label: '검색', icon: Search },
  { to: '/recipes/new', label: '추가', icon: Plus },
  { to: '/recipe-books', label: '레시피북', icon: BookMarked },
  { to: '/settings', label: '설정', icon: Settings },
]

export const AppLayout = ({ children, requireAuth = true }: { children: ReactNode; requireAuth?: boolean }) => {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <main className="min-h-screen bg-[#fff8ec] p-4"><LoadingState /></main>
  if (requireAuth && !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return (
    <div className="min-h-screen bg-[#fff8ec] text-stone-900">
      <header className="sticky top-0 z-20 border-b border-amber-100 bg-[#fff8ec]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <NavLink to="/recipes" className="flex items-center gap-2 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-700 text-white">
              <BookOpen size={19} />
            </span>
            <span>My Recipe Note</span>
          </NavLink>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-4">{children}</main>
      {user ? (
        <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-amber-100 bg-white">
          <div className="mx-auto grid max-w-3xl grid-cols-5 px-2 py-2">
            {tabs.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={label}
                to={to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs ${isActive ? 'text-amber-800' : 'text-stone-500'}`
                }
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
