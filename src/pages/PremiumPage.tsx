import { CheckCircle, Copy, Crown, Sparkles, TableProperties, Wand2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/Button'

const howItWorks = [
  { icon: Copy, title: 'Copy link', description: '온라인에서 저장하고 싶은 레시피 링크를 복사합니다.' },
  { icon: TableProperties, title: 'Paste', description: '링크를 붙여넣으면 서버가 본문을 정리합니다.' },
  { icon: Wand2, title: 'Auto Magic', description: 'AI가 재료와 조리순서만 깔끔한 초안으로 만듭니다.' },
]

const proFeatures = ['무제한 링크 추출', '광고 없는 레시피 초안', '조리 모드', '레시피북 고급 정리']
const freeFeatures = ['직접 레시피 저장', '레시피북 폴더', '사진 업로드']

export const PremiumPage = () => {
  const [isYearly, setIsYearly] = useState(true)
  const [notice, setNotice] = useState('')

  const price = isYearly ? '7.99' : '9.99'
  const period = isYearly ? '/month (yearly)' : '/month'

  const handleSubscribe = () => {
    setNotice('결제 연동은 준비 중입니다. 지금은 프리미엄 안내 화면만 제공됩니다.')
    window.setTimeout(() => setNotice(''), 3500)
  }

  return (
    <section className="-mx-4 space-y-10 px-5 pb-8 pt-4 text-[#1e1b18]">
      {notice ? <div className="fixed left-4 right-4 top-4 z-50 mx-auto max-w-md rounded-lg bg-[#1e1b18] px-4 py-3 text-sm font-semibold text-white shadow-lg">{notice}</div> : null}

      <section className="text-center">
        <span className="inline-flex rounded-full bg-[#5b7d54] px-4 py-1 text-sm font-semibold text-white">PREMIUM FEATURE</span>
        <h1 className="mt-4 font-serif text-[34px] font-bold leading-10 text-[#9a4022]">Save recipes in one click with link extraction</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-7 text-[#56423c]">
          블로그, 요리 사이트, 영상 링크를 깔끔한 레시피 카드로 바꿔 저장합니다. 복잡한 광고와 긴 설명은 줄이고 조리에 필요한 내용만 남깁니다.
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
            <p className="mt-2 text-sm text-[#56423c]">링크 저장을 자주 쓰는 사용자를 위한 플랜.</p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-[#9a4022]">${price}</span>
              <span className="text-[#56423c]">{period}</span>
            </div>
            <ul className="mt-6 space-y-3">
              {proFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <CheckCircle className="text-[#9a4022]" size={20} />
                  <span className={feature === '무제한 링크 추출' ? 'font-bold' : ''}>{feature}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#f4b400] px-4 py-3 text-sm font-bold text-[#390b00] shadow-lg active:scale-95" onClick={handleSubscribe}>
              <Sparkles size={18} /> Get Premium
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
                ['Link Extraction', false, true],
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
