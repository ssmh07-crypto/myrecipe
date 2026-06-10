import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { LoadingState } from './components/ui/State'
import { HomePage } from './pages/HomePage'

const FavoritesPage = lazy(() => import('./pages/FavoritesPage').then((module) => ({ default: module.FavoritesPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const PremiumPage = lazy(() => import('./pages/PremiumPage').then((module) => ({ default: module.PremiumPage })))
const RecipeBookPage = lazy(() => import('./pages/RecipeBookPage').then((module) => ({ default: module.RecipeBookPage })))
const RecipeAddPage = lazy(() => import('./pages/RecipeAddPage').then((module) => ({ default: module.RecipeAddPage })))
const RecipeDetailPage = lazy(() => import('./pages/RecipeDetailPage').then((module) => ({ default: module.RecipeDetailPage })))
const RecipeEditPage = lazy(() => import('./pages/RecipeEditPage').then((module) => ({ default: module.RecipeEditPage })))
const RecipeImportPage = lazy(() => import('./pages/RecipeImportPage').then((module) => ({ default: module.RecipeImportPage })))
const RecipeListPage = lazy(() => import('./pages/RecipeListPage').then((module) => ({ default: module.RecipeListPage })))
const RecipeNewPage = lazy(() => import('./pages/RecipeNewPage').then((module) => ({ default: module.RecipeNewPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))

const PageFallback = () => (
  <main className="min-h-screen bg-[#fff8f5] p-4">
    <LoadingState />
  </main>
)

function App() {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/recipes" replace />} />
          <Route path="/recipes" element={<AppLayout requireAuth={false}><HomePage /></AppLayout>} />
          <Route path="/recipes/recent" element={<AppLayout requireAuth={false}><RecipeListPage title="Recent Recipes" subtitle="Your newest saved recipes, sorted by creation date." showImportAction={false} /></AppLayout>} />
          <Route path="/recipes/search" element={<AppLayout requireAuth={false}><RecipeListPage title="Recipe Search" subtitle="Find saved recipes by name and notes." showImportAction={false} /></AppLayout>} />
          <Route path="/recipes/add" element={<AppLayout><RecipeAddPage /></AppLayout>} />
          <Route path="/recipes/new" element={<AppLayout hideNav><RecipeNewPage /></AppLayout>} />
          <Route path="/recipes/import" element={<AppLayout><RecipeImportPage /></AppLayout>} />
          <Route path="/recipes/import/youtube" element={<Navigate to="/recipes/import" replace />} />
          <Route path="/recipes/:id" element={<AppLayout hideHeader hideNav><RecipeDetailPage /></AppLayout>} />
          <Route path="/recipes/:id/edit" element={<AppLayout hideNav><RecipeEditPage /></AppLayout>} />
          <Route path="/recipe-books" element={<AppLayout><RecipeBookPage /></AppLayout>} />
          <Route path="/premium" element={<AppLayout requireAuth={false}><PremiumPage /></AppLayout>} />
          <Route path="/favorites" element={<AppLayout><FavoritesPage /></AppLayout>} />
          <Route path="/settings" element={<AppLayout><SettingsPage /></AppLayout>} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  )
}

export default App
