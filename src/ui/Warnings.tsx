import { useEffect, useState } from 'react';
import type { SimWarning, World } from '../sim/types';

export interface WarningsProps {
  worldRef: React.MutableRefObject<World | null>;
  /** Bumped by the app when the warning list changes, to drive a refresh. */
  count: number;
}

/**
 * Numerical warnings, surfaced rather than swallowed.
 *
 * Collisions are bugs (CLAUDE.md §1.5). In production the app surfaces a
 * numerical warning instead of rendering overlapping vehicles, and the message
 * says what happened and what it implies — never "invalid result".
 */
export function Warnings({ worldRef, count }: WarningsProps) {
  const [warnings, setWarnings] = useState<SimWarning[]>([]);

  useEffect(() => {
    const world = worldRef.current;
    setWarnings(world ? [...world.warnings] : []);
  }, [worldRef, count]);

  if (warnings.length === 0) return null;

  return (
    <aside className="warnings" role="status" aria-live="polite">
      <ul>
        {warnings.slice(-3).map((w) => (
          <li key={`${w.kind}:${w.message}`}>
            {w.message}
            {w.count > 1 && <span className="warnings__count mono"> ×{w.count}</span>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
