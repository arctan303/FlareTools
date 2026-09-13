import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// Intercept deep links so Android Back Button goes to Home instead of exiting
if (typeof window !== 'undefined' && window.location.pathname !== '/' && window.history.length <= 2) {
  const currentUrl = window.location.href;
  window.history.replaceState(null, '', '/');
  window.history.pushState(null, '', currentUrl);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
