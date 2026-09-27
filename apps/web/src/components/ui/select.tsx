'use client';

import * as React from 'react';
import { Select as S } from 'radix-ui';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inputClass } from './control-styles';

// Radix keeps '' for "nothing selected", but our menus use it for "Any" or "None".
const EMPTY = '\u0000none';
const toItem = (v: string) => (v === '' ? EMPTY : v);
const fromItem = (v: string) => (v === EMPTY ? '' : v);

interface Option {
  value: string;
  label: React.ReactNode;
  text: string;
  disabled?: boolean;
}
interface Group {
  label: string | null;
  options: Option[];
}

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node))
    return textOf(node.props.children);
  return '';
}

type OptionProps = { value?: string | number; disabled?: boolean; children?: React.ReactNode };
type GroupProps = { label?: string; children?: React.ReactNode };

/** Read <option> and <optgroup> children, the same markup a native select takes. */
function readOptions(children: React.ReactNode): Group[] {
  const groups: Group[] = [];
  const loose: Option[] = [];
  const toOption = (el: React.ReactElement<OptionProps>): Option => ({
    value: String(el.props.value ?? textOf(el.props.children)),
    label: el.props.children,
    text: textOf(el.props.children),
    disabled: el.props.disabled,
  });
  const walk = (nodes: React.ReactNode, into: Option[]) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === React.Fragment) {
        walk((child.props as { children?: React.ReactNode }).children, into);
      } else if (child.type === 'option') {
        into.push(toOption(child as React.ReactElement<OptionProps>));
      } else if (child.type === 'optgroup') {
        if (loose.length) groups.push({ label: null, options: loose.splice(0) });
        const props = child.props as GroupProps;
        const options: Option[] = [];
        walk(props.children, options);
        groups.push({ label: props.label ?? null, options });
      }
    });
  };
  walk(children, loose);
  if (loose.length) groups.push({ label: null, options: loose });
  return groups;
}

export interface SelectProps {
  id?: string;
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  /** <option> elements (optionally inside <optgroup>), as for a native select. */
  children: React.ReactNode;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}

/**
 * A dropdown with a styled list, keyboard support (arrows, typeahead, Home/End) and screen reader
 * semantics from Radix. With `name` it also submits with its form like a native select.
 */
export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    name,
    value,
    defaultValue,
    onValueChange,
    disabled,
    required,
    placeholder,
    className,
    children,
    ...aria
  },
  ref,
) {
  const groups = readOptions(children);
  const options = groups.flatMap((g) => g.options);
  const controlled = value !== undefined;
  const [inner, setInner] = React.useState(
    defaultValue !== undefined ? String(defaultValue) : (options[0]?.value ?? ''),
  );
  const current = controlled ? String(value) : inner;
  // Like a native select, a value that isn't one of the options shows the first option.
  const shown = options.some((o) => o.value === current) ? current : (options[0]?.value ?? '');

  return (
    <S.Root
      value={toItem(shown)}
      onValueChange={(v) => {
        const next = fromItem(v);
        if (!controlled) setInner(next);
        onValueChange?.(next);
      }}
      disabled={disabled}
      required={required}
    >
      <S.Trigger
        ref={ref}
        {...aria}
        className={cn(
          inputClass,
          'group flex h-10 cursor-pointer items-center justify-between gap-2 text-start data-[placeholder]:text-muted',
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <S.Value placeholder={placeholder} />
        </span>
        <S.Icon asChild>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted transition-transform duration-200 ease-[var(--mx-ease)] group-data-[state=open]:rotate-180"
          />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className="mx-menu z-50 max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-ui border border-border bg-surface text-fg shadow-xl"
        >
          <S.ScrollUpButton className="flex h-6 cursor-default items-center justify-center text-muted">
            <ChevronUp aria-hidden className="size-4" />
          </S.ScrollUpButton>
          <S.Viewport className="p-1">
            {groups.map((g, gi) =>
              g.label ? (
                <S.Group key={gi}>
                  <S.Label className="px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                    {g.label}
                  </S.Label>
                  {g.options.map((o) => (
                    <Item key={o.value} option={o} />
                  ))}
                </S.Group>
              ) : (
                g.options.map((o) => <Item key={o.value} option={o} />)
              ),
            )}
          </S.Viewport>
          <S.ScrollDownButton className="flex h-6 cursor-default items-center justify-center text-muted">
            <ChevronDown aria-hidden className="size-4" />
          </S.ScrollDownButton>
        </S.Content>
      </S.Portal>
      {name && (
        // What the form submits (Radix's own hidden select can't carry our '' values).
        <select
          aria-hidden
          tabIndex={-1}
          name={name}
          value={current}
          required={required}
          disabled={disabled}
          onChange={() => {}}
          className="sr-only"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.text}
            </option>
          ))}
        </select>
      )}
    </S.Root>
  );
});

function Item({ option }: { option: Option }) {
  return (
    <S.Item
      value={toItem(option.value)}
      disabled={option.disabled}
      className="relative flex cursor-pointer items-center rounded-ui-sm py-2 ps-2.5 pe-9 text-sm outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 data-[state=checked]:font-semibold data-[state=checked]:text-primary"
    >
      <S.ItemText>{option.label}</S.ItemText>
      <S.ItemIndicator className="absolute end-2.5 inline-flex">
        <Check aria-hidden className="size-4" />
      </S.ItemIndicator>
    </S.Item>
  );
}
