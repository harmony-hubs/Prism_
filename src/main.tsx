import React from 'react';
import ReactDOM from 'react-dom/client';
import { Prism } from './app';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="relative z-10 min-h-dvh overflow-y-auto">
      <div className="atmosphere" aria-hidden />
      <Prism />
    </div>
  </React.StrictMode>
);
