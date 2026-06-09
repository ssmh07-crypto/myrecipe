import { BookOpen, Link2, Lock, PenLine } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePremiumAccess } from '../hooks/usePremiumAccess'

const OptionCard = ({
  to,
  icon: Icon,
  title,
  description,
  badge,
}: {
  to: string
  icon: LucideIcon
  title: string
  description: string
  badge?: string
}) => (
  <Link to={to} className="block rounded-xl border border-amber-100 bg-white p-5 shadow-sm transition active:scale-[0.98]">
    <div className="flex items-start gap-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#ffdbd0] text-[#9a4022]">
        <Icon size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-stone-950">{title}</h2>
          {badge ? <span className="rounded-full bg-[#5b7d54] px-2 py-0.5 text-[11px] font-bold text-white">{badge}</span> : null}
        </div>
        <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
      </div>
    </div>
  </Link>
)

export const RecipeAddPage = () => (
  <RecipeAddContent />
)

const RecipeAddContent = () => {
  const { hasImportAccess, loading } = usePremiumAccess()
  const importEnabled = !loading && hasImportAccess

  return (
    <section className="space-y-5">
      <div className="rounded-xl bg-[#b95837] p-5 text-white shadow-lg">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/15">
          <BookOpen size={25} />
        </div>
        <h1 className="mt-4 font-serif text-3xl font-bold">레시피 추가</h1>
        <p className="mt-2 text-sm leading-6 text-white/90">직접 기록하거나, 결제 후 웹 레시피 링크를 개인 레시피 초안으로 정리할 수 있습니다.</p>
      </div>

      <div className="space-y-3">
        <OptionCard
          to={importEnabled ? '/recipes/import' : '/premium'}
          icon={importEnabled ? Link2 : Lock}
          title="링크로 가져오기"
          description={importEnabled ? '블로그나 웹사이트 레시피 URL을 붙여넣고 저장 전 초안을 확인합니다.' : '결제 후 링크를 붙여 레시피를 가져오는 기능이 열립니다.'}
          badge={importEnabled ? 'AI' : 'Premium'}
        />
        <OptionCard
          to="/recipes/new"
          icon={PenLine}
          title="나만의 레시피 추가"
          description="사진, 인분, 재료, 양념, 조리순서, 메모를 직접 입력합니다."
        />
      </div>
    </section>
  )
}
