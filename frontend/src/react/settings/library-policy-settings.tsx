/* Library-level source color and processing mode, placed in each library's title row when "Libraries and folders" is grouped by library,
 * and is written to `media.library_catalog` on "Save settings" (ADR-0116). The explanation of the three processing modes is written only once above the groups;
 * only libraries set to "Custom" expand the five steps. Source color is uncolored by default; open the color ball to pick an accent color. */
import { useRef, useState } from 'react';
import { Dialog, Popover, VisuallyHidden } from 'react-aria-components';
import { UNSAFE_PortalProvider } from 'react-aria';

import { Checkbox } from '@/components/base/checkbox/checkbox';
import { MENU_POPOVER_SURFACE } from '@/components/base/dropdown/menu-styles';
import { Select, SelectItem } from '../components/select';
import { ACCENTS as ACCENT_CHOICES } from '../../appearance/home-glow';
import { previewLibraryColor } from '../components/library-tint';
import { overlayHost } from '../components/overlay-host';
import { Disclosure, Help } from './section';
import { POLICY_COLUMNS, POLICY_COVER_NOTE, POLICY_MATRIX, POLICY_SUMMARY } from './library-policy-copy';
import '../components/glow-preset-grid.css';
import './library-policy-settings.css';

export type Preset = 'auto' | 'local' | 'custom';
export const STAGES = [
  ['probe', 'Read video info'],
  ['metadata', 'Fill in details online'],
  ['cover', 'Fill in covers online'],
  ['people', 'Fill in person images online'],
  ['preview', 'Generate contact sheet previews'],
] as const;
export type Stage = (typeof STAGES)[number][0];
export const AUTO_STAGES: readonly Stage[] = ['probe', 'metadata', 'cover', 'people', 'preview'];
const PRESETS: readonly (readonly [Preset, string, string])[] = [
  ['auto', 'Auto-complete', 'Fills in whatever is missing online'],
  ['local', 'Local details only', 'Offline; uses only local NFO files and images'],
  ['custom', 'Custom', 'Choose the steps one by one'],
];

/** Explanation of the three processing modes, placed once above the groups: one line always shown, with the differences between modes in an expandable comparison table. */
export function PolicyLegend() {
  return (
    <div data-policy-legend="" className="flex flex-col gap-1">
      <Help>{POLICY_SUMMARY}</Help>
      <Disclosure summary="Compare the three processing modes">
        <table data-policy-matrix="" className="text-body-2-regular">
          <thead><tr><th scope="col"><VisuallyHidden>Step</VisuallyHidden></th>
            {POLICY_COLUMNS.map(name => <th key={name} scope="col">{name}</th>)}</tr></thead>
          <tbody>{POLICY_MATRIX.map(([step, ...cells]) => <tr key={step}><th scope="row">{step}</th>
            {cells.map((cell, index) => <td key={POLICY_COLUMNS[index]} data-policy-cell={cell === '✓' ? 'on' : cell === '—' ? 'off' : 'choice'}>
              {cell === '✓' ? <span aria-label="Done">✓</span> : cell === '—' ? <span aria-label="Not done">—</span> : cell}</td>)}</tr>)}</tbody>
        </table>
        <Help>{POLICY_COVER_NOTE}</Help>
      </Disclosure>
    </div>
  );
}

/** The processing mode dropdown in the title row: the top of the popup says what is being chosen, each tier has a one-line description, and only the tier name shows when collapsed. */
export function PresetSelect({ name, value, onChange }: { name: string; value: Preset; onChange(value: Preset): void }) {
  return (
    <Select className="w-full" aria-label={`${name} Processing mode`} selectedKey={value} prefix="Processing mode"
      renderValue={<span className="truncate">{PRESETS.find(([key]) => key === value)?.[1]}</span>}
      onSelectionChange={key => onChange(String(key) as Preset)}>
      {PRESETS.map(([key, label, hint]) => (
        <SelectItem key={key} id={key} textValue={label}>
          <span className="flex min-w-0 flex-col">
            <span>{label}</span>
            <span className="text-body-2-regular text-text-secondary whitespace-normal">{hint}</span>
          </span>
        </SelectItem>
      ))}
    </Select>
  );
}

export function StageChooser({ name, value, onChange }: { name: string; value: readonly Stage[]; onChange(value: readonly Stage[]): void }) {
  return (
    <Disclosure defaultOpen summary={`${name} processing steps (${value.length}/${STAGES.length})`}>
      <div className="flex flex-wrap gap-x-6 gap-y-2" role="group" aria-label={`${name} processing steps`}>
        {STAGES.map(([key, label]) => (
          <Checkbox key={key} isSelected={value.includes(key)}
            onChange={(on) => onChange(on ? [...value, key] : value.filter(stage => stage !== key))}>
            {label}
          </Checkbox>
        ))}
      </div>
    </Disclosure>
  );
}

/** A ball showing the current source color; opening it offers "No color" plus twelve accent colors. */
export function LibraryColorPicker({ id, name, value: color, onChange }: {
  id: string; name: string; value: string; onChange(color: string): void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const label = ACCENT_CHOICES.find(([key]) => key === color)?.[1] || 'No color';
  const choose = (next: string) => { onChange(next); previewLibraryColor(id, next); setOpen(false) };
  return <>
    <button ref={trigger} type="button" className="text-body-medium" data-glow-chip="" data-library-color-trigger="" aria-haspopup="dialog"
      aria-expanded={open} aria-label={`${name || 'Untitled library'} source color: ${label}`} title={label} onClick={() => setOpen(true)}>
      <span aria-hidden className="text-text-tertiary">Source color</span>
      {color
        ? <span data-glow-ball="" aria-hidden="true" data-accent-ball={color} />
        : <span data-glow-ball="" data-library-none="" aria-hidden="true" />}
      <span>{label}</span>
    </button>
    <UNSAFE_PortalProvider getContainer={() => overlayHost(trigger.current)}>
      <Popover triggerRef={trigger} isOpen={open} onOpenChange={setOpen} placement="bottom start" offset={8}
        containerPadding={12} className={MENU_POPOVER_SURFACE}>
        <Dialog aria-label={`${name || 'Untitled library'} source color`} className="outline-none">
          <p className="px-1 pb-2 text-body-medium text-text-primary">Choose source color</p>
          <div data-accent-grid="" data-library-colors="" role="group">
            <button type="button" data-glow-chip="" aria-pressed={!color} title="No color" aria-label="No color"
              onClick={() => choose('')}>
              <span data-glow-ball="" data-library-none="" aria-hidden="true" />
            </button>
            {ACCENT_CHOICES.map(([key, choice]) => (
              <button type="button" key={key} data-glow-chip="" aria-pressed={key === color} title={choice} aria-label={choice}
                onClick={() => choose(key)}>
                <span data-glow-ball="" aria-hidden="true" data-accent-ball={key} />
              </button>
            ))}
          </div>
        </Dialog>
      </Popover>
    </UNSAFE_PortalProvider>
  </>;
}
