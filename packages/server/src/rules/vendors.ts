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
