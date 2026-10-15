import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { themeCss } from '@sidecar/ui-kit'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/dotgothic16/400.css'
import '@fontsource-variable/inter'
import './ds'
import { App } from './App'
import { applyTheme, initialTheme, safeStorage } from './theme'
import './styles.css'

const theme = document.createElement('style')
theme.textContent = themeCss()
document.head.append(theme)
// Before first paint, so a forced light or dark theme never flashes the OS one.
applyTheme(document.documentElement, initialTheme(location.search, safeStorage()))

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
