/** Remounts on navigation between sections, so each page fades up into place. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="mx-page-enter flex flex-1 flex-col">{children}</div>;
}
