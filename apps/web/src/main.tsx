import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { themeCss } from '@sidecar/ui-kit'
import { App } from './App'
import './styles.css'

const theme = document.createElement('style')
theme.textContent = themeCss()
document.head.append(theme)

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
