import { Mark, mergeAttributes } from '@tiptap/react';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spoiler: { toggleSpoiler: () => ReturnType };
  }
}

export const Spoiler = Mark.create({
  name: 'spoiler',
  parseHTML() {
    return [{ tag: 'span[data-spoiler]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-spoiler': '',
        class: 'rounded bg-surface-2 px-1 outline-1 outline-dashed outline-muted',
      }),
      0,
    ];
  },
  addCommands() {
    return {
      toggleSpoiler:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});
