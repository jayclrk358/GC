'use client';

import * as React from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { useTranslations } from 'next-intl';
import { Bold, Code, EyeOff, Italic, List, Quote, SquareCode, Strikethrough } from 'lucide-react';
import { docToText, emptyDoc, isSafeHref, type RichNode } from '@magnox/shared';
import { mentionExtension, isSuggesting } from '@/components/rich-text/mentions';
import { Spoiler } from '@/components/rich-text/extensions';
import { emojiExtension } from '@/components/rich-text/emoji-suggest';
import { cn } from '@/lib/utils';

/**
 * ProseMirror builds node attrs with a null prototype, which server actions can't serialise
 * (they arrive as opaque references). Round-trip through JSON to get plain objects.
 */
export function plainDoc(doc: unknown): RichNode {
  return JSON.parse(JSON.stringify(doc)) as RichNode;
}

export interface ChatEditorHandle {
  focus: () => void;
  clear: () => void;
  setContent: (doc: RichNode) => void;
  getDoc: () => RichNode | null;
}

interface Props {
  label: string;
  placeholder: string;
  communityId: string;
  initial?: RichNode;
  showToolbar?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  onSubmit: (doc: RichNode) => void;
  onChange?: (doc: RichNode, text: string) => void;
  onEscape?: () => boolean | void;
  /** ArrowUp in an empty editor (edit your last message). */
  onArrowUpEmpty?: () => void;
  onPasteFiles?: (files: File[]) => void;
}

/**
 * The chat input. Enter sends and Shift+Enter starts a new line; inside a code block Enter adds
 * a line and Ctrl/Cmd+Enter sends. While @mention suggestions are open, Enter picks one.
 */
export const ChatEditor = React.forwardRef<ChatEditorHandle, Props>(
  function ChatEditor(props, ref) {
    const t = useTranslations('editor');
    const cb = React.useRef(props);
    React.useEffect(() => {
      cb.current = props;
    });
    const [, force] = React.useReducer((x: number) => x + 1, 0);

    const editor = useEditor({
      immediatelyRender: false,
      autofocus: props.autoFocus ? 'end' : false,
      content: props.initial ?? emptyDoc(),
      extensions: [
        StarterKit.configure({
          heading: false,
          horizontalRule: false,
          underline: false,
          link: {
            openOnClick: false,
            autolink: true,
            protocols: ['https', 'http', 'mailto'],
            isAllowedUri: (url) => isSafeHref(url),
            HTMLAttributes: { rel: 'noopener noreferrer nofollow ugc', target: null },
          },
        }),
        Spoiler,
        Placeholder.configure({ placeholder: props.placeholder }),
        mentionExtension(props.communityId),
        emojiExtension(props.communityId),
      ],
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': props.label,
          ...(props.describedBy ? { 'aria-describedby': props.describedBy } : {}),
          class: 'prose-mx chat-body max-h-60 overflow-y-auto px-3 py-2 outline-none',
        },
        handleKeyDown: (view, event) => {
          if (event.isComposing) return false;
          const suggesting = isSuggesting(view.dom);
          const inCode = view.state.selection.$from.parent.type.name === 'codeBlock';
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            cb.current.onSubmit(plainDoc(view.state.doc.toJSON()));
            return true;
          }
          if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !suggesting && !inCode) {
            event.preventDefault();
            cb.current.onSubmit(plainDoc(view.state.doc.toJSON()));
            return true;
          }
          if (event.key === 'Escape' && !suggesting && cb.current.onEscape) {
            return Boolean(cb.current.onEscape());
          }
          if (
            event.key === 'ArrowUp' &&
            !suggesting &&
            cb.current.onArrowUpEmpty &&
            !docToText(view.state.doc.toJSON() as RichNode).trim()
          ) {
            event.preventDefault();
            cb.current.onArrowUpEmpty();
            return true;
          }
          return false;
        },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
            f.type.startsWith('image/'),
          );
          if (files.length && cb.current.onPasteFiles) {
            cb.current.onPasteFiles(files);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: e }) => {
        const doc = e.getJSON() as RichNode;
        cb.current.onChange?.(doc, docToText(doc));
      },
      onTransaction: () => force(),
    });

    React.useImperativeHandle(
      ref,
      () => ({
        focus: () => editor?.commands.focus('end'),
        clear: () => {
          editor?.commands.clearContent(true);
        },
        setContent: (doc) => {
          editor?.commands.setContent(doc);
          editor?.commands.focus('end');
        },
        getDoc: () => (editor ? plainDoc(editor.getJSON()) : null),
      }),
      [editor],
    );

    const tools = [
      {
        id: 'bold',
        label: t('bold'),
        icon: <Bold />,
        run: (e: Editor) => e.chain().focus().toggleBold().run(),
        active: 'bold',
      },
      {
        id: 'italic',
        label: t('italic'),
        icon: <Italic />,
        run: (e: Editor) => e.chain().focus().toggleItalic().run(),
        active: 'italic',
      },
      {
        id: 'strike',
        label: t('strike'),
        icon: <Strikethrough />,
        run: (e: Editor) => e.chain().focus().toggleStrike().run(),
        active: 'strike',
      },
      {
        id: 'code',
        label: t('code'),
        icon: <Code />,
        run: (e: Editor) => e.chain().focus().toggleCode().run(),
        active: 'code',
      },
      {
        id: 'spoiler',
        label: t('spoiler'),
        icon: <EyeOff />,
        run: (e: Editor) => e.chain().focus().toggleSpoiler().run(),
        active: 'spoiler',
      },
      {
        id: 'codeblock',
        label: t('codeBlock'),
        icon: <SquareCode />,
        run: (e: Editor) => e.chain().focus().toggleCodeBlock().run(),
        active: 'codeBlock',
      },
      {
        id: 'quote',
        label: t('quote'),
        icon: <Quote />,
        run: (e: Editor) => e.chain().focus().toggleBlockquote().run(),
        active: 'blockquote',
      },
      {
        id: 'ul',
        label: t('bulletList'),
        icon: <List />,
        run: (e: Editor) => e.chain().focus().toggleBulletList().run(),
        active: 'bulletList',
      },
    ];
    const [focusIndex, setFocusIndex] = React.useState(0);
    const toolbarRef = React.useRef<HTMLDivElement>(null);
    function onToolbarKey(e: React.KeyboardEvent) {
      const buttons = Array.from(
        toolbarRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
      );
      let next = focusIndex;
      if (e.key === 'ArrowRight') next = (focusIndex + 1) % buttons.length;
      else if (e.key === 'ArrowLeft') next = (focusIndex - 1 + buttons.length) % buttons.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = buttons.length - 1;
      else return;
      e.preventDefault();
      setFocusIndex(next);
      buttons[next]?.focus();
    }

    return (
      <div className="min-w-0 flex-1">
        {props.showToolbar && (
          <div
            ref={toolbarRef}
            role="toolbar"
            aria-label={t('toolbar', { label: props.label })}
            onKeyDown={onToolbarKey}
            className="flex flex-wrap items-center gap-0.5 border-b border-border px-1 py-0.5"
          >
            {tools.map((tool, i) => {
              const active = editor?.isActive(tool.active) ?? false;
              return (
                <button
                  key={tool.id}
                  type="button"
                  tabIndex={i === focusIndex ? 0 : -1}
                  onFocus={() => setFocusIndex(i)}
                  aria-label={tool.label}
                  aria-pressed={active}
                  disabled={!editor}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editor && tool.run(editor)}
                  className={cn(
                    'grid size-7 place-items-center rounded-ui-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 [&_svg]:size-4',
                    active && 'bg-surface-2 text-primary',
                  )}
                >
                  {tool.icon}
                </button>
              );
            })}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    );
  },
);
