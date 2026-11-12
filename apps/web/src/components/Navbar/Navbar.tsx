import { Link } from 'react-router-dom'
import Account from '../Account/Account'
import CreditBalance from '../CreditBalance/CreditBalance'
import Logo from '../Logo/Logo'
import './Navbar.css'

export default function Navbar() {
  return (
    <nav className="navbar" aria-label="Main">
      <div className="navbar-left">
        <ul className="navbar-links">
          <li>
            <Link to="/" aria-label="Token Shoppe home">
              <Logo size="small" />
            </Link>
          </li>
        </ul>

        <CreditBalance />
      </div>

      <div className="navbar-account">
        <Account />
      </div>
    </nav>
  )
}
