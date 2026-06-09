import { CheckCircle, Copy, Crown, Sparkles, TableProperties, Wand2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'
import { usePremiumAccess } from '../hooks/usePremiumAccess'
import { supabase } from '../lib/supabaseClient'

const howItWorks = [
  { icon: Copy, title: 'Copy link', description: '저장 권한이 있는 웹 레시피 링크를 복사합니다.' },
  { icon: TableProperties, title: 'Paste', description: '공개 웹페이지의 본문을 개인 노트용 초안으로 정리합니다.' },
  { icon: Wand2, title: 'Review draft', description: '저장 전 사용자가 직접 확인하고 수정합니다.' },
]

const proFeatures = ['웹 레시피 링크 정리', '저장 전 초안 편집', '조리 모드', '레시피북 고급 정리']
const freeFeatures = ['직접 레시피 저장', '레시피북 폴더', '사진 업로드']

export const PremiumPage = () => {
  const { user } = useAuth()
  const { hasImportAccess, refresh } = usePremiumAccess()
  const navigate = useNavigate()
  const [isYearly, setIsYearly] = useState(true)
  const [notice, setNotice] = useState('')
  const [processing, setProcessing] = useState(false)

  const price = isYearly ? '7.99' : '9.99'
  const period = isYearly ? '/month (yearly)' : '/month'

  const handleSubscribe = async () => {
    if (!user) {
      navigate('/login')
      return
    }

    setProcessing(true)
    setNotice('')

    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + (isYearly ? 1 : 0))
    if (!isYearly) expiresAt.setMonth(expiresAt.getMonth() + 1)

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email,
        plan: 'premium',
        premium_started_at: new Date().toISOString(),
        premium_expires_at: expiresAt.toISOString(),
      })

    setProcessing(false)

    if (error) {
      setNotice(error.message)
      window.setTimeout(() => setNotice(''), 4500)
      return
    }

    await refresh()
    setNotice('결제가 완료되어 링크로 가져오기 기능이 열렸습니다.')
    window.setTimeout(() => navigate('/recipes/import'), 900)
  }

  return (
    <section className="-mx-4 space-y-10 px-5 pb-8 pt-4 text-[#1e1b18]">
      {notice ? <div className="fixed left-4 right-4 top-4 z-50 mx-auto max-w-md rounded-lg bg-[#1e1b18] px-4 py-3 text-sm font-semibold text-white shadow-lg">{notice}</div> : null}

      <section className="text-center">
        <span className="inline-flex rounded-full bg-[#5b7d54] px-4 py-1 text-sm font-semibold text-white">PREMIUM FEATURE</span>
        <h1 className="mt-4 font-serif text-[34px] font-bold leading-10 text-[#9a4022]">Organize your personal recipe archive</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-7 text-[#56423c]">
          직접 작성한 레시피와 권한이 있는 웹 레시피 페이지를 개인 레시피 카드로 정리합니다. 영상/SNS 자동 추출, 유료 콘텐츠 우회, 저작권 침해 저장은 지원하지 않습니다.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {howItWorks.map(({ icon: Icon, title, description }) => (
          <div key={title} className="rounded-xl bg-[#f5ece7] p-6 text-center shadow-[0_0_20px_rgba(154,64,34,0.08)]">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#b95837] text-white">
              <Icon size={22} />
            </div>
            <h2 className="mt-4 font-serif text-2xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#56423c]">{description}</p>
          </div>
        ))}
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-center gap-4">
          <span className={`text-sm font-semibold ${!isYearly ? 'text-[#9a4022]' : 'text-[#56423c]'}`}>Monthly</span>
          <button type="button" className="relative h-8 w-14 rounded-full bg-[#9a4022] p-1" onClick={() => setIsYearly((value) => !value)} aria-label="결제 주기 변경">
            <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${isYearly ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
          <span className={`text-sm font-semibold ${isYearly ? 'text-[#9a4022]' : 'text-[#56423c]'}`}>Yearly <span className="text-[#43643d]">(Save 20%)</span></span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border-2 border-[#dcc1b9] bg-white p-7">
            <h2 className="font-serif text-2xl font-semibold">Basic</h2>
            <p className="mt-2 text-sm text-[#56423c]">개인 레시피 기록을 위한 기본 기능.</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-[#56423c]">/forever</span>
            </div>
            <ul className="mt-6 space-y-3">
              {freeFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <CheckCircle className="text-[#43643d]" size={20} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button type="button" variant="secondary" className="mt-8 w-full border-[#9a4022] text-[#9a4022]">Current Plan</Button>
          </div>

          <div className="relative overflow-hidden rounded-xl border-2 border-[#9a4022] bg-[#efe6e2] p-7">
            <div className="absolute right-[-38px] top-4 rotate-45 bg-[#9a4022] px-12 py-1 text-[10px] font-bold tracking-widest text-white">POPULAR</div>
            <div className="flex items-center gap-2">
              <Crown className="text-[#9a4022]" size={24} />
              <h2 className="font-serif text-2xl font-semibold">Recipe Pro</h2>
            </div>
            <p className="mt-2 text-sm text-[#56423c]">개인 레시피 아카이브를 더 편하게 관리하는 SaaS 플랜.</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-[#9a4022]">${price}</span>
              <span className="text-[#56423c]">{period}</span>
            </div>
            <ul className="mt-6 space-y-3">
              {proFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <CheckCircle className="text-[#9a4022]" size={20} />
                  <span className={feature === '웹 레시피 링크 정리' ? 'font-bold' : ''}>{feature}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#f4b400] px-4 py-3 text-sm font-bold text-[#390b00] shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-60" onClick={handleSubscribe} disabled={processing || hasImportAccess}>
              <Sparkles size={18} /> {hasImportAccess ? 'Premium Active' : processing ? 'Processing...' : 'Get Premium'}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-center font-serif text-3xl font-bold">Compare features</h2>
        <div className="overflow-hidden rounded-xl border border-[#dcc1b9] bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#dcc1b9]">
                <th className="px-3 py-4 font-semibold">Feature</th>
                <th className="px-3 py-4 text-center font-semibold">Free</th>
                <th className="px-3 py-4 text-center font-semibold text-[#9a4022]">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dcc1b9]">
              {[
                ['Recipe Limit', 'Unlimited', 'Unlimited'],
                ['Authorized Web Recipe Import', false, true],
                ['Cooking Mode', true, true],
                ['Recipe Books', true, true],
              ].map(([feature, free, pro]) => (
                <tr key={String(feature)}>
                  <td className="px-3 py-4">{feature}</td>
                  <td className="px-3 py-4 text-center">{typeof free === 'boolean' ? (free ? <CheckCircle className="mx-auto text-[#43643d]" /> : <XCircle className="mx-auto text-[#ba1a1a]" />) : free}</td>
                  <td className="px-3 py-4 text-center">{typeof pro === 'boolean' ? (pro ? <CheckCircle className="mx-auto text-[#9a4022]" /> : <XCircle className="mx-auto text-[#ba1a1a]" />) : pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="relative h-64 overflow-hidden rounded-xl bg-[#b95837]">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute inset-0 grid place-items-end p-8">
          <p className="font-serif text-2xl italic leading-8 text-white">"Cooking is about focus and passion, not dodging advertisements."</p>
        </div>
      </section>
    </section>
  )
}
