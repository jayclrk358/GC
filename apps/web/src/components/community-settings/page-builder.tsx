'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, ExternalLink, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { BLOCK_TYPES, type Block, type BlockType } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge, EmptyState } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import { addBlockAction, deleteBlockAction, reorderBlocksAction, updateBlockAction } from '@/app/actions/blocks';
import { cn } from '@/lib/utils';
import { BlockForm, blockTitle, type BlockFormContext } from './block-forms';

function SortableItem({
  block,
  index,
  total,
  onMove,
  onEdit,
  onDelete,
  onToggle,
}: {
  block: Block;
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (visible: boolean) => void;
}) {
  const t = useTranslations('blocks');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const typeName = t(`types.${block.type}.name`);
  const title = blockTitle(block, typeName);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-ui border border-border bg-surface p-3',
        isDragging && 'relative z-10 shadow-xl ring-2 ring-primary',
        !block.visible && 'opacity-70',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="grid size-9 cursor-grab place-items-center rounded-ui-sm text-muted hover:bg-surface-2 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={t('dragHandle', { name: title })}
      >
        <GripVertical className="size-5" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{title}</p>
        <p className="text-sm text-muted">
          {typeName}
          {!block.visible && (
            <Badge className="ms-2" tone="warning">
              {t('hidden')}
            </Badge>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={t('moveUp', { name: title })}>
          <ArrowUp aria-hidden />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={index === total - 1} onClick={() => onMove(index, index + 1)} aria-label={t('moveDown', { name: title })}>
          <ArrowDown aria-hidden />
        </Button>
        <label className="flex items-center gap-2 px-2 text-sm">
          <Switch checked={block.visible} onCheckedChange={onToggle} aria-label={t('visibleToggle', { name: title })} />
          <span aria-hidden className="hidden sm:inline">
            {t('visible')}
          </span>
        </label>
        <Button size="sm" variant="secondary" onClick={onEdit}>
          <Pencil aria-hidden /> {t('edit')}
          <span className="sr-only"> {title}</span>
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label={t('deleteBlock', { name: title })}>
          <Trash2 aria-hidden />
        </Button>
      </div>
    </li>
  );
}

export function PageBuilder({
  communityId,
  slug,
  initialBlocks,
  roles,
  servers,
  requireAlt,
}: {
  communityId: string;
  slug: string;
  initialBlocks: Block[];
  roles: { id: string; name: string }[];
  servers: { id: string; name: string }[];
  requireAlt: boolean;
}) {
  const t = useTranslations('blocks');
  const [blocks, setBlocks] = React.useState(initialBlocks);
  const [editing, setEditing] = React.useState<Block | null>(null);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Block | null>(null);
  const [status, setStatus] = React.useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nameOf = React.useCallback(
    (id: string | number) => {
      const b = blocks.find((x) => x.id === id);
      return b ? blockTitle(b, t(`types.${b.type}.name`)) : '';
    },
    [blocks, t],
  );
  const positionOf = (id: string | number | undefined) => blocks.findIndex((b) => b.id === id) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => t('dnd.start', { name: nameOf(active.id), position: positionOf(active.id), total: blocks.length }),
    onDragOver: ({ active, over }) => (over ? t('dnd.over', { name: nameOf(active.id), position: positionOf(over.id), total: blocks.length }) : ''),
    onDragEnd: ({ active, over }) => (over ? t('dnd.end', { name: nameOf(active.id), position: positionOf(over.id), total: blocks.length }) : t('dnd.cancel', { name: nameOf(active.id) })),
    onDragCancel: ({ active }) => t('dnd.cancel', { name: nameOf(active.id) }),
  };

  async function persistOrder(next: Block[], previous: Block[]) {
    setBlocks(next);
    const r = await reorderBlocksAction(communityId, next.map((b) => b.id));
    if (!r.ok) {
      setBlocks(previous);
      toast.error(r.error);
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= blocks.length) return;
    const next = arrayMove(blocks, from, to);
    setStatus(t('dnd.end', { name: nameOf(blocks[from]!.id), position: to + 1, total: blocks.length }));
    void persistOrder(next, blocks);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    void persistOrder(arrayMove(blocks, from, to), blocks);
  }

  async function add(type: BlockType) {
    const r = await addBlockAction(communityId, type);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setBlocks((b) => [...b, r.data]);
    setStatus(t('added', { name: t(`types.${type}.name`) }));
    openEditor(r.data);
  }

  function openEditor(block: Block) {
    setEditing(block);
    setDraft(structuredClone(block.config) as Record<string, unknown>);
    setFields({});
    setFormError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    const r = await updateBlockAction(communityId, editing.id, { config: draft });
    setSaving(false);
    if (!r.ok) {
      setFormError(r.error);
      setFields(r.fields ?? {});
      return;
    }
    setBlocks((bs) => bs.map((b) => (b.id === editing.id ? ({ ...b, config: draft } as Block) : b)));
    setEditing(null);
    toast.success(t('saved'));
  }

  async function toggle(block: Block, visible: boolean) {
    setBlocks((bs) => bs.map((b) => (b.id === block.id ? { ...b, visible } : b)));
    const r = await updateBlockAction(communityId, block.id, { visible });
    if (!r.ok) {
      setBlocks((bs) => bs.map((b) => (b.id === block.id ? { ...b, visible: !visible } : b)));
      toast.error(r.error);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const r = await deleteBlockAction(communityId, deleting.id);
    if (r.ok) {
      setBlocks((bs) => bs.filter((b) => b.id !== deleting.id));
      setStatus(t('deleted', { name: blockTitle(deleting, t(`types.${deleting.type}.name`)) }));
    } else toast.error(r.error);
    setDeleting(null);
  }

  const ctx: BlockFormContext = { communityId, roles, servers, requireAlt, fields };

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus aria-hidden /> {t('add')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[60vh] w-80 overflow-y-auto">
            {BLOCK_TYPES.map((type) => (
              <DropdownMenuItem key={type} onSelect={() => void add(type)} className="flex-col items-start gap-0.5">
                <span className="font-semibold">{t(`types.${type}.name`)}</span>
                <span className="text-xs text-muted">{t(`types.${type}.description`)}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button asChild variant="outline">
          <Link href={`/c/${slug}`}>
            <ExternalLink aria-hidden /> {t('viewPage')}
          </Link>
        </Button>
      </div>
      <p className="text-sm text-muted">{t('reorderHint')}</p>

      {blocks.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyDesc')} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements, screenReaderInstructions: { draggable: t('dnd.instructions') } }}
        >
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-2" aria-label={t('listLabel')}>
              {blocks.map((b, i) => (
                <SortableItem
                  key={b.id}
                  block={b}
                  index={i}
                  total={blocks.length}
                  onMove={move}
                  onEdit={() => openEditor(b)}
                  onDelete={() => setDeleting(b)}
                  onToggle={(v) => void toggle(b, v)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={t('editTitle', { name: t(`types.${editing.type}.name`) })} size="lg">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void saveEdit();
              }}
            >
              <FormError message={formError} />
              <BlockForm block={editing} config={draft} setConfig={setDraft} ctx={ctx} />
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  {t('cancel')}
                </Button>
                <Button type="submit" loading={saving}>
                  {t('save')}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        {deleting && (
          <DialogContent
            size="sm"
            title={t('deleteTitle')}
            description={t('deleteConfirm', { name: blockTitle(deleting, t(`types.${deleting.type}.name`)) })}
          >
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button variant="danger" onClick={() => void confirmDelete()}>
                {t('delete')}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
