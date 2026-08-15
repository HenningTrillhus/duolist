import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

export const pushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  !!VAPID_PUBLIC_KEY

export async function registerServiceWorker(): Promise<void> {
  if (!pushSupported) return
  try {
    await navigator.serviceWorker.register('/sw.js')
  } catch {
    // Ignore: push notifications just won't be available this session.
  }
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported) return null
  try {
    const registration = await navigator.serviceWorker.ready
    return await registration.pushManager.getSubscription()
  } catch {
    return null
  }
}

export async function enablePush(userName: 'Nora' | 'Henning'): Promise<boolean> {
  if (!pushSupported) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
    })
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_name: userName, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
      { onConflict: 'endpoint' },
    )
  return !error
}

export async function disablePush(): Promise<void> {
  if (!pushSupported) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

export async function notifyOthers(params: {
  excludeUser: string
  title: string
  body: string
  url?: string
}): Promise<void> {
  try {
    await supabase.functions.invoke('send-push', { body: params })
  } catch {
    // Non-critical: a failed push delivery shouldn't surface as an app error.
  }
}
