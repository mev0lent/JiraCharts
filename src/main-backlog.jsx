import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import './styles/burndown-colors.scss';
import { BacklogPage } from './pages/BacklogPage.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BacklogPage />
  </StrictMode>,
);
