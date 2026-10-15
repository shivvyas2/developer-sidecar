import type { Category, FeedStep } from '@sidecar/shared'

const ICON: Record<Category, string> = {
  prompt: '💬', subagent: '👥', mcp: '🤝', git: '📦', install: '🧰', test: '✅', deploy: '🚀',
  run: '🔑', data: '🗄️', external: '🔌', read: '🔍', create: '🧱', edit: '🔧', fallback: '💭',
}

export function stepIcon(step: FeedStep): string {
  if (step.category === 'test' && step.status === 'failed') return '❌'
  return ICON[step.category]
}
