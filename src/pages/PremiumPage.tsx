import { CheckCircle, Crown, Edit3, FolderHeart, Link2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePremiumAccess } from '../hooks/usePremiumAccess'
import { supabase } from '../lib/supabaseClient'

type BillingPlan = 'yearly' | 'monthly'

const benefits = [
  {
    icon: Link2,
    title: 'Import recipes from web URLs',
    description: 'Convert cooking blog posts into a clean recipe format instantly.',
  },
  {
    icon: Edit3,
    title: 'Review and edit imported drafts',
    description: 'Fine-tune measurements and steps before saving to your collection.',
  },
  {
    icon: FolderHeart,
    title: 'Save to recipe folders',
    description: 'Organize imported and personal recipes by occasion, ingredient, or diet.',
  },
]

const planImports = {
  yearly: ['150 imports/mo', '15 imports/day'],
  monthly: ['100 imports/mo', '10 imports/day'],
}

const BenefitCard = ({ icon: Icon, title, description }: (typeof benefits)[number]) => (
  <div className="flex items-start gap-4 rounded-xl border border-[#ddc1b3]/70 bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#c8f17a] text-[#496800]">
      <Icon size={21} />
    </div>
    <div>
      <h3 className="text-sm font-semibold leading-5 text-[#1b1c1c]">{title}</h3>
      <p className="mt-1 text-xs font-medium leading-4 text-[#564338]">{description}</p>
    </div>
  </div>
)

const PlanCard = ({
  plan,
  title,
  price,
  period,
  recommended,
  active,
  processing,
  onSubscribe,
}: {
  plan: BillingPlan
  title: string
  price: string
  period: string
  recommended?: boolean
  active: boolean
  processing: boolean
  onSubscribe: (plan: BillingPlan) => void
}) => (
  <div
    className={`relative rounded-xl bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition active:scale-[0.99] ${
      recommended ? 'border-2 border-[#974400] ring-4 ring-[#bb5808]/10' : 'border border-[#ddc1b3]/70'
    }`}
  >
    {recommended ? (
      <div className="absolute -top-3 right-6 rounded-full bg-[#974400] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-md">
        Recommended
      </div>
    ) : null}

    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h4 className={`text-[22px] font-semibold leading-7 ${recommended ? 'text-[#974400]' : 'text-[#1b1c1c]'}`}>{title}</h4>
        <div className="mt-1 flex items-baseline gap-1">
          <span className={`${recommended ? 'text-[32px] font-extrabold' : 'text-[28px] font-bold'} text-[#1b1c1c]`}>{price}</span>
          <span className="text-base leading-6 text-[#564338]">{period}</span>
        </div>
      </div>
      {recommended ? (
        <div className="rounded-lg bg-[#c8f17a]/40 px-2 py-1">
          <span className="text-xs font-bold text-[#496800]">Save 16%</span>
        </div>
      ) : null}
    </div>

    <ul className="mb-6 space-y-2">
      {planImports[plan].map((item) => (
        <li key={item} className="flex items-center gap-2 text-sm font-semibold text-[#564338]">
          <CheckCircle size={18} className={recommended ? 'text-[#496800]' : 'text-[#8a7266]'} />
          {item}
        </li>
      ))}
    </ul>

    <button
      type="button"
      className={`min-h-11 w-full rounded-xl px-4 py-2 text-sm font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
        recommended
          ? 'bg-gradient-to-br from-[#974400] to-[#bb5808] text-white shadow-lg'
          : 'border-2 border-[#974400] bg-white text-[#974400] hover:bg-[#974400]/5'
      }`}
      onClick={() => onSubscribe(plan)}
      disabled={processing || active}
    >
      {active ? 'Premium Active' : processing ? 'Processing...' : `Start ${title}`}
    </button>
  </div>
)

export const PremiumPage = () => {
  const { user } = useAuth()
  const { hasImportAccess, refresh } = usePremiumAccess()
  const navigate = useNavigate()
  const [notice, setNotice] = useState('')
  const [processingPlan, setProcessingPlan] = useState<BillingPlan | null>(null)

  const handleSubscribe = async (plan: BillingPlan) => {
    if (!user) {
      navigate('/login')
      return
    }

    setProcessingPlan(plan)
    setNotice('')

    const expiresAt = new Date()
    if (plan === 'yearly') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1)
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1)
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email,
        plan: 'premium',
        premium_started_at: new Date().toISOString(),
        premium_expires_at: expiresAt.toISOString(),
      })

    setProcessingPlan(null)

    if (error) {
      setNotice(error.message)
      window.setTimeout(() => setNotice(''), 4500)
      return
    }

    await refresh()
    setNotice('Premium is active. Link import is now available.')
    window.setTimeout(() => navigate('/recipes/import'), 900)
  }

  return (
    <section className="mx-auto max-w-md space-y-8 pb-8">
      {notice ? <div className="fixed left-4 right-4 top-4 z-50 mx-auto max-w-md rounded-lg bg-[#1b1c1c] px-4 py-3 text-sm font-semibold text-white shadow-lg">{notice}</div> : null}

      <section className="text-center">
        <div className="relative mb-4 h-48 w-full overflow-hidden rounded-xl shadow-md">
          <img
            src="https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&q=80&w=900"
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Crown size={52} className="fill-white text-white" />
          </div>
        </div>
        <h1 className="text-[28px] font-bold leading-[34px] text-[#974400]">Upgrade to Premium</h1>
        <p className="mx-auto mt-1 max-w-sm px-4 text-base leading-6 text-[#564338]">
          Unlock the full potential of your digital cookbook and organize your culinary life with ease.
        </p>
      </section>

      <section className="grid gap-4">
        {benefits.map((benefit) => <BenefitCard key={benefit.title} {...benefit} />)}
      </section>

      <section className="space-y-4">
        <PlanCard
          plan="yearly"
          title="Yearly"
          price="$19"
          period="/year"
          recommended
          active={hasImportAccess}
          processing={processingPlan === 'yearly'}
          onSubscribe={handleSubscribe}
        />
        <PlanCard
          plan="monthly"
          title="Monthly"
          price="$1.90"
          period="/month"
          active={hasImportAccess}
          processing={processingPlan === 'monthly'}
          onSubscribe={handleSubscribe}
        />
      </section>

      <footer className="pb-4 text-center">
        <p className="px-4 text-[11px] font-medium leading-relaxed text-[#8a7266]">
          Legal Note: Video content, social media posts, paywalled websites, and copyright-infringing imports are not supported.
          Imports depend on source website structure.
        </p>
        {hasImportAccess ? (
          <button
            type="button"
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#c8f17a] px-4 py-2 text-sm font-bold text-[#364e00] active:scale-95"
            onClick={() => navigate('/recipes/import')}
          >
            <Sparkles size={18} />
            Import a recipe
          </button>
        ) : null}
      </footer>
    </section>
  )
}
