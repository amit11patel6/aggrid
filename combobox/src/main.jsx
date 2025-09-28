import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Import Salt Provider and theme
import { SaltProvider } from "@salt-ds/core"
import "@salt-ds/theme/index.css"

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SaltProvider>
      <App />
    </SaltProvider>
  </React.StrictMode>
)
