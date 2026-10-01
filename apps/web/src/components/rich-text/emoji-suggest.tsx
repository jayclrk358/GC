'use client';

import * as React from 'react';
import { mergeAttributes, Node, ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { emojiImagePath, matchEmoji, STANDARD_EMOJI, type CustomEmoji } from '@magnox/shared';
import { cn } from '@/lib/utils';
import { place, setComboboxAttrs } from './mentions';

/** A suggestion after ":": one of the community's emoji, or a common Unicode one. */
type EmojiItem =
  | { kind: 'custom'; id: string; name: string; url: string }
  | { kind: 'unicode'; name: string; char: string };

interface ListProps extends SuggestionProps<EmojiItem> {
  listId: string;
}

interface ListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const EmojiList = React.forwardRef<ListHandle, ListProps>(function EmojiList(props, ref) {
  const [index, setIndex] = React.useState(0);
  const [lastItems, setLastItems] = React.useState(props.items);
  if (props.items !== lastItems) {
    setLastItems(props.items);
    setIndex(0);
  }
  const optionId = (i: number) => `${props.listId}-opt-${i}`;

  React.useEffect(() => {
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

  if (!props.items.length) {
    return (
      <p role="status" className="sr-only">
        No matching emoji
      </p>
    );
  }
  return (
    <div className="w-64 overflow-hidden rounded-ui border border-border bg-surface text-fg shadow-xl">
      <p role="status" className="sr-only">
        {`${props.items.length} emoji. Use up and down arrows to choose.`}
      </p>
      <ul
        id={props.listId}
        role="listbox"
        aria-label="Emoji suggestions"
        className="max-h-64 overflow-y-auto p-1"
      >
        {props.items.map((item, i) => (
          <li
            key={item.kind === 'custom' ? item.id : `u-${item.name}`}
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
            {item.kind === 'custom' ? (
              // eslint-disable-next-line @next/next/no-img-element -- tiny images served by redirect
              <img src={item.url} alt="" className="size-6 object-contain" />
            ) : (
              <span aria-hidden className="grid size-6 place-items-center text-lg">
                {item.char}
              </span>
            )}
            <span className="truncate font-semibold">:{item.name}:</span>
          </li>
        ))}
      </ul>
    </div>
  );
});

/** The community's emoji, asked for once per editor (the first time ":" is used). */
function emojiSource(communityId: string | undefined) {
  let custom: Promise<EmojiItem[]> | null = null;
  const standard: EmojiItem[] = STANDARD_EMOJI.map(([name, char]) => ({
    kind: 'unicode',
    name,
    char,
  }));
  return async (query: string): Promise<EmojiItem[]> => {
    if (communityId && !custom) {
      custom = fetch(`/api/communities/${communityId}/emoji`)
        .then(async (r) =>
          r.ok
            ? ((await r.json()) as { items: CustomEmoji[] }).items.map((e): EmojiItem => ({
                kind: 'custom',
                ...e,
              }))
            : [],
        )
        .catch(() => {
          custom = null;
          return [];
        });
    }
    const mine = custom ? await custom : [];
    // The community's own come first: they're why people type ":" here.
    return [...matchEmoji(mine, query, 8), ...matchEmoji(standard, query, 8)].slice(0, 10);
  };
}

/**
 * Emoji typed as ":name": the community's custom emoji (stored as an emoji node, drawn as its
 * picture) and common Unicode emoji (inserted as the character).
 */
export function emojiExtension(communityId?: string) {
  let counter = 0;
  const lookup = emojiSource(communityId);
  return Node.create({
    name: 'emoji',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: false,
    addAttributes() {
      return {
        name: { default: '' },
        id: { default: null },
      };
    },
    parseHTML() {
      return [
        {
          tag: 'img[data-emoji]',
          getAttrs: (el) => ({
            name: (el as HTMLElement).getAttribute('data-emoji'),
            id: (el as HTMLElement).getAttribute('data-id'),
          }),
        },
      ];
    },
    renderHTML({ node, HTMLAttributes }) {
      const id = typeof node.attrs.id === 'string' ? node.attrs.id : '';
      return [
        'img',
        mergeAttributes(HTMLAttributes, {
          src: id ? emojiImagePath(id) : '',
          alt: `:${node.attrs.name}:`,
          'data-emoji': node.attrs.name,
          'data-id': id,
          draggable: 'false',
          class: 'mx-emoji',
        }),
      ];
    },
    renderText({ node }) {
      return `:${node.attrs.name}:`;
    },
    addProseMirrorPlugins() {
      return [
        Suggestion<EmojiItem>({
          editor: this.editor,
          pluginKey: new PluginKey('emojiSuggestion'),
          char: ':',
          // Two letters before suggesting, so times (10:30) and smileys (:P) stay as typed.
          allow: ({ range }) => range.to - range.from >= 3,
          items: ({ query }) => lookup(query),
          command: ({ editor, range, props: item }) => {
            const content =
              item.kind === 'custom'
                ? [
                    { type: 'emoji', attrs: { name: item.name, id: item.id } },
                    { type: 'text', text: ' ' },
                  ]
                : `${item.char} `;
            editor.chain().focus().insertContentAt(range, content).run();
          },
          render: () => {
            let component: ReactRenderer<ListHandle, ListProps> | null = null;
            const listId = `emoji-list-${++counter}`;
            const close = (dom: HTMLElement) => {
              setComboboxAttrs(dom, null);
              component?.destroy();
              component?.element.remove();
              component = null;
            };
            return {
              onStart: (props) => {
                component = new ReactRenderer(EmojiList, {
                  props: { ...props, listId },
                  editor: props.editor,
                });
                document.body.appendChild(component.element);
                // Only while there's something to pick: otherwise Enter should still send.
                setComboboxAttrs(props.editor.view.dom, props.items.length ? listId : null);
                void place(component.element as HTMLElement, props.clientRect?.());
              },
              onUpdate: (props) => {
                component?.updateProps({ ...props, listId });
                setComboboxAttrs(props.editor.view.dom, props.items.length ? listId : null);
                void place(component?.element as HTMLElement, props.clientRect?.());
              },
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                  close(props.view.dom);
                  return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit: (props) => close(props.editor.view.dom),
            };
          },
        }),
      ];
    },
  });
}
