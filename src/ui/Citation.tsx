import { useEffect, useId, useRef, useState } from 'react';

export interface CitationProps {
  /** Short inline marker text. */
  marker: string;
  /** What the popover says. */
  text: string;
  /** Rendered on the dark ground rather than on paper. */
  dark?: boolean;
}

/**
 * An inline citation marker opening a dismissible popover.
 *
 * Parameter sources are cited inline throughout (DESIGN.md §7). The social
 * force rule's popover states plainly that it has no traffic-literature basis,
 * which is why the caller passes text rather than the component inferring it.
 */
export function Citation({ marker, text, dark }: CitationProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className={`citation${dark ? ' citation--dark' : ''}`} ref={ref}>
      <button
        type="button"
        className="citation__marker"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {marker}
      </button>
      {open && (
        <span className="citation__popover" id={id} role="note">
          {text}
        </span>
      )}
    </span>
  );
}
