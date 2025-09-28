import React, { useState, useMemo } from 'react'
import VirtualCombobox from './VirtualCombobox'
import { Button } from "@salt-ds/core"

export default function App() {
  // sample dataset (can be any objects; using strings here)
  const items = useMemo(() => Array.from({ length: 1000 }, (_, i) => `Item ${i + 1}`), [])

  // separate state for multi-select (array) and single-select (single value)
  const [multiSelected, setMultiSelected] = useState([])
  const [singleSelected, setSingleSelected] = useState(null)

  return (
    <div className="app">
      <h1>Downshift + Virtualized List Demo</h1>
      <p>This demo shows a combobox using Downshift's useCombobox and TanStack React Virtual for virtualization.</p>

      <div style={{ marginBottom: 12 }}>
        <Button>Salt Button</Button>
      </div>

      <h3>Multi-select example</h3>
      <VirtualCombobox
        items={items}
        multiSelect={true}
        selectedItems={multiSelected}
        onSelectionChange={(next) => setMultiSelected(next)}
        placeholder="Search items..."
        itemToString={(i) => (i == null ? '' : String(i))}
        maxMenuHeight={300}
        maxVisiblePills={0}
      />

      <div style={{ marginTop: 12 }}>
        <strong>Selected (multi):</strong>
        <div>{(multiSelected || []).join(', ')}</div>
      </div>

      <hr style={{ margin: '18px 0' }} />

      <h3>Single-select example</h3>
      <VirtualCombobox
        items={items}
        multiSelect={false}
        selectedItem={singleSelected}
        onSelectionChange={(next) => setSingleSelected(next)}
        placeholder="Pick one item..."
        itemToString={(i) => (i == null ? '' : String(i))}
        maxMenuHeight={300}
      />

      <div style={{ marginTop: 12 }}>
        <strong>Selected (single):</strong>
        <div>{singleSelected ?? 'None'}</div>
      </div>

    </div>
  )
}
