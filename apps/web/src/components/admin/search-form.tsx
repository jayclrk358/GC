import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** A plain GET search box: works without JavaScript and keeps the query in the address. */
export function AdminSearch({
  label,
  button,
  defaultValue,
  keep = {},
}: {
  label: string;
  button: string;
  defaultValue: string;
  /** Other filters to carry along with the search. */
  keep?: Record<string, string>;
}) {
  return (
    <form role="search" className="flex gap-2">
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Input
        type="search"
        name="q"
        aria-label={label}
        placeholder={label}
        defaultValue={defaultValue}
        className="max-w-md"
      />
      <Button type="submit" variant="secondary">
        <Search aria-hidden /> {button}
      </Button>
    </form>
  );
}
