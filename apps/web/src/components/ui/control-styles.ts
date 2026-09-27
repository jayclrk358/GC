/**
 * The look shared by text inputs, text areas and dropdown buttons: a clear border (3:1 against the
 * page, so the box is visible), a stronger border on hover, and the primary colour on focus on top
 * of the site's focus outline.
 */
export const inputClass =
  'w-full rounded-ui border border-muted/70 bg-surface px-3 py-2 text-base text-fg shadow-[inset_0_1px_2px_rgb(0_0_0/0.05)] transition-[border-color,background-color] duration-150 placeholder:text-muted/80 hover:border-muted focus-visible:border-primary aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60 data-[disabled]:cursor-not-allowed data-[disabled]:bg-surface-2 data-[disabled]:opacity-60';
