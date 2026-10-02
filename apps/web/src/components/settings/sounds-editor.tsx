'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Play } from 'lucide-react';
import type { Prefs } from '@magnox/shared';
import {
  DEFAULT_PREFS,
  SOUND_EVENTS,
  SOUND_EVENTS_ON,
  SOUND_PACKS,
  type SoundEvent,
  type SoundPack,
} from '@magnox/shared/prefs-values';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { RadioCards } from '@/components/ui/radio-cards';
import { SwitchField } from '@/components/ui/switch';
import { usePrefs } from '@/components/shell/prefs-provider';
import { EVENT_SAMPLE, previewSound } from '@/lib/sounds';
import { SettingsSection } from './section';

/** What the event plays, as the menu shows it: off, the chosen pack, or a particular pack. */
type Choice = 'off' | 'pack' | SoundPack;

function choiceFor(prefs: Prefs, event: SoundEvent): Choice {
  const set = prefs.soundEvents[event];
  if (set === 'off') return 'off';
  if (set === 'on') return 'pack';
  if (set) return set;
  return SOUND_EVENTS_ON.has(event) ? 'pack' : 'off';
}

/** Store only what differs from the event's default. */
function withChoice(prefs: Prefs, event: SoundEvent, choice: Choice): Prefs['soundEvents'] {
  const next = { ...prefs.soundEvents };
  const usual: Choice = SOUND_EVENTS_ON.has(event) ? 'pack' : 'off';
  if (choice === usual) delete next[event];
  else next[event] = choice === 'pack' ? 'on' : choice;
  return next;
}

export function SoundsEditor() {
  const t = useTranslations('sounds');
  const tp = useTranslations('prefs');
  const { prefs: saved, save } = usePrefs();
  const [prefs, setPrefs] = React.useState<Prefs>(saved);
  const [status, setStatus] = React.useState('');
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const update = React.useCallback(
    (patch: Partial<Prefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        clearTimeout(timer.current);
        setStatus('');
        timer.current = setTimeout(async () => {
          const ok = await save(next);
          setStatus(ok ? tp('saved') : 'Could not save preferences.');
        }, 350);
        return next;
      });
    },
    [save, tp],
  );

  const packName = (pack: SoundPack) => t(`packs.${pack}.name`);
  const volume = prefs.soundVolume || DEFAULT_PREFS.soundVolume;

  return (
    <div className="flex flex-col gap-6">
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <SettingsSection id="sound-effects" title={t('general')}>
        <SwitchField
          label={t('enabled')}
          description={t('enabledDesc')}
          checked={prefs.sounds}
          onCheckedChange={(v) => update({ sounds: v })}
        />
        <Field label={t('volume')} description={`${prefs.soundVolume}%`}>
          {(p) => (
            <input
              {...p}
              type="range"
              min={0}
              max={100}
              step={5}
              value={prefs.soundVolume}
              disabled={!prefs.sounds}
              aria-valuetext={`${prefs.soundVolume}%`}
              onChange={(e) => update({ soundVolume: Number(e.target.value) })}
              // A taste of the new level once it's set.
              onPointerUp={() => previewSound('notification', prefs.soundPack, prefs.soundVolume)}
              onKeyUp={(e) => {
                if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')
                  previewSound('notification', prefs.soundPack, prefs.soundVolume);
              }}
              className="accent-[var(--c-primary)] disabled:opacity-50"
            />
          )}
        </Field>
      </SettingsSection>

      <SettingsSection id="sound-pack" title={t('pack')} description={t('packDesc')}>
        <RadioCards
          label={t('pack')}
          columns={2}
          value={prefs.soundPack}
          onValueChange={(v) => update({ soundPack: v })}
          options={SOUND_PACKS.map((pack) => ({
            value: pack,
            label: packName(pack),
            description: t(`packs.${pack}.description`),
          }))}
        />
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={!prefs.sounds}
            onClick={() => previewSound('mention', prefs.soundPack, volume)}
          >
            <Play aria-hidden /> {t('listen', { pack: packName(prefs.soundPack) })}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection id="sound-events" title={t('when')} description={t('whenDesc')}>
        <ul className="flex flex-col divide-y divide-border">
          {SOUND_EVENTS.map((event) => {
            const choice = choiceFor(prefs, event);
            const name = t(`events.${event}.name`);
            const pack = choice === 'off' ? null : choice === 'pack' ? prefs.soundPack : choice;
            return (
              <li key={event} className="py-3 first:pt-0 last:pb-0">
                <Field label={name} description={t(`events.${event}.description`)}>
                  {(p) => (
                    <div className="flex items-center gap-2">
                      <Select
                        {...p}
                        className="min-w-0 flex-1 sm:max-w-64"
                        value={choice}
                        disabled={!prefs.sounds}
                        onValueChange={(v) =>
                          update({ soundEvents: withChoice(prefs, event, v as Choice) })
                        }
                      >
                        <option value="off">{t('choiceOff')}</option>
                        <option value="pack">
                          {t('choicePack', { pack: packName(prefs.soundPack) })}
                        </option>
                        {SOUND_PACKS.map((p) => (
                          <option key={p} value={p}>
                            {packName(p)}
                          </option>
                        ))}
                      </Select>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={t('play', { name })}
                        disabled={!prefs.sounds || !pack}
                        onClick={() => pack && previewSound(EVENT_SAMPLE[event], pack, volume)}
                      >
                        <Play aria-hidden />
                      </Button>
                    </div>
                  )}
                </Field>
              </li>
            );
          })}
        </ul>
      </SettingsSection>

      <div>
        <Button
          variant="outline"
          onClick={() =>
            update({
              sounds: DEFAULT_PREFS.sounds,
              soundPack: DEFAULT_PREFS.soundPack,
              soundVolume: DEFAULT_PREFS.soundVolume,
              soundEvents: {},
            })
          }
        >
          {t('reset')}
        </Button>
      </div>
    </div>
  );
}
