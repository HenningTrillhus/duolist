// Deploy via the Supabase dashboard: Edge Functions -> Create function
// "send-push" -> paste this file's contents. Then set these secrets under
// Edge Functions -> send-push -> Secrets:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:duolist@example.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

// The app calls this function directly from the browser (supabase.functions
// .invoke), so it needs CORS headers on every response, including the
// preflight OPTIONS request the browser sends first.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const { excludeUser, title, body, url } = await req.json()

  const query = excludeUser
    ? `user_name=neq.${encodeURIComponent(excludeUser)}`
    : ''
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?${query}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  })
  const subs: PushSubscriptionRow[] = await res.json()

  const payload = JSON.stringify({ title, body, url: url || '/' })

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ),
    ),
  )

  // Prune subscriptions the push service says no longer exist.
  await Promise.all(
    results.map((result, i) => {
      if (result.status !== 'rejected') return Promise.resolve()
      const statusCode = (result.reason as { statusCode?: number })?.statusCode
      if (statusCode !== 404 && statusCode !== 410) return Promise.resolve()
      return fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${subs[i].id}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      })
    }),
  )

  return new Response(JSON.stringify({ sent: subs.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
