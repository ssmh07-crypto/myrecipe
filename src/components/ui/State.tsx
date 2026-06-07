import type { ReactNode } from 'react'

export const LoadingState = ({ label = '불러오는 중입니다.' }: { label?: string }) => (
  <div className="rounded-lg border border-amber-100 bg-white p-6 text-center text-sm text-stone-500">{label}</div>
)

export const EmptyState = ({ title, description, action }: { title: string; description?: string; action?: ReactNode }) => (
  <div className="rounded-lg border border-dashed border-amber-200 bg-white/70 p-6 text-center">
    <p className="text-base font-semibold text-stone-900">{title}</p>
    {description ? <p className="mt-2 text-sm text-stone-500">{description}</p> : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
)

export const ErrorState = ({ message }: { message: string }) => (
  <div className="rounded-lg border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{message}</div>
)
