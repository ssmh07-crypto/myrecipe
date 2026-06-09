import { Crown, Link2, Lock, PenLine, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePremiumAccess } from '../hooks/usePremiumAccess'

const OptionCard = ({
  to,
  icon: Icon,
  title,
  description,
  badge,
  image,
  cta,
  compact = false,
}: {
  to: string
  icon: LucideIcon
  title: string
  description: string
  badge?: string
  image?: string
  cta?: string
  compact?: boolean
}) => (
  <Link
    to={to}
    className="group relative block overflow-hidden rounded-xl border border-[#ddc1b3] bg-white p-4 text-left shadow-sm transition hover:border-[#974400]/30 active:scale-[0.97]"
  >
    {badge ? (
      <div className="absolute right-3 top-3 z-10">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#ffdfa0] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#261a00]">
          <Crown size={12} className="fill-current" />
          {badge}
        </span>
      </div>
    ) : null}

    <div className={compact ? 'flex items-start gap-4' : 'flex flex-col gap-4'}>
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${compact ? 'bg-[#c8f17a] text-[#364e00]' : 'bg-[#ffdbc9] text-[#974400]'}`}>
        <Icon size={27} />
      </span>
      <div className="min-w-0">
        <h2 className="text-[22px] font-semibold leading-7 text-[#1b1c1c] transition group-hover:text-[#974400]">{title}</h2>
        <p className="mt-1 text-base leading-6 text-[#564338]">{description}</p>
      </div>
    </div>

    {image ? (
      <div className="mt-6 h-32 overflow-hidden rounded-lg bg-[#f0eded] opacity-70 transition group-hover:opacity-100">
        <img src={image} alt="" className="h-full w-full object-cover" />
      </div>
    ) : null}

    {cta ? (
      <div className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#974400] px-4 py-2 text-sm font-semibold text-white transition group-active:opacity-80">
        <Plus size={20} />
        <span>{cta}</span>
      </div>
    ) : null}
  </Link>
)

const ImportAccessNote = ({ loading, enabled }: { loading: boolean; enabled: boolean }) => (
  <footer className="px-4 pb-4 text-center">
    <div className="inline-block rounded-full border border-[#ddc1b3] bg-[#f6f3f2] p-1">
      <p className="px-2 py-1 text-xs font-medium leading-4 text-[#564338]">
        {loading
          ? 'Checking your link import access...'
          : enabled
            ? 'Link import is available on your account.'
            : 'Link import is a Premium feature that unlocks faster recipe saving.'}
      </p>
    </div>
  </footer>
)

export const RecipeAddPage = () => (
  <RecipeAddContent />
)

const RecipeAddContent = () => {
  const { hasImportAccess, loading } = usePremiumAccess()
  const importEnabled = !loading && hasImportAccess

  return (
    <section className="mx-auto max-w-md space-y-8 pb-8">
      <div>
        <h1 className="text-[28px] font-bold leading-[34px] text-[#1b1c1c]">New Recipe</h1>
        <p className="mt-1 text-base leading-6 text-[#564338]">How would you like to add your recipe today?</p>
      </div>

      <div className="grid gap-4">
        <OptionCard
          to={importEnabled ? '/recipes/import' : '/premium'}
          icon={importEnabled ? Link2 : Lock}
          title="Import from Link"
          description={importEnabled ? 'Extract a recipe from a blog or website and review it before saving.' : 'Unlock link import to extract recipes from your favorite blogs and websites.'}
          badge="Premium"
          image="https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&q=80&w=900"
        />
        <OptionCard
          to="/recipes/new"
          icon={PenLine}
          title="Write My Own Recipe"
          description="Manually enter ingredients, steps, photos, servings, and personal notes."
          cta="Add Recipe"
          compact
        />
      </div>

      <ImportAccessNote loading={loading} enabled={importEnabled} />
    </section>
  )
}
