import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  children: ReactNode
}

export const Button = ({ variant = 'primary', className = '', children, ...props }: ButtonProps) => {
  const variants = {
    primary: 'bg-amber-700 text-white shadow-sm active:bg-amber-800',
    secondary: 'bg-white text-stone-900 border border-stone-200',
    ghost: 'bg-transparent text-stone-700',
    danger: 'bg-rose-600 text-white',
  }

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
