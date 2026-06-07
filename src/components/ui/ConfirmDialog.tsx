import { Button } from './Button'

export const ConfirmDialog = ({
  open,
  title,
  description,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  onCancel: () => void
  onConfirm: () => void
}) => {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-4 sm:items-center sm:justify-center">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-stone-950">{title}</h2>
        <p className="mt-2 text-sm text-stone-600">{description}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            취소
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm}>
            삭제
          </Button>
        </div>
      </div>
    </div>
  )
}
