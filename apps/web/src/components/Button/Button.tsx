import type { ButtonHTMLAttributes } from 'react'

import './Button.css'

export type ButtonSize = 'small' | 'medium' | 'large'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize
}

export default function Button({ size = 'medium', className, type = 'button', ...props }: ButtonProps) {
  const classes = ['button', `button--${size}`, className].filter(Boolean).join(' ')

  return <button className={classes} type={type} {...props} />
}
