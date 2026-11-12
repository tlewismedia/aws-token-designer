import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/auth-context'
import './Account.css'

function getInitials(email: string): string {
  const trimmed = email.trim()
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : 'U'
}

export default function Account() {
  const { user, signOut } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Close the dropdown when clicking anywhere outside it.
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleLogout = async (): Promise<void> => {
    setIsOpen(false)
    await signOut()
    navigate('/')
  }

  return (
    <div className="account-container" ref={dropdownRef}>
      <button
        type="button"
        className="account-avatar"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="avatar-initials">{getInitials(user?.email ?? '')}</span>
      </button>

      {isOpen && (
        <div className="account-dropdown" role="menu">
          <button
            type="button"
            className="dropdown-item"
            role="menuitem"
            onClick={() => void handleLogout()}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}
