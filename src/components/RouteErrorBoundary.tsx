import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from './ui/Button'

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route render failed', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-[#fff8f5] p-4">
          <div className="rounded-xl border border-amber-100 bg-white p-5 text-center">
            <p className="font-semibold text-stone-950">페이지를 불러오지 못했습니다.</p>
            <p className="mt-2 text-sm text-stone-500">새 배포 파일을 다시 불러오면 해결될 수 있습니다.</p>
            <Button type="button" className="mt-4" onClick={() => window.location.reload()}>
              다시 불러오기
            </Button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
