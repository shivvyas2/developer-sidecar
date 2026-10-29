import { expect, test } from 'vitest'
import { vendorKind } from '../src/vendors'

test.each([
  ['Stripe', 'payments'], ['Resend', 'messages'], ['Twilio', 'messages'], ['Clerk', 'login'],
  ['Supabase', 'database'], ['Firebase', 'database'], ['MongoDB', 'database'], ['Neon', 'database'],
  ['AWS', 'cloud'], ['OpenAI', 'ai'], ['Anthropic', 'ai'], ['Vercel', 'hosting'], ['GitHub', 'code'],
  ['Linear', 'other'], ['Slack', 'other'], ['Unknown Co', 'other'],
])('%s is %s', (name, kind) => expect(vendorKind(name)).toBe(kind))
