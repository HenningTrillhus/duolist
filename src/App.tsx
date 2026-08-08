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
  added_by: UserName | null
  created_at: string
}

type ListType = 'grocery' | 'todo' | 'shopping'

type ShoppingList = {
  id: string
  name: string
  type: ListType
  created_at: string
}

type UserName = 'Nora' | 'Henning'

const UNITS = ['stk', 'g', 'kg', 'ml', 'dl', 'l', 'pk'] as const
type Unit = (typeof UNITS)[number]

const ACTIVE_KEY = 'duolist-active-list'
const USER_KEY = 'duolist-user'
const THEME_KEY = 'duolist-theme'

type Theme = 'light' | 'dark'

const USERS: UserName[] = ['Nora', 'Henning']

const USER_COLORS: Record<UserName, { accent: string; bg: string }> = {
  Nora: { accent: '#38bdf8', bg: 'rgba(56, 189, 248, 0.18)' },
  Henning: { accent: '#1d4ed8', bg: 'rgba(29, 78, 216, 0.18)' },
}

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

function isUserName(value: string | null): value is UserName {
  return value === 'Nora' || value === 'Henning'
}

function loadTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_KEY),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [currentUser, setCurrentUser] = useState<UserName | null>(() => {
    const stored = localStorage.getItem(USER_KEY)
    return isUserName(stored) ? stored : null
  })
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userPanelRef = useRef<HTMLDivElement>(null)

  const [theme, setTheme] = useState<Theme>(loadTheme)

  const [confirmDialog, setConfirmDialog] = useState<{
    message: string
    onConfirm: () => void
  } | null>(null)

  const [text, setText] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<Unit>('stk')
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ListType>('grocery')
  const panelRef = useRef<HTMLDivElement>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editUnit, setEditUnit] = useState<Unit>('stk')

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (!userMenuOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (userPanelRef.current && !userPanelRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [userMenuOpen])

  const activeList = lists.find((l) => l.id === activeId) ?? lists[0]

  const chooseUser = (name: UserName) => {
    localStorage.setItem(USER_KEY, name)
    setCurrentUser(name)
    setUserMenuOpen(false)
  }

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
        added_by: currentUser,
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

  const askDeleteItem = (item: Item) => {
    setConfirmDialog({
      message: `Slette «${item.text}»?`,
      onConfirm: () => {
        deleteItem(item.id)
        setConfirmDialog(null)
      },
    })
  }

  const askClearDone = () => {
    const count = items.filter((i) => i.done).length
    setConfirmDialog({
      message: `Fjerne ${count} fullførte ${count === 1 ? 'vare' : 'varer'}?`,
      onConfirm: () => {
        clearDone()
        setConfirmDialog(null)
      },
    })
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

  const startEdit = (item: Item) => {
    setEditingId(item.id)
    setEditText(item.text)
    setEditQuantity(item.quantity != null ? String(item.quantity) : '')
    setEditUnit((item.unit as Unit) ?? 'stk')
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    const value = editText.trim()
    if (!value) return
    const parsedQuantity = Number(editQuantity)
    const hasQuantity = editQuantity.trim() !== '' && parsedQuantity > 0
    const { data, error } = await supabase
      .from('items')
      .update({
        text: value,
        quantity: hasQuantity ? parsedQuantity : null,
        unit: hasQuantity ? editUnit : null,
      })
      .eq('id', editingId)
      .select()
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setItems((prev) => prev.map((i) => (i.id === data.id ? data : i)))
    setEditingId(null)
  }

  const remaining = items.filter((item) => !item.done).length
  const hasDone = items.some((item) => item.done)

  const userPicker = !currentUser && (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h2>Hvem er du?</h2>
        <div className="user-options">
          {USERS.map((name) => (
            <button
              key={name}
              type="button"
              style={{ background: USER_COLORS[name].accent }}
              onClick={() => chooseUser(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  if (loading || !activeList) {
    return (
      <div className="app">
        <div className="loading">{error ? `Feil: ${error}` : 'Laster…'}</div>
        {userPicker}
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
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

          <button
            type="button"
            className="user-button"
            onClick={() => setUserMenuOpen((v) => !v)}
            aria-label="Bytt bruker"
            aria-expanded={userMenuOpen}
          >
            <span
              className="user-avatar"
              style={{ background: currentUser ? USER_COLORS[currentUser].accent : undefined }}
            >
              {currentUser ? currentUser[0] : '?'}
            </span>
          </button>
        </div>

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

        {userMenuOpen && (
          <div className="user-panel" ref={userPanelRef}>
            {USERS.map((name) => (
              <button
                key={name}
                type="button"
                className={currentUser === name ? 'active' : ''}
                onClick={() => chooseUser(name)}
              >
                <span className="user-dot" style={{ background: USER_COLORS[name].accent }} />
                {name}
              </button>
            ))}

            <div className="theme-toggle">
              <button
                type="button"
                className={theme === 'light' ? 'active' : ''}
                onClick={() => setTheme('light')}
                aria-label="Lys modus"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                Lys
              </button>
              <button
                type="button"
                className={theme === 'dark' ? 'active' : ''}
                onClick={() => setTheme('dark')}
                aria-label="Mørk modus"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
                Mørk
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="list">
        {items.length === 0 ? (
          <div className="empty">{LIST_TYPE_EMPTY[activeList.type]}</div>
        ) : (
          <ul>
            {items.map((item) => {
              const owner = item.added_by
              const style = owner ? { borderLeftColor: USER_COLORS[owner].accent } : undefined
              return (
                <li key={item.id} className={item.done ? 'done' : ''} style={style}>
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

                  {editingId === item.id ? (
                    <form className="edit-form" onSubmit={saveEdit}>
                      <input
                        type="text"
                        autoComplete="off"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        autoFocus
                      />
                      {activeList.type !== 'todo' && (
                        <>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            placeholder="Antall"
                            className="qty-input"
                            value={editQuantity}
                            onChange={(e) => setEditQuantity(e.target.value)}
                          />
                          <select
                            value={editUnit}
                            onChange={(e) => setEditUnit(e.target.value as Unit)}
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                      <button type="submit" className="save" aria-label="Lagre" disabled={!editText.trim()}>
                        ✓
                      </button>
                      <button type="button" className="cancel-edit" aria-label="Avbryt" onClick={cancelEdit}>
                        ×
                      </button>
                    </form>
                  ) : (
                    <>
                      <button type="button" className="item-main" onClick={() => startEdit(item)}>
                        <span className="item-text">{item.text}</span>
                        {item.quantity != null && (
                          <span className="item-qty">
                            {item.quantity} {item.unit}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="delete"
                        aria-label={`Slett ${item.text}`}
                        onClick={() => askDeleteItem(item)}
                      >
                        ×
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {hasDone && (
          <button type="button" className="clear-done" onClick={askClearDone}>
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
              onChange={(e) => setUnit(e.target.value as Unit)}
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

      {confirmDialog && (
        <div className="modal-backdrop" onClick={() => setConfirmDialog(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-message">{confirmDialog.message}</p>
            <div className="confirm-actions">
              <button type="button" className="cancel" onClick={() => setConfirmDialog(null)}>
                Avbryt
              </button>
              <button type="button" className="danger" onClick={confirmDialog.onConfirm}>
                Slett
              </button>
            </div>
          </div>
        </div>
      )}

      {userPicker}
    </div>
  )
}

export default App
