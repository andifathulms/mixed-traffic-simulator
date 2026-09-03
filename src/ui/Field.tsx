import { useId, type ReactNode } from 'react';

/**
 * The parameter field primitives.
 *
 * Every parameter in the app is a label, a current value, a control and — where
 * the value needs defending — a sentence about why it exists. Before, each of
 * the twenty-odd sliders spelled that out by hand, which is how they drifted
 * apart. Now there is one shape, and a reader who has understood one field has
 * understood all of them (DESIGN.md §4.7).
 */

export interface SliderProps {
  label: ReactNode;
  /** The value as the reader should see it, units included. */
  value: string;
  min: number;
  max: number;
  step?: number;
  /** The control's own number, which may be a scaled integer of the value. */
  raw: number;
  onChange: (n: number) => void;
  hint?: ReactNode;
  disabled?: boolean;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  raw,
  onChange,
  hint,
  disabled,
}: SliderProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const fill = max > min ? ((raw - min) / (max - min)) * 100 : 0;

  return (
    <div className="pfield">
      <label className="pfield__head" htmlFor={id}>
        <span className="pfield__label">{label}</span>
        <span className="pfield__value readout">{value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={raw}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && (
        <p className="pfield__hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
}

export function Toggle({ label, checked, onChange, hint }: ToggleProps) {
  return (
    <div className="pfield pfield--toggle">
      <label className="pfield__toggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="pfield__label">{label}</span>
      </label>
      {hint && <p className="pfield__hint">{hint}</p>}
    </div>
  );
}

export interface CardProps {
  title: ReactNode;
  children: ReactNode;
}

/** One group of parameters, on its own plate. */
export function Card({ title, children }: CardProps) {
  return (
    <section className="pcard">
      <h3 className="pcard__title">{title}</h3>
      {children}
    </section>
  );
}
