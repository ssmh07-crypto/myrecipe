import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { FavoritesPage } from './pages/FavoritesPage'
import { LoginPage } from './pages/LoginPage'
import { RecipeDetailPage } from './pages/RecipeDetailPage'
import { RecipeEditPage } from './pages/RecipeEditPage'
import { RecipeImportPage } from './pages/RecipeImportPage'
import { RecipeListPage } from './pages/RecipeListPage'
import { RecipeNewPage } from './pages/RecipeNewPage'
import { RecipeBookPage } from './pages/RecipeBookPage'
import { SettingsPage } from './pages/SettingsPage'
import { HomePage } from './pages/HomePage'
import { PremiumPage } from './pages/PremiumPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/recipes" replace />} />
      <Route path="/recipes" element={<AppLayout><HomePage /></AppLayout>} />
      <Route path="/recipes/recent" element={<AppLayout><RecipeListPage title="최근 레시피" subtitle="최근에 등록한 레시피를 최신순으로 모았습니다." showImportAction={false} /></AppLayout>} />
      <Route path="/recipes/search" element={<AppLayout><RecipeListPage title="레시피 검색" subtitle="저장한 레시피를 이름과 메모로 찾아보세요." showImportAction={false} autoFocusSearch /></AppLayout>} />
      <Route path="/recipes/new" element={<AppLayout><RecipeNewPage /></AppLayout>} />
      <Route path="/recipes/import" element={<AppLayout><RecipeImportPage /></AppLayout>} />
      <Route path="/recipes/import/youtube" element={<Navigate to="/recipes/import" replace />} />
      <Route path="/recipes/:id" element={<AppLayout hideHeader hideNav><RecipeDetailPage /></AppLayout>} />
      <Route path="/recipes/:id/edit" element={<AppLayout><RecipeEditPage /></AppLayout>} />
      <Route path="/recipe-books" element={<AppLayout><RecipeBookPage /></AppLayout>} />
      <Route path="/premium" element={<AppLayout><PremiumPage /></AppLayout>} />
      <Route path="/favorites" element={<AppLayout><FavoritesPage /></AppLayout>} />
      <Route path="/settings" element={<AppLayout><SettingsPage /></AppLayout>} />
    </Routes>
  )
}

export default App
