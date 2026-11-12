import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCoins } from '@fortawesome/free-solid-svg-icons'
import { useAuth } from '../../contexts/auth-context'
import { useMe } from '../../hooks/useMe'
import './CreditBalance.css'

export default function CreditBalance() {
  const { user } = useAuth()
  const me = useMe()

  if (!user) {
    return (
      <div className="credit-balance-container">
        <p className="credit-message">Please log in to view your credits</p>
      </div>
    )
  }

  // The profile is bootstrapped lazily; show the source "Loading..." state
  // instead of flashing an undefined balance.
  if (me.isPending) {
    return (
      <div className="credit-balance-container">
        <p className="credit-message">Loading...</p>
      </div>
    )
  }

  return (
    <div
      className="credit-balance-container credit-balance-disabled"
      aria-disabled="true"
      tabIndex={0}
      aria-describedby="credit-balance-tooltip"
    >
      <div className="credit-display">
        <span className="credit-label" aria-label="Credits">
          <FontAwesomeIcon icon={faCoins} />
        </span>
        <span className="credit-amount">{me.data?.profile.credits ?? '—'}</span>
      </div>
      <span id="credit-balance-tooltip" className="credit-tooltip" role="tooltip">
        token purchasing coming soon
      </span>
    </div>
  )
}
