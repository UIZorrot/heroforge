import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppLogo } from './components/AppLogo';
import { MonadMintPage } from './components/MonadMintPage';
import './index.css';
import './monad-main.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="monad-site">
      <header className="monad-site-header">
        <a href="/" aria-label="HeroForge game home"><AppLogo compact /></a>
        <a className="monad-site-game-link" href="/">Enter HeroForge ↗</a>
      </header>
      <MonadMintPage />
    </div>
  </StrictMode>,
);
