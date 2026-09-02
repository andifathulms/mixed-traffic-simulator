import { useEffect, useState } from 'react';
import type { Vehicle, World } from '../../sim/types';
import { TYPE_LABELS } from '../render/vehicle-shape';
import { CITATIONS } from '../../sim/defaults';
import { Citation } from '../../ui/Citation';
import './inspector.css';

export interface InspectorProps {
  worldRef: React.MutableRefObject<World | null>;
  selectedVehicle: number | null;
}

interface Snapshot {
  vehicle: Vehicle;
  leaderType: string | null;
}

/**
 * The "show your work" view.
 *
 * For the selected vehicle, the IDM terms live: the free-flow term and the
 * interaction term as two signed bars that sum to the resulting acceleration.
 * Watching the interaction term grow and overwhelm the free-flow term as a gap
 * closes is car-following made visible (DESIGN.md §5.8).
 *
 * Someone who does not believe the simulation must be able to watch one
 * vehicle's arithmetic.
 */
export function Inspector({ worldRef, selectedVehicle }: InspectorProps) {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (selectedVehicle === null) {
      setSnap(null);
      return;
    }
    // Ten times a second: fast enough to watch a gap close, slow enough that
    // the numbers can be read.
    const id = window.setInterval(() => {
      const world = worldRef.current;
      if (!world) return;
      const vehicle = world.vehicles.find((v) => v.id === selectedVehicle);
      if (!vehicle) {
        setSnap(null);
        return;
      }
      const leader =
        vehicle.leaderId === null
          ? null
          : world.vehicles.find((v) => v.id === vehicle.leaderId) ?? null;
      setSnap({
        // Copied, not referenced: the world mutates twenty times a second and
        // React would otherwise render a value that had already changed.
        vehicle: { ...vehicle, params: { ...vehicle.params } },
        leaderType: leader ? `${TYPE_LABELS[leader.type]} #${leader.id}` : null,
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [worldRef, selectedVehicle]);

  if (selectedVehicle === null) {
    return (
      <div className="inspector on-paper">
        <h2 className="inspector__title">Vehicle inspector</h2>
        <p className="inspector__empty">
          Select a vehicle on the road to watch its arithmetic. Click one, or
          focus the road view and use the left and right arrow keys.
        </p>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="inspector on-paper">
        <h2 className="inspector__title">Vehicle inspector</h2>
        <p className="inspector__empty">
          That vehicle has left the corridor. Select another.
        </p>
      </div>
    );
  }

  const v = snap.vehicle;
  const scale = Math.max(1, Math.abs(v.freeTerm), Math.abs(v.interactionTerm));

  return (
    <div className="inspector on-paper">
      <h2 className="inspector__title">
        Vehicle inspector
        <span className="inspector__id mono">
          #{v.id} · {TYPE_LABELS[v.type]}
        </span>
      </h2>

      <dl className="inspector__grid">
        <div>
          <dt>Speed</dt>
          <dd className="mono">{(v.v * 3.6).toFixed(1)} km/h</dd>
        </div>
        <div>
          <dt>Desired speed</dt>
          <dd className="mono">{(v.params.v0 * 3.6).toFixed(1)} km/h</dd>
        </div>
        <div>
          <dt>Gap</dt>
          <dd className="mono">
            {Number.isFinite(v.currentGap) ? `${v.currentGap.toFixed(2)} m` : 'no leader'}
          </dd>
        </div>
        <div>
          <dt>Desired gap</dt>
          <dd className="mono">{v.desiredGap.toFixed(2)} m</dd>
        </div>
        <div>
          <dt>Leader</dt>
          <dd className="mono">{snap.leaderType ?? 'none'}</dd>
        </div>
        <div>
          <dt>Lateral offset</dt>
          <dd className="mono">{v.y.toFixed(2)} m</dd>
        </div>
        <div>
          <dt>Lateral speed</dt>
          <dd className="mono">{v.vLat.toFixed(2)} m/s</dd>
        </div>
        <div>
          <dt>Acceleration</dt>
          <dd className="mono">{v.a.toFixed(3)} m/s²</dd>
        </div>
      </dl>

      {/*
        The two-bar decomposition. This is the important part: the free-flow
        term is what the driver wants, the interaction term is what the leader
        will allow, and the acceleration is their sum.
      */}
      <div className="inspector__terms">
        <h3 className="inspector__subtitle">
          How that acceleration was reached{' '}
          <Citation marker="IDM" text={CITATIONS.idm.text} />
        </h3>

        <TermBar
          label="Free-flow term"
          hint="what this driver would do on an empty road"
          value={v.freeTerm}
          scale={scale}
        />
        <TermBar
          label="Interaction term"
          hint="what the vehicle in front will allow"
          value={v.interactionTerm}
          scale={scale}
        />
        <TermBar label="Sum" hint="the resulting acceleration" value={v.a} scale={scale} strong />
      </div>

      <dl className="inspector__grid inspector__grid--params">
        <div>
          <dt>Safe headway T</dt>
          <dd className="mono">{v.params.T.toFixed(2)} s</dd>
        </div>
        <div>
          <dt>Minimum gap s₀</dt>
          <dd className="mono">{v.params.s0.toFixed(2)} m</dd>
        </div>
        <div>
          <dt>Max acceleration</dt>
          <dd className="mono">{v.params.a.toFixed(2)} m/s²</dd>
        </div>
        <div>
          <dt>Comfortable braking</dt>
          <dd className="mono">{v.params.b.toFixed(2)} m/s²</dd>
        </div>
      </dl>

      <p className="inspector__note">
        Parameters are jittered per vehicle at spawn, so these differ from the
        type defaults. Heterogeneity is what makes jams form.
      </p>
    </div>
  );
}

function TermBar({
  label,
  hint,
  value,
  scale,
  strong,
}: {
  label: string;
  hint: string;
  value: number;
  scale: number;
  strong?: boolean;
}) {
  const fraction = Math.max(-1, Math.min(1, value / scale));
  const width = Math.abs(fraction) * 50;
  return (
    <div className={`term${strong ? ' term--strong' : ''}`}>
      <span className="term__label">
        {label}
        <span className="term__hint">{hint}</span>
      </span>
      <span className="term__track">
        <span className="term__zero" />
        <span
          className="term__bar"
          style={{
            left: fraction < 0 ? `${50 - width}%` : '50%',
            width: `${width}%`,
          }}
        />
      </span>
      <span className="term__value mono">
        {value >= 0 ? '+' : ''}
        {value.toFixed(3)}
      </span>
    </div>
  );
}
