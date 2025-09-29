import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useCombobox } from 'downshift'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button, FlowLayout, Input, Pill, Checkbox } from "@salt-ds/core"
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "@salt-ds/icons"

/**
 * VirtualCombobox
 * A small, reusable combobox component that supports virtualization (tanstack/react-virtual)
 * and Salt DS components. It supports single-select and multi-select modes and can be used
 * as a controlled or uncontrolled component.
 *
 * Props:
 * - items: array of items to show (required)
 * - multiSelect: boolean (default false)
 * - selectedItems: controlled selected items (array) when multiSelect=true
 * - selectedItem: controlled selected item when multiSelect=false
 * - onSelectionChange: callback(selected) called when selection changes
 * - placeholder: input placeholder
 * - itemToString: function(item) => string
 */
export default function VirtualCombobox({
  items = [],
  multiSelect = false,
  selectedItems: controlledSelectedItems,
  selectedItem: controlledSelectedItem,
  onSelectionChange,
  placeholder = 'Type to filter...',
  itemToString = (i) => (i == null ? '' : String(i)),
  maxMenuHeight = 240,
  maxVisiblePills = 1, // number of pills to show before collapsing into a +N summary. 0 = only +N
  // filterBy: string | string[] | function(item) => string
  filterBy = null,
  // render option in the dropdown: (item) => ReactNode
  renderOption = null,
  // render pill content for selected items: (item) => ReactNode
  renderPill = null,
  // key extractor for list items/pills
  keyExtractor = null,
}) {
  const allItems = useMemo(() => items, [items])

  // selection state: support controlled/uncontrolled for both single and multi
  const [internalSelectedItems, setInternalSelectedItems] = useState([])
  const [internalSelectedItem, setInternalSelectedItem] = useState(null)
  const selectedItems = multiSelect ? (controlledSelectedItems ?? internalSelectedItems) : undefined
  const selectedItem = !multiSelect ? (controlledSelectedItem ?? internalSelectedItem) : undefined

  const setSelectedItems = useCallback((next) => {
    if (controlledSelectedItems === undefined) setInternalSelectedItems(next)
    if (onSelectionChange) onSelectionChange(next)
  }, [controlledSelectedItems, onSelectionChange])

  const setSelectedItem = useCallback((next) => {
    if (controlledSelectedItem === undefined) setInternalSelectedItem(next)
    if (onSelectionChange) onSelectionChange(next)
  }, [controlledSelectedItem, onSelectionChange])

  const [inputItems, setInputItems] = useState(allItems)
  useEffect(() => setInputItems(allItems), [allItems])

  // key extractor and searchable string helpers for object items
  const keyFor = useCallback((item) => {
    if (typeof keyExtractor === 'function') return keyExtractor(item)
    if (item && typeof item === 'object' && (item.id !== undefined)) return String(item.id)
    return itemToString(item)
  }, [keyExtractor, itemToString])

  const searchableStringFor = useCallback((item) => {
    if (typeof filterBy === 'function') return String(filterBy(item) ?? '')
    if (typeof filterBy === 'string') {
      const v = (item && item[filterBy] !== undefined) ? item[filterBy] : itemToString(item)
      return String(v ?? '')
    }
    if (Array.isArray(filterBy)) {
      return filterBy.map(k => (item && item[k] !== undefined) ? item[k] : '').join(' ')
    }
    return itemToString(item)
  }, [filterBy, itemToString])

  const parentRef = useRef(null)
  const inputRef = useRef(null)
  const filterTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (filterTimerRef.current) {
        clearTimeout(filterTimerRef.current)
        filterTimerRef.current = null
      }
    }
  }, [])

  const {
    isOpen,
    getLabelProps,
    getMenuProps,
    getInputProps,
    getItemProps,
    getToggleButtonProps,
    highlightedIndex,
    setHighlightedIndex,
    setInputValue,
  } = useCombobox({
    items: inputItems,
    itemToString: itemToString,
    selectedItem: selectedItem,
    onInputValueChange: ({ inputValue }) => {
      // debounce filtering to avoid expensive work on every keystroke
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current)
      const term = (inputValue || '').toLowerCase()
      filterTimerRef.current = setTimeout(() => {
        const filtered = allItems.filter(i =>
          searchableStringFor(i).toLowerCase().includes(term)
        )
        setInputItems(filtered)
        setHighlightedIndex(0)
      }, 150)
    },
    onSelectedItemChange: ({ selectedItem: sItem }) => {
      // handle keyboard selection / Enter
      if (multiSelect) {
        if (!sItem) return
        const next = (selectedItems ?? internalSelectedItems).includes(sItem)
          ? (selectedItems ?? internalSelectedItems).filter(i => i !== sItem)
          : [...(selectedItems ?? internalSelectedItems), sItem]
        setSelectedItems(next)
        setInputValue('')
        setInputItems(allItems)
        setHighlightedIndex(0)
      } else {
        if (sItem == null) return
        setSelectedItem(sItem)
        setInputValue(itemToString(sItem))
      }
    }
  })

  // prop validation: warn if caller passes wrong selection props for mode
  useEffect(() => {
    if (!multiSelect && controlledSelectedItems !== undefined) {
      console.warn('VirtualCombobox: received `selectedItems` for single-select mode; pass `selectedItem` instead.')
    }
    if (multiSelect && controlledSelectedItem !== undefined) {
      console.warn('VirtualCombobox: received `selectedItem` for multi-select mode; pass `selectedItems` instead.')
    }
  }, [multiSelect, controlledSelectedItems, controlledSelectedItem])

  // clear all selections helper
  const clearAll = useCallback((event) => {
    event?.stopPropagation()
    if (multiSelect) {
      setSelectedItems([])
    } else {
      setSelectedItem(null)
      setInputValue('')
    }
    if (inputRef.current && inputRef.current.focus) inputRef.current.focus()
  }, [multiSelect, setSelectedItems, setSelectedItem, setInputValue])

  // toggle selection handler
  const toggleSelected = useCallback((item) => {
    if (!multiSelect) {
      setSelectedItem(item)
      setInputValue(itemToString(item))
      return
    }
    const prev = selectedItems ?? internalSelectedItems
    const next = prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    setSelectedItems(next)
  }, [multiSelect, selectedItems, internalSelectedItems, setSelectedItems, setSelectedItem, setInputValue, itemToString])

  // We override the row click behavior to toggle selection but NOT close the menu
  const handleRowClick = useCallback((item) => (event) => {
    event.preventDefault()
    event.stopPropagation()
    toggleSelected(item)
    setInputValue('')
    setInputItems(allItems)
    setHighlightedIndex(0)
    // focus input so keyboard continues working
    if (inputRef.current && inputRef.current.focus) inputRef.current.focus()
  }, [toggleSelected, setInputValue, setInputItems, allItems, setHighlightedIndex])

  const rowVirtualizer = useVirtualizer({
    count: inputItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  // input props from Downshift
  const rawInputProps = getInputProps({ placeholder })

  // memoize startAdornment rendering to avoid recreating on each render
  const startAdornment = useMemo(() => {
    if (!multiSelect) return null
    const current = (selectedItems ?? [])
    if (!current || current.length === 0) return null

    const max = Math.max(0, Number.isFinite(maxVisiblePills) ? maxVisiblePills : 1)

    // If configured to show only count (max === 0)
    if (max === 0) {
      return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
          <Pill
            onClick={() => {
              if (inputRef.current && inputRef.current.focus) inputRef.current.focus()
            }}
            aria-label={`${current.length} selected`}
          >
            {current.length} selected
          </Pill>
        </div>
      )
    }

    // If max >= current.length show all pills
    if (max >= current.length) {
      return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {current.map(s => (
            <Pill key={keyFor(s)} onClick={() => toggleSelected(s)}>
              {renderPill ? renderPill(s) : itemToString(s)} <CloseIcon style={{ marginLeft: 6 }} />
            </Pill>
          ))}
        </div>
      )
    }

    // Otherwise show up to `max` pills then +N summary
    const visible = current.slice(0, max)
    const remainingCount = current.length - visible.length

    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
        {visible.map(s => (
          <Pill key={keyFor(s)} onClick={() => toggleSelected(s)}>
            {renderPill ? renderPill(s) : itemToString(s)} <CloseIcon style={{ marginLeft: 6 }} />
          </Pill>
        ))}
        {remainingCount > 0 && (
          <Pill
            onClick={() => {
              if (inputRef.current && inputRef.current.focus) inputRef.current.focus()
            }}
            aria-label={`${remainingCount} more selected`}
          >
            +{remainingCount}
          </Pill>
        )}
      </div>
    )
  }, [multiSelect, selectedItems, itemToString, toggleSelected, maxVisiblePills, renderPill, keyFor])

  return (
    <div className="combobox-root">
      <label {...getLabelProps()}>Choose an item</label>

      <FlowLayout style={{ width: '100%' }} className="combobox-input-row">
        <Input
          inputRef={inputRef}
          startAdornment={startAdornment}
          inputProps={rawInputProps}
          endAdornment={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* clear-all button (shown when there is a selection) */}
              {((multiSelect ? (selectedItems ?? []).length : (selectedItem != null ? 1 : 0)) > 0) && (
                <Button
                  appearance='transparent'
                  onClick={(e) => { e.stopPropagation(); clearAll(e) }}
                  aria-label='Clear selection'
                >
                  <CloseIcon />
                </Button>
              )}

              <Button {...getToggleButtonProps()} appearance='transparent'>
                {isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </Button>
            </div>
          }
        />
      </FlowLayout>

      <div
        className="combobox-menu"
        {...getMenuProps({ ref: parentRef })}
        style={{ display: isOpen ? 'block' : 'none', maxHeight: maxMenuHeight, overflow: 'auto' }}
      >
        <div style={{ height: totalSize, width: '100%', position: 'relative' }}>
          {virtualItems.map(virtualRow => {
            const item = inputItems[virtualRow.index]
            const props = getItemProps({ item, index: virtualRow.index })

            return (
              <div
                key={virtualRow.index}
                {...props}
                onClick={handleRowClick(item)}
                className={`combobox-item ${highlightedIndex === virtualRow.index ? 'highlighted' : ''}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                  lineHeight: `${virtualRow.size}px`,
                  boxSizing: 'border-box',
                  padding: '0 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                {multiSelect && (
                  <Checkbox
                    checked={(selectedItems ?? internalSelectedItems).includes(item)}
                    onChange={() => toggleSelected(item)}
                    onClick={e => e.stopPropagation()}
                  />
                )}
                <div style={{ flex: 1 }}>{renderOption ? renderOption(item) : itemToString(item)}</div>
              </div>
            )
          })}

          {inputItems.length === 0 && (
            <div className="combobox-empty" style={{ position: 'absolute', left: 0, top: 0 }}>
              No results
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
