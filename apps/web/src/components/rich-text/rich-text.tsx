import * as React from 'react';
import { useTranslations } from 'next-intl';
import { docHeadings, isSafeHref, type RichMark, type RichNode } from '@magnox/shared';
import { imgSources } from '@/lib/media';
import { cn } from '@/lib/utils';
import { MediaScope } from '@/components/media/media-scope';
import { Spoiler } from './spoiler';

function renderText(text: string, marks: RichMark[] | undefined, key: React.Key): React.ReactNode {
  let node: React.ReactNode = text;
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        node = <strong>{node}</strong>;
        break;
      case 'italic':
        node = <em>{node}</em>;
        break;
      case 'strike':
        node = <s>{node}</s>;
        break;
      case 'code':
        node = <code>{node}</code>;
        break;
      case 'spoiler':
        node = <Spoiler>{node}</Spoiler>;
        break;
      case 'link': {
        const href = mark.attrs.href;
        if (!isSafeHref(href)) break;
        const external = /^https?:\/\//i.test(href);
        node = (
          <a href={href} rel={external ? 'noopener noreferrer nofollow ugc' : undefined}>
            {node}
          </a>
        );
        break;
      }
    }
  }
  return <React.Fragment key={key}>{node}</React.Fragment>;
}

interface RenderOpts {
  headingOffset: number;
  /** Heading anchor ids in document order, consumed as headings render. */
  anchors?: { ids: string[]; next: number };
  /** Name for an image button whose image has no alt text. */
  viewLabel: string;
}

function renderNode(n: RichNode, key: React.Key, opts: RenderOpts): React.ReactNode {
  const children = n.content?.map((c, i) => renderNode(c, i, opts));
  switch (n.type) {
    case 'doc':
      return <React.Fragment key={key}>{children}</React.Fragment>;
    case 'paragraph':
      return <p key={key}>{children}</p>;
    case 'heading': {
      const level = Math.min(6, Number(n.attrs?.level ?? 2) + opts.headingOffset);
      const Tag = `h${level}` as 'h2';
      const id = opts.anchors ? opts.anchors.ids[opts.anchors.next++] : undefined;
      return (
        <Tag key={key} id={id} className={id ? 'scroll-mt-24' : undefined}>
          {children}
        </Tag>
      );
    }
    case 'bulletList':
      return <ul key={key}>{children}</ul>;
    case 'orderedList':
      return (
        <ol key={key} start={Number(n.attrs?.start ?? 1)}>
          {children}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{children}</li>;
    case 'blockquote':
      return <blockquote key={key}>{children}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{n.content?.map((c) => c.text ?? '').join('')}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} />;
    case 'hardBreak':
      return <br key={key} />;
    case 'image': {
      const imgKey = String(n.attrs?.src ?? '');
      // The smaller copy inline; the media viewer shows the full image.
      const src = imgSources(imgKey, 'md');
      if (!src) return null;
      const alt = String(n.attrs?.alt ?? '');
      // Opens in the media viewer (see MediaScope); the image's alt text names the button.
      return (
        <button
          key={key}
          type="button"
          data-mx-view={imgKey}
          aria-label={alt ? undefined : opts.viewLabel}
          className="mx-view block cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...src} alt={alt} loading="lazy" decoding="async" />
        </button>
      );
    }
    case 'mention': {
      const label = String(n.attrs?.label ?? n.attrs?.id ?? '');
      if (n.attrs?.kind === 'user' && label) {
        return (
          <a key={key} href={`/u/${encodeURIComponent(label)}`} className="font-semibold">
            @{label}
          </a>
        );
      }
      return (
        <span key={key} className="font-semibold text-primary">
          @{label}
        </span>
      );
    }
    case 'emoji':
      return <span key={key}>:{String(n.attrs?.name ?? '')}:</span>;
    case 'text':
      return renderText(n.text ?? '', n.marks, key);
    default:
      return null;
  }
}

function hasImage(n: RichNode): boolean {
  return n.type === 'image' || Boolean(n.content?.some(hasImage));
}

/**
 * Render sanitized rich text. The document must already have passed `sanitizeDoc` on the server;
 * this renderer still only emits allowlisted elements, never raw HTML.
 */
export function RichText({
  doc,
  className,
  headingOffset = 0,
  anchors = false,
}: {
  doc: RichNode | null | undefined;
  className?: string;
  /** Shift heading levels down so they nest under the surrounding page structure. */
  headingOffset?: number;
  /** Give headings ids (from `docHeadings`) so a table of contents can link to them. */
  anchors?: boolean;
}) {
  const t = useTranslations('media');
  if (!doc) return null;
  const opts: RenderOpts = {
    headingOffset,
    anchors: anchors ? { ids: docHeadings(doc).map((h) => h.id), next: 0 } : undefined,
    viewLabel: t('viewNoAlt'),
  };
  const body = renderNode(doc, 'root', opts);
  return hasImage(doc) ? (
    <MediaScope className={cn('prose-mx', className)}>{body}</MediaScope>
  ) : (
    <div className={cn('prose-mx', className)}>{body}</div>
  );
}
