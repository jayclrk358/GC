'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { SwitchField } from '@/components/ui/switch';

/** The VAPID key as the bytes `pushManager.subscribe` wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = 'loading' | 'unsupported' | 'blocked' | 'off' | 'on';

/** Push notifications on this device (each browser or phone is turned on separately). */
export function PushSettings({ publicKey }: { publicKey: string }) {
  const t = useTranslations('notifications.push');
  const [state, setState] = React.useState<State>('loading');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    // What this browser can do, and whether it's subscribed (only known in the browser).
    async function check(): Promise<State> {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
      if (Notification.permission === 'denied') return 'blocked';
      const reg = await navigator.serviceWorker.getRegistration('/');
      return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
    }
    void check()
      .catch((): State => 'off')
      .then(setState);
  }, []);

  async function turnOn() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setState(permission === 'denied' ? 'blocked' : 'off');
      return;
    }
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      }));
    const r = await fetch('/api/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!r.ok) throw new Error(t('failed'));
    setState('on');
    toast.success(t('turnedOn'));
  }

  async function turnOff() {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setState('off');
    toast.success(t('turnedOff'));
  }

  return (
    <section
      aria-labelledby="notif-push-h"
      className="flex flex-col gap-2 rounded-ui-lg border border-border bg-surface p-5"
    >
      <h2 id="notif-push-h" className="text-lg font-bold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('description')}</p>
      {state === 'unsupported' ? (
        <p className="text-sm">{t('unsupported')}</p>
      ) : state === 'blocked' ? (
        <p className="text-sm">{t('blocked')}</p>
      ) : (
        <SwitchField
          label={t('thisDevice')}
          description={t('thisDeviceHint')}
          checked={state === 'on'}
          disabled={state === 'loading' || busy}
          onCheckedChange={async (on) => {
            setBusy(true);
            try {
              await (on ? turnOn() : turnOff());
            } catch (err) {
              toast.error((err as Error).message || t('failed'));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </section>
  );
}
