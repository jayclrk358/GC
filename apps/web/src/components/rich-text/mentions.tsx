'use client';

import * as React from 'react';
import { mergeAttributes, ReactRenderer } from '@tiptap/react';
import Mention from '@tiptap/extension-mention';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import { AtSign, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

export interface MentionItem {
  kind: 'user' | 'role' | 'everyone';
  id: string;
  label: string;
  detail: string;
  image?: string | null;
  color?: string | null;
}

interface ListProps extends SuggestionProps<MentionItem> {
  listId: string;
}

export interface MentionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const MentionList = React.forwardRef<MentionListHandle, ListProps>(
  function MentionList(props, ref) {
    const [index, setIndex] = React.useState(0);
    const [lastItems, setLastItems] = React.useState(props.items);
    if (props.items !== lastItems) {
      setLastItems(props.items);
      setIndex(0);
    }
    const optionId = (i: number) => `${props.listId}-opt-${i}`;

    React.useEffect(() => {
      // Combobox pattern: the editor keeps focus and points at the highlighted option.
      const dom = props.editor.view.dom;
      if (props.items.length) dom.setAttribute('aria-activedescendant', optionId(index));
      else dom.removeAttribute('aria-activedescendant');
    });

    const select = (i: number) => {
      const item = props.items[i];
      if (item) props.command(item);
    };

    React.useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (!props.items.length) return false;
        if (event.key === 'ArrowDown') {
          setIndex((i) => (i + 1) % props.items.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          setIndex((i) => (i - 1 + props.items.length) % props.items.length);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          select(index);
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="w-72 overflow-hidden rounded-ui border border-border bg-surface text-fg shadow-xl">
        <p role="status" className="sr-only">
          {props.items.length
            ? `${props.items.length} suggestions. Use up and down arrows to choose.`
            : 'No matches'}
        </p>
        {props.items.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted">No matches</p>
        ) : (
          <ul
            id={props.listId}
            role="listbox"
            aria-label="Mention suggestions"
            className="max-h-64 overflow-y-auto p-1"
          >
            {props.items.map((item, i) => (
              <li
                key={`${item.kind}-${item.id}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === index}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(i);
                }}
                onMouseEnter={() => setIndex(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-ui-sm px-2 py-1.5 text-sm',
                  i === index && 'bg-surface-2',
                )}
              >
                {item.kind === 'user' ? (
                  <Avatar src={item.image} name={item.detail || item.label} size={24} />
                ) : item.kind === 'role' ? (
                  <span
                    aria-hidden
                    className="grid size-6 place-items-center rounded-full"
                    style={{ background: item.color ?? 'var(--c-surface-2)' }}
                  >
                    <AtSign className="size-3.5 text-white" />
                  </span>
                ) : (
                  <Users className="size-5 text-muted" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold">@{item.label}</span>
                  <span className="block truncate text-xs text-muted">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);

/** Editors whose @mention suggestions are open (Enter should pick a suggestion, not send). */
const suggesting = new WeakSet<Element>();

export function isSuggesting(dom: Element): boolean {
  return suggesting.has(dom);
}

function setComboboxAttrs(dom: HTMLElement, listId: string | null) {
  // The editor keeps its textbox role; aria-expanded isn't valid there, but autocomplete,
  // controls and active-descendant are, and together they describe the suggestion list.
  if (listId) {
    suggesting.add(dom);
    dom.setAttribute('aria-autocomplete', 'list');
    dom.setAttribute('aria-controls', listId);
  } else {
    suggesting.delete(dom);
    dom.removeAttribute('aria-autocomplete');
    dom.removeAttribute('aria-controls');
    dom.removeAttribute('aria-activedescendant');
  }
}

async function place(element: HTMLElement, rect: DOMRect | null | undefined) {
  if (!rect) return;
  const virtual = { getBoundingClientRect: () => rect };
  const { x, y } = await computePosition(virtual, element, {
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  });
  Object.assign(element.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, zIndex: '60' });
}

/** @-mention support scoped to one community's members and roles. */
/**
 * Suggestions for what's typed after "@": asked for once typing pauses (not on every key), and
 * each answer is remembered for this editor, so backspacing doesn't ask again.
 */
function mentionLookup(communityId: string) {
  const answers = new Map<string, Promise<MentionItem[]>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: ((items: MentionItem[]) => void)[] = [];
  const ask = (query: string) => {
    let answer = answers.get(query);
    if (!answer) {
      answer = fetch(`/api/communities/${communityId}/mentions?q=${encodeURIComponent(query)}`)
        .then(async (r) => (r.ok ? ((await r.json()) as { items: MentionItem[] }).items : []))
        .catch(() => {
          answers.delete(query);
          return [];
        });
      answers.set(query, answer);
    }
    return answer;
  };
  return (query: string) =>
    new Promise<MentionItem[]>((resolve) => {
      const known = answers.get(query);
      if (known) return void known.then(resolve);
      // Earlier keystrokes still waiting get the latest answer (only the latest is shown).
      waiting.push(resolve);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const batch = waiting;
        waiting = [];
        void ask(query).then((items) => batch.forEach((r) => r(items)));
      }, 150);
    });
}

export function mentionExtension(communityId: string) {
  let counter = 0;
  const lookup = mentionLookup(communityId);
  return Mention.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        kind: {
          default: 'user',
          parseHTML: (el) => el.getAttribute('data-kind') ?? 'user',
          renderHTML: (attrs) => ({ 'data-kind': attrs.kind }),
        },
      };
    },
  }).configure({
    HTMLAttributes: { class: 'font-semibold text-primary' },
    renderHTML({ options, node }) {
      return [
        'span',
        mergeAttributes({ 'data-type': 'mention' }, options.HTMLAttributes),
        `@${node.attrs.label ?? node.attrs.id}`,
      ];
    },
    suggestion: {
      char: '@',
      items: ({ query }) => lookup(query),
      command: ({ editor, range, props }) => {
        const item = props as unknown as MentionItem;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: 'mention', attrs: { id: item.id, label: item.label, kind: item.kind } },
            { type: 'text', text: ' ' },
          ])
          .run();
      },
      render: () => {
        let component: ReactRenderer<MentionListHandle, ListProps> | null = null;
        const listId = `mention-list-${++counter}`;
        return {
          onStart: (props) => {
            component = new ReactRenderer(MentionList, {
              props: { ...props, listId },
              editor: props.editor,
            });
            document.body.appendChild(component.element);
            setComboboxAttrs(props.editor.view.dom, listId);
            void place(component.element as HTMLElement, props.clientRect?.());
          },
          onUpdate: (props) => {
            component?.updateProps({ ...props, listId });
            void place(component?.element as HTMLElement, props.clientRect?.());
          },
          onKeyDown: (props) => {
            if (props.event.key === 'Escape') {
              setComboboxAttrs(props.view.dom, null);
              component?.destroy();
              component?.element.remove();
              component = null;
              return true;
            }
            return component?.ref?.onKeyDown(props) ?? false;
          },
          onExit: (props) => {
            setComboboxAttrs(props.editor.view.dom, null);
            component?.destroy();
            component?.element.remove();
            component = null;
          },
        };
      },
    },
  });
}
