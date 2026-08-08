import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

type Item = {
  id: string
  list_id: string
  text: string
  done: boolean
  quantity: number | null
  unit: string | null
  created_at: string
}

type ListType = 'grocery' | 'todo' | 'shopping'

type ShoppingList = {
  id: string
  name: string
  type: ListType
  created_at: string
}

const UNITS = ['stk', 'g', 'kg', 'ml', 'dl', 'l', 'pk'] as const

const ACTIVE_KEY = 'duolist-active-list'

const LIST_TYPE_LABELS: Record<ListType, string> = {
  grocery: 'Matliste',
  todo: 'To-do liste',
  shopping: 'Shoppingliste',
}

const LIST_TYPE_PLACEHOLDERS: Record<ListType, string> = {
  grocery: 'Legg til vare…',
  todo: 'Legg til oppgave…',
  shopping: 'Legg til vare…',
}

const LIST_TYPE_EMPTY: Record<ListType, string> = {
  grocery: 'Legg til noe dere trenger 🛒',
  todo: 'Legg til en oppgave ✅',
  shopping: 'Legg til noe dere trenger 🛍️',
}

const LIST_TYPE_EMPTY_SUBTITLE: Record<ListType, string> = {
  grocery: 'Handlelisten er tom',
  todo: 'Listen er tom',
  shopping: 'Listen er tom',
}

function sortByCreatedAt<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

function App() {
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_KEY),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [text, setText] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<(typeof UNITS)[number]>('stk')
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ListType>('grocery')
  const panelRef = useRef<HTMLDivElement>(null)

  // Load lists once, seeding a default list on a brand new project.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const { data, error } = await supabase
        .from('lists')
        .select('*')
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      if (data.length === 0) {
        const { data: created, error: createError } = await supabase
          .from('lists')
          .insert({ name: 'Handleliste', type: 'grocery' })
          .select()
          .single()
        if (cancelled) return
        if (createError) {
          setError(createError.message)
          setLoading(false)
          return
        }
        setLists([created])
        setActiveId(created.id)
      } else {
        setLists(data)
        setActiveId((current) => (current && data.some((l) => l.id === current) ? current : data[0].id))
      }
      setLoading(false)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  // Keep lists in sync with other devices in real time.
  useEffect(() => {
    const channel = supabase
      .channel('lists-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lists' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as ShoppingList
            setLists((prev) => (prev.some((l) => l.id === row.id) ? prev : sortByCreatedAt([...prev, row])))
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as ShoppingList
            setLists((prev) => prev.map((l) => (l.id === row.id ? row : l)))
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as ShoppingList
            setLists((prev) => prev.filter((l) => l.id !== row.id))
          }
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Load items for the active list, then keep them in sync in real time.
  useEffect(() => {
    if (!activeId) return
    localStorage.setItem(ACTIVE_KEY, activeId)
    setItems([])

    let cancelled = false
    supabase
      .from('items')
      .select('*')
      .eq('list_id', activeId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          return
        }
        setItems(data)
      })

    const channel = supabase
      .channel(`items-${activeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${activeId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Item
            setItems((prev) => (prev.some((i) => i.id === row.id) ? prev : sortByCreatedAt([...prev, row])))
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as Item
            setItems((prev) => prev.map((i) => (i.id === row.id ? row : i)))
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as Item
            setItems((prev) => prev.filter((i) => i.id !== row.id))
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [activeId])

  useEffect(() => {
    if (!switcherOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [switcherOpen])

  const activeList = lists.find((l) => l.id === activeId) ?? lists[0]

  const addItem = async (e: FormEvent) => {
    e.preventDefault()
    const value = text.trim()
    if (!value || !activeList) return
    const parsedQuantity = Number(quantity)
    const hasQuantity = quantity.trim() !== '' && parsedQuantity > 0
    setText('')
    setQuantity('')
    const { data, error } = await supabase
      .from('items')
      .insert({
        list_id: activeList.id,
        text: value,
        quantity: hasQuantity ? parsedQuantity : null,
        unit: hasQuantity ? unit : null,
      })
      .select()
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setItems((prev) => (prev.some((i) => i.id === data.id) ? prev : sortByCreatedAt([...prev, data])))
  }

  const toggleItem = async (item: Item) => {
    const { data, error } = await supabase
      .from('items')
      .update({ done: !item.done })
      .eq('id', item.id)
      .select()
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setItems((prev) => prev.map((i) => (i.id === data.id ? data : i)))
  }

  const deleteItem = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) setError(error.message)
  }

  const clearDone = async () => {
    if (!activeList) return
    const doneIds = items.filter((i) => i.done).map((i) => i.id)
    setItems((prev) => prev.filter((i) => !i.done))
    const { error } = await supabase.from('items').delete().in('id', doneIds)
    if (error) setError(error.message)
  }

  const selectList = (id: string) => {
    setActiveId(id)
    setSwitcherOpen(false)
    setCreating(false)
  }

  const createList = async (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const { data, error } = await supabase
      .from('lists')
      .insert({ name, type: newType })
      .select()
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setLists((prev) => (prev.some((l) => l.id === data.id) ? prev : sortByCreatedAt([...prev, data])))
    setActiveId(data.id)
    setNewName('')
    setNewType('grocery')
    setCreating(false)
    setSwitcherOpen(false)
  }

  const remaining = items.filter((item) => !item.done).length
  const hasDone = items.some((item) => item.done)

  if (loading || !activeList) {
    return (
      <div className="app">
        <div className="loading">{error ? `Feil: ${error}` : 'Laster…'}</div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <button
          type="button"
          className="list-switch"
          onClick={() => setSwitcherOpen((v) => !v)}
          aria-expanded={switcherOpen}
        >
          <span className="list-name">{activeList.name}</span>
          <svg className={`chevron ${switcherOpen ? 'open' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <p className="subtitle">
          {items.length === 0
            ? LIST_TYPE_EMPTY_SUBTITLE[activeList.type]
            : `${remaining} ${remaining === 1 ? 'vare' : 'varer'} igjen`}
        </p>

        {switcherOpen && (
          <div className="switcher-panel" ref={panelRef}>
            <ul className="switcher-list">
              {lists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className={l.id === activeList.id ? 'active' : ''}
                    onClick={() => selectList(l.id)}
                  >
                    <span className="switcher-name">{l.name}</span>
                    <span className="switcher-type">{LIST_TYPE_LABELS[l.type]}</span>
                  </button>
                </li>
              ))}
            </ul>

            {creating ? (
              <form className="create-form" onSubmit={createList}>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Navn på listen"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
                <select value={newType} onChange={(e) => setNewType(e.target.value as ListType)}>
                  {(Object.keys(LIST_TYPE_LABELS) as ListType[]).map((type) => (
                    <option key={type} value={type}>
                      {LIST_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                <div className="create-actions">
                  <button type="button" className="cancel" onClick={() => setCreating(false)}>
                    Avbryt
                  </button>
                  <button type="submit" className="confirm" disabled={!newName.trim()}>
                    Opprett
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="new-list" onClick={() => setCreating(true)}>
                + Ny liste
              </button>
            )}
          </div>
        )}
      </header>

      <main className="list">
        {items.length === 0 ? (
          <div className="empty">{LIST_TYPE_EMPTY[activeList.type]}</div>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id} className={item.done ? 'done' : ''}>
                <button
                  type="button"
                  className="checkbox"
                  aria-label={item.done ? 'Merk som ikke fullført' : 'Merk som fullført'}
                  aria-pressed={item.done}
                  onClick={() => toggleItem(item)}
                >
                  {item.done && (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M5 13l4 4L19 7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
                <span className="item-text">{item.text}</span>
                {item.quantity != null && (
                  <span className="item-qty">
                    {item.quantity} {item.unit}
                  </span>
                )}
                <button
                  type="button"
                  className="delete"
                  aria-label={`Slett ${item.text}`}
                  onClick={() => deleteItem(item.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {hasDone && (
          <button type="button" className="clear-done" onClick={clearDone}>
            Fjern fullførte
          </button>
        )}
      </main>

      <form className="add-bar" onSubmit={addItem}>
        <div className="add-bar-row">
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder={LIST_TYPE_PLACEHOLDERS[activeList.type]}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {activeList.type === 'todo' && (
            <button type="submit" aria-label="Legg til" disabled={!text.trim()}>
              +
            </button>
          )}
        </div>
        {activeList.type !== 'todo' && (
          <div className="add-bar-row qty-row">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="Antall"
              className="qty-input"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <select
              className="unit-select"
              value={unit}
              onChange={(e) => setUnit(e.target.value as (typeof UNITS)[number])}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <button type="submit" aria-label="Legg til" disabled={!text.trim()}>
              +
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

export default App
