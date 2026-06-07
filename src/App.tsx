import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { FavoritesPage } from './pages/FavoritesPage'
import { LoginPage } from './pages/LoginPage'
import { RecipeDetailPage } from './pages/RecipeDetailPage'
import { RecipeEditPage } from './pages/RecipeEditPage'
import { RecipeImportPage } from './pages/RecipeImportPage'
import { RecipeListPage } from './pages/RecipeListPage'
import { RecipeNewPage } from './pages/RecipeNewPage'
import { SettingsPage } from './pages/SettingsPage'
import { YoutubeImportPage } from './pages/YoutubeImportPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/recipes" replace />} />
      <Route path="/recipes" element={<AppLayout><RecipeListPage /></AppLayout>} />
      <Route path="/recipes/new" element={<AppLayout><RecipeNewPage /></AppLayout>} />
      <Route path="/recipes/import" element={<AppLayout><RecipeImportPage /></AppLayout>} />
      <Route path="/recipes/import/youtube" element={<AppLayout><YoutubeImportPage /></AppLayout>} />
      <Route path="/recipes/:id" element={<AppLayout><RecipeDetailPage /></AppLayout>} />
      <Route path="/recipes/:id/edit" element={<AppLayout><RecipeEditPage /></AppLayout>} />
      <Route path="/favorites" element={<AppLayout><FavoritesPage /></AppLayout>} />
      <Route path="/settings" element={<AppLayout><SettingsPage /></AppLayout>} />
    </Routes>
  )
}

export default App
