// Marketing page shown to logged-out visitors. Ported from the source
// Promotion component; sign-up/login use the router instead of full page loads.

import { Link, useNavigate } from 'react-router-dom'
import Button from '../Button/Button'
import Logo from '../Logo/Logo'
import './Promotion.css'

export default function Promotion() {
  const navigate = useNavigate()

  const handleSignUp = () => {
    navigate('/register')
  }

  return (
    <div className="promotion-container">
      <section className="promo__section promo__header">
        <Logo />

        <p>
          The fastest, easiest way to create game tokens for your Tabletop Roleplaying Game.
        </p>

        <div className="promo__login_signup">
          <Button className="promotion-button" onClick={handleSignUp} size="large">
            Sign Up Now
          </Button>

          <Link to="/login" className="promo__login">
            login
          </Link>
        </div>
      </section>

      <section className="promo__section">
        <h2>Spend less time prepping and more time playing.</h2>

        <div className="promo__cost-comparison">
          <div className="promo__cost-item">
            <div className="promo__cost-image">
              <img src="/images/cup.png" alt="Cost of a coffee" />
            </div>
            <p className="promo__image_caption">Less than the cost of a coffee</p>
          </div>
          <div className="promo__cost-item">
            <div className="promo__cost-image">
              <img src="/images/bag.png" alt="Bag of tokens" />
            </div>
            <p className="promo__image_caption">Get dozens of custom tokens</p>
          </div>
        </div>
      </section>

      <section className="promo__section">
        <h2>Designed to be as easy as possible to create game tokens</h2>

        <div className="promo__steps">
          <div className="promo__step">
            <div className="promo__step-number">1</div>
            <div className="promo__step-image">
              <img src="/images/create.png" alt="Step 1" />
            </div>
            <p className="promo__image_caption">
              Generate your token images using AI or upload your own
            </p>
          </div>
          <div className="promo__step">
            <div className="promo__step-number">2</div>
            <div className="promo__step-image">
              <img src="/images/sheet.png" alt="Step 2" />
            </div>
            <p className="promo__image_caption">Add tokens to a sheet</p>
          </div>
          <div className="promo__step">
            <div className="promo__step-number">3</div>
            <div className="promo__step-image">
              <img src="/images/printer.png" alt="Step 3" />
            </div>
            <p className="promo__image_caption">Print your sheet onto sticker paper</p>
          </div>
        </div>
      </section>

      <section className="promo__section promo__signup">
        <Button className="promotion-button" onClick={handleSignUp} size="large">
          Sign Up Now
        </Button>
      </section>
    </div>
  )
}
