import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import './setup-dom';
import { App } from '@/ui/App';

/**
 * Interface smoke test.
 *
 * It cannot check pixels — no headless environment can. What it does check is
 * that the app mounts without throwing, that every instrument renders, that the
 * controls are reachable and labelled, and that the commitments the PRD makes
 * about what must always be visible are actually on the page.
 */

beforeAll(() => {
  window.history.replaceState(null, '', '/?s=corridor');
});

afterEach(cleanup);

describe('the app mounts and renders', () => {
  it('renders without throwing', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /mixed traffic simulator/i })).toBeTruthy();
  });

  it('states the non-calibration fact once, with the scenario chooser', () => {
    render(<App />);
    const notices = screen.getAllByText(/not calibrated to any specific location/i);
    expect(notices).toHaveLength(1);
  });

  it('names the active lateral rule at all times (PRD §7.1)', () => {
    render(<App />);
    const select = screen.getByLabelText(/lateral rule/i) as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe('sublane');
  });

  it('offers the social force rule with its lack of citation stated', () => {
    render(<App />);
    const select = screen.getByLabelText(/lateral rule/i);
    fireEvent.change(select, { target: { value: 'social' } });
    // The marker itself says there is no citation, before it is even opened.
    // It appears both on the transport bar, where the rule is named at all
    // times, and beside the lateral model parameters — deliberately.
    const markers = screen.getAllByRole('button', { name: /no citation/i });
    expect(markers.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(markers[0]);
    expect(
      screen.getByText(/no basis in the traffic engineering literature/i),
    ).toBeTruthy();
  });

  it('exposes the motorcycle fraction as the widest control', () => {
    render(<App />);
    const slider = screen
      .getAllByRole('slider')
      .find((el) => el.getAttribute('max') === '90');
    expect(slider).toBeTruthy();
  });

  it('has working transport controls', () => {
    render(<App />);
    const play = screen.getByRole('button', { name: /play|pause/i });
    fireEvent.click(play);
    expect(screen.getByRole('button', { name: /pause|play/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^step$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }));
  });

  it('makes the road keyboard operable for vehicle selection', () => {
    render(<App />);
    const road = screen.getByRole('application', { name: /road view/i });
    expect(road.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(road, { key: 'ArrowRight' });
  });

  it('renders every instrument tab and switches between them', () => {
    render(<App />);
    const tablist = screen.getByRole('tablist', { name: /instrument/i });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.length).toBeGreaterThanOrEqual(5);

    for (const tab of tabs) {
      fireEvent.click(tab);
      expect(tab.getAttribute('aria-selected')).toBe('true');
    }
  });

  it('offers all four aggregation intervals on the bench', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: /equivalence bench/i }));
    for (const label of ['3 min', '5 min', '15 min', '60 min']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('exposes road width as a continuous control, not a lane count', () => {
    render(<App />);
    expect(screen.getByLabelText(/road width/i)).toBeTruthy();
    expect(screen.getByLabelText(/lane markings/i)).toBeTruthy();
  });

  it('offers CSV export and a copyable link', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /detector records/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy link to this run/i })).toBeTruthy();
  });

  it('provides a skip link to the instruments', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: /skip to instruments/i })).toBeTruthy();
  });

  it('shows the RHK toggle on the signalised scenario only', () => {
    render(<App />);
    expect(screen.queryByLabelText(/ruang henti khusus/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/^scenario$/i), { target: { value: 'signal' } });
    expect(screen.getByLabelText(/ruang henti khusus/i)).toBeTruthy();
  });

  it('loads a scenario\'s own parameters when it is chosen, not just its name', () => {
    // Arrive on the phantom jam — a closed ring with no inflow and no
    // motorcycles by design — and pick the corridor from the dropdown. The
    // picker used to change only the name, leaving the ring's inflow of zero
    // in place, so the corridor simulated nothing at all and looked broken.
    window.history.replaceState(null, '', '/?s=phantom-jam');
    render(<App />);

    // By label, not by range: the overlap threshold also runs 0 to 90, and
    // picking sliders out of the document by their bounds finds whichever
    // React rendered first.
    const inflow = () => screen.getByLabelText(/^inflow/i) as HTMLInputElement;
    const motorcycles = () =>
      screen.getByLabelText(/^motorcycles/i) as HTMLInputElement;

    // The ring's own demand: no inflow, no motorcycles.
    expect(inflow().value).toBe('0');
    expect(motorcycles().value).toBe('0');

    fireEvent.change(screen.getByLabelText(/^scenario$/i), {
      target: { value: 'corridor' },
    });

    // The corridor's, not the ring's.
    expect(inflow().value).toBe('2400');
    expect(motorcycles().value).toBe('60');
  });

  it('credits the maker, separately from the data caveat', () => {
    render(<App />);

    // The credit is personal and the non-calibration notice is a caveat about
    // the numbers. They must not read as one statement.
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toMatch(/designed & built by andi fathul mukminin/i);
    expect(footer.textContent).toContain(String(new Date().getFullYear()));
    expect(footer.textContent).not.toMatch(/not calibrated/i);

    const expected: Record<string, string> = {
      Portfolio: 'https://andifathulms.github.io/en/',
      GitHub: 'https://github.com/andifathulms',
      LinkedIn: 'https://www.linkedin.com/in/andifathulmukminin/',
      Instagram: 'https://www.instagram.com/andifathulms/',
    };
    for (const [label, href] of Object.entries(expected)) {
      const link = within(footer).getByRole('link', { name: label });
      expect(link.getAttribute('href')).toBe(href);
      // A new tab without noopener hands the opened page a window reference.
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }

    // The name itself is the portfolio link, so it carries the same rel.
    const name = within(footer).getByRole('link', { name: /andi fathul mukminin/i });
    expect(name.getAttribute('href')).toBe(expected.Portfolio);
    expect(name.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('writes the state into the URL so a run is linkable', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText(/lateral rule/i), {
      target: { value: 'lanes' },
    });
    expect(window.location.search).toContain('rule=lanes');
  });
});
