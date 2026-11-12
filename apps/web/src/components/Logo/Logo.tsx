import './Logo.css'

export type LogoSize = 'large' | 'small'

export interface LogoProps {
  size?: LogoSize
}

export default function Logo({ size = 'large' }: LogoProps) {
  const sizeClass = size === 'small' ? 'logo--small' : 'logo--large'

  return (
    <span className={`logo ${sizeClass}`}>
      Token Shoppe <span className="logo-beta">beta</span>
    </span>
  )
}
