import { Clock, Heart, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Recipe } from '../../types/recipe'

export const RecipeCard = ({ recipe }: { recipe: Recipe }) => (
  <Link to={`/recipes/${recipe.id}`} className="block rounded-xl border border-amber-100 bg-white p-3 shadow-sm">
    <div className="flex gap-3">
      <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-amber-50 text-3xl">
        {recipe.image_url ? <img src={recipe.image_url} alt="" className="h-full w-full object-cover" /> : '🍚'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="line-clamp-2 text-base font-bold text-stone-950">{recipe.title}</h2>
          <Heart size={18} className={recipe.is_favorite ? 'fill-rose-500 text-rose-500' : 'text-stone-300'} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {recipe.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1"><Clock size={14} />{recipe.cooking_time || '확인 필요'}</span>
          <span className="inline-flex items-center gap-1"><Users size={14} />{recipe.servings || 0}인분</span>
        </div>
      </div>
    </div>
  </Link>
)
