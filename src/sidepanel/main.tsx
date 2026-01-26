import { createRoot } from 'react-dom/client'
import { App } from './app'
import './styles.css'

// Root mount element.
const rootElement = document.getElementById('root')

// Bootstrap React app.
if (rootElement)
  createRoot(rootElement).render(<App />)
