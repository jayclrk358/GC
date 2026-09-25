import * as React from 'react';
import { isSafeHref, type RichMark, type RichNode } from '@magnox/shared';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';
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

function renderNode(n: RichNode, key: React.Key, headingOffset: number): React.ReactNode {
  const children = n.content?.map((c, i) => renderNode(c, i, headingOffset));
  switch (n.type) {
    case 'doc':
      return <React.Fragment key={key}>{children}</React.Fragment>;
    case 'paragraph':
      return <p key={key}>{children}</p>;
    case 'heading': {
      const level = Math.min(6, Number(n.attrs?.level ?? 2) + headingOffset);
      const Tag = `h${level}` as 'h2';
      return <Tag key={key}>{children}</Tag>;
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
      const src = mediaUrl(String(n.attrs?.src ?? ''));
      if (!src) return null;
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={key} src={src} alt={String(n.attrs?.alt ?? '')} loading="lazy" />;
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

/**
 * Render sanitized rich text. The document must already have passed `sanitizeDoc` on the server;
 * this renderer still only emits allowlisted elements, never raw HTML.
 */
export function RichText({
  doc,
  className,
  headingOffset = 0,
}: {
  doc: RichNode | null | undefined;
  className?: string;
  /** Shift heading levels down so they nest under the surrounding page structure. */
  headingOffset?: number;
}) {
  if (!doc) return null;
  return <div className={cn('prose-mx', className)}>{renderNode(doc, 'root', headingOffset)}</div>;
}
