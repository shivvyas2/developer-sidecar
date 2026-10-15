import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { themeCss } from '@sidecar/ui-kit'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/dotgothic16/400.css'
import '@fontsource-variable/inter'
import { App } from './App'
import './styles.css'

const theme = document.createElement('style')
theme.textContent = themeCss()
document.head.append(theme)

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
