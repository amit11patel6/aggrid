import React, { useState, useMemo, useEffect } from 'react'
import VirtualCombobox from './VirtualCombobox'
import { Button } from "@salt-ds/core"

export default function App() {
  // sample dataset (can be any objects; using strings here)
  const items = useMemo(() => Array.from({ length: 1000 }, (_, i) => `Item ${i + 1}`), [])

  // separate state for multi-select (array) and single-select (single value)
  const [multiSelected, setMultiSelected] = useState([])
  const [singleSelected, setSingleSelected] = useState(null)

  // object-based dataset example
  const objectItems = useMemo(() => {
    return [
      { id: 'u1', name: 'Alice', org: 'Engineering' },
      { id: 'u2', name: 'Bob', org: 'Design' },
      { id: 'u3', name: 'Carol', org: 'Product' },
      { id: 'u4', name: 'Dan', org: 'Engineering' },
      { id: 'u5', name: 'Eve', org: 'Ops' },
    ]
  }, [])
  const [selectedObjects, setSelectedObjects] = useState([])
  useEffect(() => {
   console.log('Selected objects changed: ', selectedObjects)
  }, [selectedObjects])
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

      <hr style={{ margin: '18px 0' }} />

      <h3>Object items example (custom filtering & rendering)</h3>
      <VirtualCombobox
        items={objectItems}
        multiSelect={true}
        selectedItems={selectedObjects}
        onSelectionChange={(next) => setSelectedObjects(next)}
        placeholder="Search people by name or org..."
        // itemToString fallback (used when no renderers provided)
        itemToString={(i) => (i && i.name) ? i.name : ''}
        // filter by name and org fields (or provide a function)
        filterBy={[ 'name', 'org' ]}
        // custom option renderer
        renderOption={(item) => (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 600 }}>{item.name} {' '}{item.org}</div>
           
          </div>
        )}
        // custom pill renderer
        renderPill={(item) => <span>{item.name}</span>}
        // key extractor
        keyExtractor={(item) => item.id}
        maxMenuHeight={240}
        maxVisiblePills={2}
      />

      <div style={{ marginTop: 12 }}>
        <strong>Selected (objects):</strong>
        <div>{(selectedObjects || []).map(s => s.name).join(', ')}</div>
      </div>

    </div>
  )
}
