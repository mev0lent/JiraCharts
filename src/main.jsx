import React from 'react';
import { createRoot } from 'react-dom/client';
import { BurndownPage } from './pages/BurndownPage.jsx';
import './styles/burndown-colors.scss';
import './styles/app.css';

function App() {
  return <BurndownPage />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
