import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode, UIEvent } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

type Item = {
  id: string
  list_id: string
  text: string
  done: boolean
  quantity: number | null
  unit: string | null
  store: string | null
  image_url: string | null
  link_url: string | null
  added_by: UserName | null
  created_at: string
}

type ListType = 'grocery' | 'todo' | 'shopping'

type ShoppingList = {
  id: string
  name: string
  type: ListType
  created_at: string
  updated_at: string | null
}

type UserName = 'Nora' | 'Henning'

type StoreOption = { name: string; color: string }

const UNITS = ['stk', 'g', 'kg', 'ml', 'dl', 'l', 'pk'] as const
type Unit = (typeof UNITS)[number]

const CUSTOM_STORE = '__custom__'

const ACTIVE_KEY = 'duolist-active-list'
const USER_KEY = 'duolist-user'
const THEME_KEY = 'duolist-theme'
const TAB_KEY = 'duolist-tab'
const REMOVE_ANIM_MS = 180

type Theme = 'light' | 'dark'
type AppTab = 'liste' | 'middag'

const USERS: UserName[] = ['Nora', 'Henning']

const USER_COLORS: Record<UserName, { accent: string; bg: string }> = {
  Nora: { accent: '#38bdf8', bg: 'rgba(56, 189, 248, 0.18)' },
  Henning: { accent: '#1d4ed8', bg: 'rgba(29, 78, 216, 0.18)' },
}

// Representative brand colors, not official palettes — easy to tweak.
const GROCERY_STORES: StoreOption[] = [
  { name: 'Rema 1000', color: '#0060A9' },
  { name: 'Kiwi', color: '#78BE21' },
  { name: 'Coop Extra', color: '#EE7203' },
  { name: 'Coop Mega', color: '#E2001A' },
  { name: 'Coop Prix', color: '#00A19A' },
  { name: 'Coop Obs', color: '#7B2D8E' },
  { name: 'Meny', color: '#00543C' },
  { name: 'Spar', color: '#C8102E' },
  { name: 'Eurospar', color: '#0033A0' },
  { name: 'Joker', color: '#D2691E' },
  { name: 'Bunnpris', color: '#FFC72C' },
]

const SHOPPING_STORES: StoreOption[] = [
  { name: 'IKEA', color: '#0A5EB0' },
  { name: 'Jysk', color: '#D8262C' },
  { name: 'Rusta', color: '#E67E22' },
  { name: "Kitch'n", color: '#16A085' },
  { name: 'Jernia', color: '#8E6C3A' },
  { name: 'Clas Ohlson', color: '#5B2C6F' },
  { name: 'Biltema', color: '#F1C40F' },
  { name: 'Jula', color: '#2C3E92' },
  { name: 'Obs Bygg', color: '#607D3B' },
  { name: 'Europris', color: '#D35400' },
  { name: 'Nille', color: '#E84393' },
  { name: 'Kremmerhuset', color: '#A0522D' },
  { name: 'XXL Sport', color: '#27AE60' },
  { name: 'Elkjøp', color: '#17A2B8' },
  { name: 'Power', color: '#E74C3C' },
  { name: 'Lefdal', color: '#34495E' },
]

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

function storesForType(type: ListType): StoreOption[] {
  if (type === 'grocery') return GROCERY_STORES
  if (type === 'shopping') return SHOPPING_STORES
  return []
}

function storeColorFor(stores: StoreOption[], name: string): string {
  return stores.find((s) => s.name === name)?.color ?? ''
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

function formatUpdated(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const diffMin = Math.round((now.getTime() - date.getTime()) / 60000)
  if (diffMin < 1) return 'nå nettopp'
  if (diffMin < 60) return `${diffMin} min siden`
  if (date.toDateString() === now.toDateString()) {
    return `i dag kl. ${date.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'i går'
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24 * 7) return `${Math.floor(diffHr / 24)} d siden`
  return date.toLocaleDateString('no-NO', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const STORAGE_BUCKET = 'item-files'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function extractStoragePath(url: string): string | null {
  const marker = `/${STORAGE_BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.slice(idx + marker.length)
}

type StoreGroup = { store: string | null; color: string; items: Item[] }

function groupByStore(items: Item[], stores: StoreOption[]): StoreGroup[] {
  const map = new Map<string | null, Item[]>()
  for (const item of items) {
    const key = item.store
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  const groups: StoreGroup[] = [...map.entries()].map(([store, groupItems]) => ({
    store,
    color: store ? storeColorFor(stores, store) : '',
    items: groupItems,
  }))
  groups.sort((a, b) => {
    if (a.store === null) return 1
    if (b.store === null) return -1
    return a.store.localeCompare(b.store, 'no')
  })
  return groups
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

  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const stored = localStorage.getItem(TAB_KEY)
    return stored === 'middag' ? 'middag' : 'liste'
  })

  const [confirmDialog, setConfirmDialog] = useState<{
    message: string
    onConfirm: () => void
  } | null>(null)

  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [scrolled, setScrolled] = useState(false)

  const [text, setText] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<Unit>('stk')
  const [storeChoice, setStoreChoice] = useState('')
  const [customStore, setCustomStore] = useState('')
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ListType>('grocery')
  const panelRef = useRef<HTMLDivElement>(null)

  const [attachOpen, setAttachOpen] = useState(false)
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null)
  const [pendingLink, setPendingLink] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editUnit, setEditUnit] = useState<Unit>('stk')
  const [editStoreChoice, setEditStoreChoice] = useState('')
  const [editCustomStore, setEditCustomStore] = useState('')
  const [editImageFile, setEditImageFile] = useState<File | null>(null)
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null)
  const [editImageRemoved, setEditImageRemoved] = useState(false)
  const [editLink, setEditLink] = useState('')
  const editFileInputRef = useRef<HTMLInputElement>(null)

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
    setStoreChoice('')
    setCustomStore('')
    setAttachOpen(false)
    setPendingImageFile(null)
    setPendingImagePreview(null)
    setPendingLink('')

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
    localStorage.setItem(TAB_KEY, activeTab)
  }, [activeTab])

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

  // Auto-dismiss transient error toasts.
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4500)
    return () => clearTimeout(t)
  }, [error])

  const activeList = lists.find((l) => l.id === activeId) ?? lists[0]
  const availableStores = activeList ? storesForType(activeList.type) : []

  const chooseUser = (name: UserName) => {
    localStorage.setItem(USER_KEY, name)
    setCurrentUser(name)
    setUserMenuOpen(false)
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file)
    if (uploadError) {
      setError(uploadError.message)
      return null
    }
    return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl
  }

  const deleteStoredImage = (url: string | null) => {
    if (!url) return
    const path = extractStoragePath(url)
    if (!path) return
    supabase.storage.from(STORAGE_BUCKET).remove([path])
  }

  const handleImagePick = (
    e: ChangeEvent<HTMLInputElement>,
    setFile: (f: File | null) => void,
    setPreview: (u: string | null) => void,
  ) => {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Filen må være et bilde')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Bildet er for stort (maks 8 MB)')
      return
    }
    setFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const removePendingImage = () => {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview)
    setPendingImageFile(null)
    setPendingImagePreview(null)
  }

  const removeEditImage = () => {
    if (editImageFile && editImagePreview) URL.revokeObjectURL(editImagePreview)
    setEditImageFile(null)
    setEditImagePreview(null)
    setEditImageRemoved(true)
  }

  const addItem = async (e: FormEvent) => {
    e.preventDefault()
    const value = text.trim()
    if (!value || !activeList) return
    const parsedQuantity = Number(quantity)
    const hasQuantity = quantity.trim() !== '' && parsedQuantity > 0
    const originalQuantity = quantity
    const finalStore = storeChoice === CUSTOM_STORE ? customStore.trim() || null : storeChoice || null
    const finalLink = normalizeLink(pendingLink)
    const imageFile = pendingImageFile
    const localPreview = pendingImagePreview

    const optimisticId = crypto.randomUUID()
    const optimisticItem: Item = {
      id: optimisticId,
      list_id: activeList.id,
      text: value,
      done: false,
      quantity: hasQuantity ? parsedQuantity : null,
      unit: hasQuantity ? unit : null,
      store: finalStore,
      image_url: localPreview,
      link_url: finalLink,
      added_by: currentUser,
      created_at: new Date().toISOString(),
    }
    setItems((prev) => sortByCreatedAt([...prev, optimisticItem]))
    setText('')
    setQuantity('')
    setCustomStore('')
    setPendingLink('')
    setPendingImageFile(null)
    setPendingImagePreview(null)
    setAttachOpen(false)

    let finalImageUrl = localPreview
    if (imageFile) {
      finalImageUrl = await uploadImage(imageFile)
      if (!finalImageUrl) {
        setItems((prev) => prev.filter((i) => i.id !== optimisticId))
        setText(value)
        setQuantity(originalQuantity)
        setPendingImageFile(imageFile)
        setPendingImagePreview(localPreview)
        return
      }
      setItems((prev) => prev.map((i) => (i.id === optimisticId ? { ...i, image_url: finalImageUrl } : i)))
    }

    const { error } = await supabase.from('items').insert({ ...optimisticItem, image_url: finalImageUrl })
    if (error) {
      setItems((prev) => prev.filter((i) => i.id !== optimisticId))
      setError(error.message)
      setText(value)
      setQuantity(originalQuantity)
    }
  }

  const toggleItem = async (item: Item) => {
    const nextDone = !item.done
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: nextDone } : i)))
    const { error } = await supabase.from('items').update({ done: nextDone }).eq('id', item.id)
    if (error) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: item.done } : i)))
      setError(error.message)
    }
  }

  const deleteItem = async (item: Item) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (error) {
      setItems((prev) => sortByCreatedAt([...prev, item]))
      setError(error.message)
      return
    }
    deleteStoredImage(item.image_url)
  }

  const clearDone = async (doneItems: Item[]) => {
    if (doneItems.length === 0) return
    const doneIds = doneItems.map((i) => i.id)
    setItems((prev) => prev.filter((i) => !doneIds.includes(i.id)))
    const { error } = await supabase.from('items').delete().in('id', doneIds)
    if (error) {
      setItems((prev) => sortByCreatedAt([...prev, ...doneItems]))
      setError(error.message)
      return
    }
    doneItems.forEach((i) => deleteStoredImage(i.image_url))
  }

  const askDeleteItem = (item: Item) => {
    setConfirmDialog({
      message: `Slette «${item.text}»?`,
      onConfirm: () => {
        setConfirmDialog(null)
        setRemovingIds((prev) => new Set(prev).add(item.id))
        setTimeout(() => {
          deleteItem(item)
          setRemovingIds((prev) => {
            const next = new Set(prev)
            next.delete(item.id)
            return next
          })
        }, REMOVE_ANIM_MS)
      },
    })
  }

  const askClearDone = () => {
    const doneItems = items.filter((i) => i.done)
    setConfirmDialog({
      message: `Fjerne ${doneItems.length} fullførte ${doneItems.length === 1 ? 'vare' : 'varer'}?`,
      onConfirm: () => {
        setConfirmDialog(null)
        const doneIds = doneItems.map((i) => i.id)
        setRemovingIds((prev) => new Set([...prev, ...doneIds]))
        setTimeout(() => {
          clearDone(doneItems)
          setRemovingIds((prev) => {
            const next = new Set(prev)
            doneIds.forEach((id) => next.delete(id))
            return next
          })
        }, REMOVE_ANIM_MS)
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
    if (item.store && activeList && storesForType(activeList.type).some((s) => s.name === item.store)) {
      setEditStoreChoice(item.store)
      setEditCustomStore('')
    } else if (item.store) {
      setEditStoreChoice(CUSTOM_STORE)
      setEditCustomStore(item.store)
    } else {
      setEditStoreChoice('')
      setEditCustomStore('')
    }
    setEditImageFile(null)
    setEditImagePreview(item.image_url)
    setEditImageRemoved(false)
    setEditLink(item.link_url ?? '')
  }

  const cancelEdit = () => {
    if (editImageFile && editImagePreview) URL.revokeObjectURL(editImagePreview)
    setEditingId(null)
  }

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    const value = editText.trim()
    if (!value) return
    const parsedQuantity = Number(editQuantity)
    const hasQuantity = editQuantity.trim() !== '' && parsedQuantity > 0
    const finalStore = editStoreChoice === CUSTOM_STORE ? editCustomStore.trim() || null : editStoreChoice || null
    const finalLink = normalizeLink(editLink)
    const previous = items.find((i) => i.id === editingId)
    if (!previous) return

    const newFile = editImageFile
    const optimisticImageUrl = newFile ? editImagePreview : editImageRemoved ? null : previous.image_url

    const updated = {
      text: value,
      quantity: hasQuantity ? parsedQuantity : null,
      unit: hasQuantity ? editUnit : null,
      store: finalStore,
      link_url: finalLink,
    }

    setItems((prev) => prev.map((i) => (i.id === editingId ? { ...i, ...updated, image_url: optimisticImageUrl } : i)))
    setEditingId(null)

    let finalImageUrl = optimisticImageUrl
    if (newFile) {
      const uploaded = await uploadImage(newFile)
      if (!uploaded) {
        setItems((prev) => prev.map((i) => (i.id === previous.id ? previous : i)))
        return
      }
      finalImageUrl = uploaded
      setItems((prev) => prev.map((i) => (i.id === previous.id ? { ...i, image_url: uploaded } : i)))
      deleteStoredImage(previous.image_url)
    } else if (editImageRemoved) {
      deleteStoredImage(previous.image_url)
    }

    const { error } = await supabase
      .from('items')
      .update({ ...updated, image_url: finalImageUrl })
      .eq('id', editingId)
    if (error) {
      setItems((prev) => prev.map((i) => (i.id === previous.id ? previous : i)))
      setError(error.message)
    }
  }

  const onListScroll = (e: UIEvent<HTMLElement>) => {
    setScrolled(e.currentTarget.scrollTop > 4)
  }

  const remaining = items.filter((item) => !item.done).length
  const hasDone = items.some((item) => item.done)

  const renderItem = (item: Item) => {
    const owner = item.added_by
    const style = owner ? { borderLeftColor: USER_COLORS[owner].accent } : undefined
    const classes = [
      item.done ? 'done' : '',
      removingIds.has(item.id) ? 'removing' : '',
      editingId === item.id ? 'editing' : '',
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <li key={item.id} className={classes} style={style}>
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
            <div className="edit-form-row edit-attach-row">
              <input
                ref={editFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleImagePick(e, setEditImageFile, setEditImagePreview)}
              />
              {editImagePreview ? (
                <div className="attach-image-preview edit-image-preview">
                  <img
                    src={editImagePreview}
                    alt=""
                    onClick={() => editFileInputRef.current?.click()}
                  />
                  <button
                    type="button"
                    className="remove-attach"
                    aria-label="Fjern bilde"
                    onClick={removeEditImage}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button type="button" className="attach-option" onClick={() => editFileInputRef.current?.click()}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="9" cy="10.5" r="1.6" fill="currentColor" />
                    <path
                      d="M4 16.5 8.5 12.5 11.5 15.2 15 11 20 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Legg til bilde
                </button>
              )}
            </div>
            <div className="edit-form-row link-row">
              <svg className="link-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M9.5 14.5 14.5 9.5M11 8l1.6-1.6a3 3 0 0 1 4.2 4.2L15.2 12M13 16l-1.6 1.6a3 3 0 0 1-4.2-4.2L8.8 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="Lenke (valgfritt)"
                value={editLink}
                onChange={(e) => setEditLink(e.target.value)}
              />
              {editLink.trim() && (
                <a
                  href={normalizeLink(editLink) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-open"
                  aria-label={`Åpne lenke til ${linkLabel(normalizeLink(editLink) ?? editLink)}`}
                  title={linkLabel(normalizeLink(editLink) ?? editLink)}
                  onClick={(e) => e.stopPropagation()}
                >
                  ↗
                </a>
              )}
            </div>
            <div className="edit-form-row">
              <input
                type="text"
                autoComplete="off"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                autoFocus
              />
              <button type="submit" className="save" aria-label="Lagre" disabled={!editText.trim()}>
                ✓
              </button>
              <button type="button" className="cancel-edit" aria-label="Avbryt" onClick={cancelEdit}>
                ×
              </button>
            </div>
            {activeList && activeList.type !== 'todo' && (
              <div className="edit-form-row">
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
                <select value={editUnit} onChange={(e) => setEditUnit(e.target.value as Unit)}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {activeList && activeList.type !== 'todo' && (
              <div className="edit-form-row">
                <select
                  className="store-select"
                  value={editStoreChoice}
                  onChange={(e) => setEditStoreChoice(e.target.value)}
                >
                  <option value="">Butikk (valgfritt)</option>
                  {storesForType(activeList.type).map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                  <option value={CUSTOM_STORE}>Annet…</option>
                </select>
                {editStoreChoice === CUSTOM_STORE && (
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="Butikknavn"
                    value={editCustomStore}
                    onChange={(e) => setEditCustomStore(e.target.value)}
                  />
                )}
              </div>
            )}
          </form>
        ) : (
          <>
            <button type="button" className="item-main" onClick={() => startEdit(item)}>
              {item.image_url && <img className="item-thumb" src={item.image_url} alt="" />}
              <span className="item-text">{item.text}</span>
              {item.link_url && (
                <svg className="item-link-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M9.5 14.5 14.5 9.5M11 8l1.6-1.6a3 3 0 0 1 4.2 4.2L15.2 12M13 16l-1.6 1.6a3 3 0 0 1-4.2-4.2L8.8 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
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
  }

  let listContent: ReactNode = null
  if (activeList) {
    if (items.length === 0) {
      listContent = <div className="empty">{LIST_TYPE_EMPTY[activeList.type]}</div>
    } else if (activeList.type === 'todo') {
      listContent = <ul>{items.map(renderItem)}</ul>
    } else {
      const groups = groupByStore(items, availableStores)
      if (groups.length === 1 && groups[0].store === null) {
        listContent = <ul>{items.map(renderItem)}</ul>
      } else {
        listContent = (
          <>
            {groups.map((group) => (
              <div className="store-group" key={group.store ?? '__none__'}>
                <div className="store-group-header">
                  <span className="store-dot" style={{ background: group.color || 'var(--text)' }} />
                  {group.store ?? 'Uten butikk'}
                </div>
                <ul>{group.items.map(renderItem)}</ul>
              </div>
            ))}
          </>
        )
      }
    }
  }

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

  const userButtonEl = (
    <button
      type="button"
      className="user-button"
      onClick={() => setUserMenuOpen((v) => !v)}
      aria-label="Bytt bruker"
      aria-expanded={userMenuOpen}
    >
      <span className="user-avatar" style={{ background: currentUser ? USER_COLORS[currentUser].accent : undefined }}>
        {currentUser ? currentUser[0] : '?'}
      </span>
    </button>
  )

  const userPanelEl = userMenuOpen && (
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
  )

  const listeLoadingGate = loading || !activeList
  const showToast = error && !(activeTab === 'liste' && listeLoadingGate)

  return (
    <div className="app">
      {activeTab === 'liste' && listeLoadingGate && (
        <div className="tab-view" key="liste-loading">
          <header className={`header ${scrolled ? 'scrolled' : ''}`}>
            <div className="header-top">
              <span className="list-name">Duolist</span>
              {userButtonEl}
            </div>
          </header>
          <main className="list">
            <div className="loading">
              {error ? <p className="loading-error">Feil: {error}</p> : <div className="spinner" aria-label="Laster" />}
            </div>
          </main>
        </div>
      )}

      {activeTab === 'liste' && !listeLoadingGate && activeList && (
        <div className="tab-view" key="liste">
      <header className={`header ${scrolled ? 'scrolled' : ''}`}>
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

          {userButtonEl}
        </div>

        <p className="subtitle">
          {items.length === 0
            ? LIST_TYPE_EMPTY_SUBTITLE[activeList.type]
            : `${remaining} ${remaining === 1 ? 'vare' : 'varer'} igjen`}
        </p>

        {switcherOpen && (
          <div className="switcher-panel" ref={panelRef}>
            <ul className="switcher-list">
              {lists.map((l) => {
                const updated = formatUpdated(l.updated_at)
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      className={l.id === activeList.id ? 'active' : ''}
                      onClick={() => selectList(l.id)}
                    >
                      <span className="switcher-name">{l.name}</span>
                      <span className="switcher-meta">
                        <span className="switcher-type">{LIST_TYPE_LABELS[l.type]}</span>
                        {updated && (
                          <>
                            <span className="switcher-dot">·</span>
                            <span className="switcher-updated">{updated}</span>
                          </>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
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

        {userPanelEl}
      </header>

      <main className="list" onScroll={onListScroll}>
        {listContent}

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
          <button
            type="button"
            className={`attach-toggle ${attachOpen ? 'active' : ''}`}
            onClick={() => setAttachOpen((v) => !v)}
            aria-label="Flere alternativer"
            aria-expanded={attachOpen}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M7 12.5V7a5 5 0 0 1 10 0v9a3 3 0 0 1-6 0V8a1 1 0 0 1 2 0v7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
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
        {activeList.type !== 'todo' && (
          <div className="add-bar-row store-row">
            <select className="store-select" value={storeChoice} onChange={(e) => setStoreChoice(e.target.value)}>
              <option value="">Butikk (valgfritt)</option>
              {availableStores.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
              <option value={CUSTOM_STORE}>Annet…</option>
            </select>
            {storeChoice === CUSTOM_STORE && (
              <input
                type="text"
                autoComplete="off"
                placeholder="Butikknavn"
                value={customStore}
                onChange={(e) => setCustomStore(e.target.value)}
              />
            )}
          </div>
        )}
        {attachOpen && (
          <div className="attach-panel">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleImagePick(e, setPendingImageFile, setPendingImagePreview)}
            />
            {pendingImagePreview ? (
              <div className="attach-image-preview">
                <img src={pendingImagePreview} alt="" />
                <button
                  type="button"
                  className="remove-attach"
                  aria-label="Fjern bilde"
                  onClick={removePendingImage}
                >
                  ×
                </button>
              </div>
            ) : (
              <button type="button" className="attach-option" onClick={() => fileInputRef.current?.click()}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="9" cy="10.5" r="1.6" fill="currentColor" />
                  <path
                    d="M4 16.5 8.5 12.5 11.5 15.2 15 11 20 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Legg til bilde fra kamerarull
              </button>
            )}
            <div className="attach-link-row">
              <svg className="link-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M9.5 14.5 14.5 9.5M11 8l1.6-1.6a3 3 0 0 1 4.2 4.2L15.2 12M13 16l-1.6 1.6a3 3 0 0 1-4.2-4.2L8.8 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="Lim inn lenke (valgfritt)"
                value={pendingLink}
                onChange={(e) => setPendingLink(e.target.value)}
              />
            </div>
          </div>
        )}
      </form>
        </div>
      )}

      {activeTab === 'middag' && (
        <div className="tab-view" key="middag">
          <header className={`header ${scrolled ? 'scrolled' : ''}`}>
            <div className="header-top">
              <span className="list-name">Middagsplanlegger</span>
              {userButtonEl}
            </div>
            <p className="subtitle">Kommer snart</p>
            {userPanelEl}
          </header>
          <main className="list placeholder-view">
            <div className="empty">
              <span className="placeholder-icon" aria-hidden="true">
                🍽️
              </span>
              <h2>Middagsplanlegger</h2>
              <p>Planlegg middager for uken sammen — kommer snart.</p>
            </div>
          </main>
        </div>
      )}

      <nav className="tab-bar">
        <button
          type="button"
          className={activeTab === 'liste' ? 'active' : ''}
          onClick={() => setActiveTab('liste')}
          aria-current={activeTab === 'liste'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="4.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M4.7 7l0.9 0.9L8 6.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="11" y1="7" x2="20.5" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <rect x="3.5" y="14.5" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M4.7 17l0.9 0.9L8 15.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="11" y1="17" x2="20.5" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>Liste</span>
        </button>
        <button
          type="button"
          className={activeTab === 'middag' ? 'active' : ''}
          onClick={() => setActiveTab('middag')}
          aria-current={activeTab === 'middag'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 2v6M8 2v6M10 2v6M8 8v14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M16 2c2 1 2 5 0 7-0.6 0.6-0.6 1 0 1v12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Middag</span>
        </button>
      </nav>

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

      {showToast && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Lukk">
            ×
          </button>
        </div>
      )}

      {userPicker}
    </div>
  )
}

export default App
