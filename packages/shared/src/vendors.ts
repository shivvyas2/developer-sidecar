const VENDORS: Array<[RegExp, string]> = [
  [/stripe/i, 'Stripe'],
  [/openai/i, 'OpenAI'],
  [/anthropic|claude\.ai/i, 'Anthropic'],
  [/supabase/i, 'Supabase'],
  [/firebase/i, 'Firebase'],
  [/vercel/i, 'Vercel'],
  [/github/i, 'GitHub'],
  [/resend/i, 'Resend'],
  [/twilio/i, 'Twilio'],
  [/clerk/i, 'Clerk'],
  [/linear/i, 'Linear'],
  [/slack/i, 'Slack'],
  [/mongodb|mongoose/i, 'MongoDB'],
  [/neon\.tech|@neondatabase/i, 'Neon'],
  [/aws|amazonaws/i, 'AWS'],
]

export function detectVendor(text: string): string | undefined {
  return VENDORS.find(([re]) => re.test(text))?.[1]
}

/** What a vendor does for the project, so the city can give it a building that fits (a bank for payments). */
export type VendorKind = 'payments' | 'messages' | 'login' | 'database' | 'cloud' | 'ai' | 'hosting' | 'code' | 'other'

const KINDS: Record<string, VendorKind> = {
  Stripe: 'payments',
  Resend: 'messages', Twilio: 'messages',
  Clerk: 'login',
  // Supabase sits with the databases because that is what most projects use it for
  Supabase: 'database', Firebase: 'database', MongoDB: 'database', Neon: 'database',
  AWS: 'cloud',
  OpenAI: 'ai', Anthropic: 'ai',
  Vercel: 'hosting',
  GitHub: 'code',
}

export const vendorKind = (name: string): VendorKind => KINDS[name] ?? 'other'
