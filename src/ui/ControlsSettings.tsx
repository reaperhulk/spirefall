import { useState } from 'react'
import { settings, updateSettings, validBinding } from './settings'
export function ControlsSettings({ onChange }: { onChange: () => void }) {
  const [error, setError] = useState('')
  const controls = { b: 'Beam', v: 'Execute target', g: 'Collect', o: 'Overcharge', r: 'Repair', u: 'Upgrade', x: 'Sell' }
  return <fieldset className="control-settings"><legend>Combat controls</legend>
    <p>Arrows aim and sweep; [ / ] cycle enemies; Enter selects. Rebind actions below.</p>
    {Object.entries(controls).map(([action,label]) => <label key={action}>{label}<input aria-label={`${label} key`} maxLength={1} value={settings.keyBindings[action] ?? action} onChange={e => {
      const key = e.target.value.toLowerCase()
      if (!validBinding(key)) { setError('Choose a letter other than Q W E F C T S M, which are reserved for spells and menus.'); return }
      setError('')
      const used = Object.keys(controls).find(a => a !== action && (settings.keyBindings[a] ?? a) === key)
      const bindings = { ...settings.keyBindings, [action]: key }
      if (used) bindings[used] = settings.keyBindings[action] ?? action
      updateSettings({ keyBindings: bindings }); onChange()
    }} /></label>)}
    {error && <p role="status">{error}</p>}
    <label>Hold beam key<input type="checkbox" checked={settings.holdBeam} onChange={e => { updateSettings({ holdBeam: e.target.checked }); onChange() }} /></label>
  </fieldset>
}
