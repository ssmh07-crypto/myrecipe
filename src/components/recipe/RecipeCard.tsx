import { Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Recipe } from '../../types/recipe'

export const RecipeCard = ({ recipe }: { recipe: Recipe }) => (
  <Link to={`/recipes/${recipe.id}`} className="block rounded-xl border border-amber-100 bg-white p-3 shadow-sm">
    <div className="flex gap-3">
      <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-amber-50 text-3xl">
        {recipe.image_url ? <img src={recipe.image_url} alt="" className="h-full w-full object-cover" /> : '🍚'}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="line-clamp-2 text-base font-bold text-stone-950">{recipe.title}</h2>
        <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${recipe.source_type === 'imported' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {recipe.source_type === 'imported' ? '가져온 레시피' : '내가 만든 레시피'}
        </span>
        <div className="mt-3 flex items-center gap-3 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1"><Users size={14} />{recipe.servings || 0}인분</span>
        </div>
      </div>
    </div>
  </Link>
)
