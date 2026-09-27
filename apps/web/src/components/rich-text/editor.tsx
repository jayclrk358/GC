'use client';

import * as React from 'react';
import { EditorContent, mergeAttributes, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { useTranslations } from 'next-intl';
import {
  Bold,
  Code,
  EyeOff,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import { isSafeHref, type RichNode } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { usePrefs } from '@/components/shell/prefs-provider';
import { uploadImage, UploadProgress } from '@/components/upload/image-upload';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';
import { mentionExtension } from './mentions';
import { Spoiler } from './extensions';

/** Images reference upload keys; the editor maps them to URLs only for display. */
const UploadImage = Image.extend({
  parseHTML() {
    return [];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(HTMLAttributes, { src: mediaUrl(String(HTMLAttributes.src ?? '')) ?? '' }),
    ];
  },
});

interface ToolButton {
  id: string;
  label: string;
  icon: React.ReactNode;
  run: (e: Editor) => void;
  active?: (e: Editor) => boolean;
  disabled?: (e: Editor) => boolean;
}

export function RichTextEditor({
  value,
  onChange,
  label,
  placeholder,
  communityId,
  requireAlt,
  minHeight = '10rem',
  describedBy,
  mentions,
  onSubmitShortcut,
  autoFocus,
}: {
  value: RichNode | null | undefined;
  onChange: (doc: RichNode) => void;
  label: string;
  placeholder?: string;
  communityId?: string;
  requireAlt?: boolean;
  minHeight?: string;
  describedBy?: string;
  /** Enable @mentions of this community's members and roles. */
  mentions?: string;
  /** Called on Ctrl/Cmd+Enter (e.g. to submit a reply). */
  onSubmitShortcut?: () => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations('editor');
  const { prefs } = usePrefs();
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [pendingImage, setPendingImage] = React.useState<{ key: string; url: string } | null>(null);
  const [alt, setAlt] = React.useState('');
  const [imageError, setImageError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const fileInputId = React.useId();
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const submitRef = React.useRef(onSubmitShortcut);
  React.useEffect(() => {
    submitRef.current = onSubmitShortcut;
  });

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? 'end' : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ['https', 'http', 'mailto'],
          isAllowedUri: (url) => isSafeHref(url),
          HTMLAttributes: { rel: 'noopener noreferrer nofollow ugc', target: null },
        },
      }),
      UploadImage.configure({ inline: false, allowBase64: false }),
      Spoiler,
      Placeholder.configure({ placeholder: placeholder ?? t('placeholder') }),
      ...(mentions ? [mentionExtension(mentions)] : []),
    ],
    content: value ?? undefined,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        class: 'prose-mx px-3 py-2 outline-none',
        style: `min-height:${minHeight}`,
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && submitRef.current) {
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
    },
    // Plain objects only: ProseMirror attrs have a null prototype that server actions reject.
    onUpdate: ({ editor: e }) => onChange(JSON.parse(JSON.stringify(e.getJSON())) as RichNode),
    onSelectionUpdate: () => force(),
    onTransaction: () => force(),
  });

  const tools: ToolButton[][] = [
    [
      {
        id: 'bold',
        label: t('bold'),
        icon: <Bold />,
        run: (e) => e.chain().focus().toggleBold().run(),
        active: (e) => e.isActive('bold'),
      },
      {
        id: 'italic',
        label: t('italic'),
        icon: <Italic />,
        run: (e) => e.chain().focus().toggleItalic().run(),
        active: (e) => e.isActive('italic'),
      },
      {
        id: 'strike',
        label: t('strike'),
        icon: <Strikethrough />,
        run: (e) => e.chain().focus().toggleStrike().run(),
        active: (e) => e.isActive('strike'),
      },
      {
        id: 'code',
        label: t('code'),
        icon: <Code />,
        run: (e) => e.chain().focus().toggleCode().run(),
        active: (e) => e.isActive('code'),
      },
      {
        id: 'spoiler',
        label: t('spoiler'),
        icon: <EyeOff />,
        run: (e) => e.chain().focus().toggleSpoiler().run(),
        active: (e) => e.isActive('spoiler'),
      },
      {
        id: 'link',
        label: t('link'),
        icon: <Link2 />,
        run: (e) => {
          setLinkUrl(String(e.getAttributes('link').href ?? ''));
          setLinkError(null);
          setLinkOpen(true);
        },
        active: (e) => e.isActive('link'),
      },
    ],
    [
      {
        id: 'h2',
        label: t('heading2'),
        icon: <Heading2 />,
        run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
        active: (e) => e.isActive('heading', { level: 2 }),
      },
      {
        id: 'h3',
        label: t('heading3'),
        icon: <Heading3 />,
        run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
        active: (e) => e.isActive('heading', { level: 3 }),
      },
      {
        id: 'ul',
        label: t('bulletList'),
        icon: <List />,
        run: (e) => e.chain().focus().toggleBulletList().run(),
        active: (e) => e.isActive('bulletList'),
      },
      {
        id: 'ol',
        label: t('orderedList'),
        icon: <ListOrdered />,
        run: (e) => e.chain().focus().toggleOrderedList().run(),
        active: (e) => e.isActive('orderedList'),
      },
      {
        id: 'quote',
        label: t('quote'),
        icon: <Quote />,
        run: (e) => e.chain().focus().toggleBlockquote().run(),
        active: (e) => e.isActive('blockquote'),
      },
      {
        id: 'codeblock',
        label: t('codeBlock'),
        icon: <SquareCode />,
        run: (e) => e.chain().focus().toggleCodeBlock().run(),
        active: (e) => e.isActive('codeBlock'),
      },
      {
        id: 'hr',
        label: t('divider'),
        icon: <Minus />,
        run: (e) => e.chain().focus().setHorizontalRule().run(),
      },
      {
        id: 'image',
        label: t('image'),
        icon: <ImagePlus />,
        run: () => document.getElementById(fileInputId)?.click(),
      },
    ],
    [
      {
        id: 'undo',
        label: t('undo'),
        icon: <Undo2 />,
        run: (e) => e.chain().focus().undo().run(),
        disabled: (e) => !e.can().undo(),
      },
      {
        id: 'redo',
        label: t('redo'),
        icon: <Redo2 />,
        run: (e) => e.chain().focus().redo().run(),
        disabled: (e) => !e.can().redo(),
      },
    ],
  ];

  // Toolbar keyboard pattern: one tab stop, arrow keys move between buttons.
  const [focusIndex, setFocusIndex] = React.useState(0);
  const flat = tools.flat();
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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setImageError(null);
    try {
      const r = await uploadImage(file, 'content', communityId, { onProgress: setUploadProgress });
      setAlt('');
      setPendingImage({ key: r.key, url: r.url });
    } catch (err) {
      setImageError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const altRequired = requireAlt || prefs.requireAltTextReminder;

  return (
    <div className="rounded-ui border border-muted/70 bg-surface focus-within:border-primary">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label={t('toolbar', { label })}
        onKeyDown={onToolbarKey}
        className="flex flex-wrap items-center gap-0.5 border-b border-border p-1"
      >
        {tools.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && <span aria-hidden className="mx-1 h-5 w-px bg-border" />}
            {group.map((tool) => {
              const index = flat.indexOf(tool);
              const active = editor && tool.active ? tool.active(editor) : undefined;
              return (
                <button
                  key={tool.id}
                  type="button"
                  tabIndex={index === focusIndex ? 0 : -1}
                  onFocus={() => setFocusIndex(index)}
                  aria-label={tool.label}
                  aria-pressed={tool.active ? Boolean(active) : undefined}
                  disabled={
                    !editor ||
                    (tool.disabled ? tool.disabled(editor) : false) ||
                    (tool.id === 'image' && uploading)
                  }
                  onClick={() => editor && tool.run(editor)}
                  className={cn(
                    'grid size-8 place-items-center rounded-ui-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 [&_svg]:size-4',
                    active && 'bg-surface-2 text-primary',
                  )}
                >
                  {tool.icon}
                </button>
              );
            })}
          </React.Fragment>
        ))}
        {uploading && (
          <span className="ms-2 flex w-44 items-center gap-2 text-xs text-muted" role="status">
            <span className="sr-only">{t('uploading')}</span>
            <UploadProgress value={uploadProgress} label={t('uploading')} className="flex-1" />
          </span>
        )}
      </div>
      <input
        id={fileInputId}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={onFile}
        tabIndex={-1}
        aria-hidden
      />
      {imageError && (
        <p role="alert" className="px-3 pt-2 text-sm text-danger">
          {imageError}
        </p>
      )}
      <EditorContent editor={editor} />

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent title={t('linkTitle')} size="sm">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editor) return;
              const url = linkUrl.trim();
              if (!url) {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                setLinkOpen(false);
                return;
              }
              if (!isSafeHref(url)) {
                setLinkError(t('linkInvalid'));
                return;
              }
              if (editor.state.selection.empty && !editor.isActive('link')) {
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: 'text',
                    text: url,
                    marks: [{ type: 'link', attrs: { href: url } }],
                  })
                  .run();
              } else {
                editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
              }
              setLinkOpen(false);
            }}
          >
            <Field label={t('linkUrl')} error={linkError} description={t('linkHint')}>
              {(p) => (
                <Input
                  {...p}
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://"
                  autoFocus
                />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setLinkOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit">{t('apply')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingImage)} onOpenChange={(o) => !o && setPendingImage(null)}>
        <DialogContent title={t('altTitle')} description={t('altDescription')}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editor || !pendingImage) return;
              if (altRequired && !alt.trim()) {
                setImageError(t('altRequired'));
                return;
              }
              editor.chain().focus().setImage({ src: pendingImage.key, alt: alt.trim() }).run();
              setPendingImage(null);
              setImageError(null);
            }}
          >
            {pendingImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pendingImage.url} alt="" className="max-h-48 rounded-ui object-contain" />
            )}
            <Field
              label={t('altLabel')}
              description={t('altHint')}
              required={altRequired}
              error={imageError}
            >
              {(p) => (
                <Textarea
                  {...p}
                  value={alt}
                  maxLength={1000}
                  onChange={(e) => setAlt(e.target.value)}
                  autoFocus
                />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              {!altRequired && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (editor && pendingImage)
                      editor.chain().focus().setImage({ src: pendingImage.key, alt: '' }).run();
                    setPendingImage(null);
                  }}
                >
                  {t('decorative')}
                </Button>
              )}
              <Button type="submit">{t('insertImage')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
