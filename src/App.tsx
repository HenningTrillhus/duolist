import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, ReactNode, UIEvent } from 'react'
import { motion } from 'framer-motion'
import { supabase } from './lib/supabase'
import { minMunch } from './lib/minMunch'
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
  completed_at: string | null
  archived: boolean
  created_at: string
  position: number
}

type HistoryEntry = Item & { lists: { name: string } | null }

type ListType = 'grocery' | 'todo' | 'shopping'

type ShoppingList = {
  id: string
  name: string
  type: ListType
  created_at: string
  updated_at: string | null
}

type CourseKey = 'main' | 'side' | 'starter' | 'dessert'

type RecipeStats = {
  love_rating: number | null
  difficulty: number | null
  prep_time_minutes: number | null
}

type RecipeLink = RecipeStats & {
  recipe_id: string
  image_url: string | null
}

type RecipeLinks = Partial<Record<CourseKey, RecipeLink>>

type Recipe = RecipeStats & {
  id: string
  title: string
  type: string | null
  image_url: string | null
}

type Dinner = {
  id: string
  date: string
  name: string
  side: string | null
  starter: string | null
  dessert: string | null
  image_url: string | null
  recipe_links: RecipeLinks
  added_by: UserName | null
  created_at: string
}

const COURSE_LABELS: Record<CourseKey, string> = {
  main: 'Middag',
  side: 'Tilbehør',
  starter: 'Forrett',
  dessert: 'Dessert',
}

const COURSE_PLACEHOLDERS: Record<CourseKey, string> = {
  main: 'Hva skal dere spise?',
  side: 'F.eks. pommes frites',
  starter: 'F.eks. salat',
  dessert: 'F.eks. is',
}

// Min Munch's recipe "type" that best matches each course. Starter has no
// direct equivalent, so it starts unfiltered.
const COURSE_TYPE_FILTER: Record<CourseKey, string> = {
  main: 'Middag',
  side: 'Tilbehør',
  starter: '',
  dessert: 'Dessert',
}

const RECIPE_TYPES = [
  'Frokost',
  'Lunsj',
  'Middag',
  'Dessert',
  'Saus',
  'Tilbehør',
  'Siderett',
  'Bakevare',
  'Drikke',
]

function formatDinnerMain(d: Dinner): string {
  return d.side ? `${d.name} med ${d.side}` : d.name
}

const COURSE_ORDER: CourseKey[] = ['main', 'side', 'starter', 'dessert']

function dinnerImages(d: Dinner): string[] {
  return COURSE_ORDER.map((course) => d.recipe_links?.[course]?.image_url).filter(
    (url): url is string => !!url,
  )
}

function formatRecipeStats(stats: RecipeStats): string[] {
  const parts: string[] = []
  if (stats.love_rating) parts.push(`❤️ ${stats.love_rating}/5`)
  if (stats.difficulty) parts.push(`⭐ ${stats.difficulty}/5`)
  if (stats.prep_time_minutes != null) parts.push(`⏱ ${stats.prep_time_minutes} min`)
  return parts
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

function sortByPosition<T extends { position: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position)
}

type ConfettiPiece = {
  id: number
  color: string
  dx: number
  dy: number
  rotate: number
  delay: number
}

const CONFETTI_COLORS = ['#ff4d6d', '#ffd60a', '#06d6a0', '#4cc9f0', '#b388ff', '#ff9f1c', '#f72585']

function makeConfetti(): ConfettiPiece[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    dx: (Math.random() - 0.5) * 70,
    dy: -(18 + Math.random() * 40),
    rotate: (Math.random() - 0.5) * 320,
    delay: Math.random() * 0.05,
  }))
}

// Checked-off items sink to the bottom of their list/store-group, most
// recently completed last, so ticking something off always sends it further
// down rather than dropping it wherever its original position happened to be.
function sortDoneToBottom(items: Item[]): Item[] {
  const active = items.filter((i) => !i.done)
  const done = items
    .filter((i) => i.done)
    .sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''))
  return [...active, ...done]
}

function nextPositionFor(list: Item[], index: number): number {
  const prev = index > 0 ? list[index - 1] : null
  const next = index < list.length - 1 ? list[index + 1] : null
  if (prev && next) return (prev.position + next.position) / 2
  if (prev) return prev.position + 1
  if (next) return next.position - 1
  return Date.now() / 1000
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

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return '—'
  const time = date.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return `i dag kl. ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `i går kl. ${time}`
  return `${date.toLocaleDateString('no-NO', { day: '2-digit', month: 'short' })} kl. ${time}`
}

type HistoryGroup = { label: string; entries: HistoryEntry[] }

function groupHistoryByDay(entries: HistoryEntry[]): HistoryGroup[] {
  const map = new Map<string, HistoryEntry[]>()
  for (const entry of entries) {
    const d = entry.completed_at ? new Date(entry.completed_at) : null
    const key = d && !Number.isNaN(d.getTime()) ? d.toDateString() : 'ukjent'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(entry)
  }
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  return [...map.entries()].map(([key, groupEntries]) => {
    let label: string
    if (key === 'ukjent') {
      label = 'Ukjent dato'
    } else if (key === now.toDateString()) {
      label = 'I dag'
    } else if (key === yesterday.toDateString()) {
      label = 'I går'
    } else {
      const d = new Date(key)
      label = d.toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'long' })
      label = label.charAt(0).toUpperCase() + label.slice(1)
    }
    return { label, entries: groupEntries }
  })
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDayLabel(d: Date): string {
  const diffDays = Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86400000)
  if (diffDays === 0) return 'I dag'
  if (diffDays === 1) return 'I morgen'
  if (diffDays === -1) return 'I går'
  const weekday = d.toLocaleDateString('no-NO', { weekday: 'short' })
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${d.getDate()}.${d.getMonth() + 1}`
}

function formatDinnerEditorTitle(key: string): string {
  const d = new Date(`${key}T00:00:00`)
  const label = d.toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'long' })
  return `Middag – ${label}`
}

const DAY_STRIP_BEFORE = 60
const DAY_STRIP_AFTER = 180

function daysInMonthGrid(monthStart: Date): (Date | null)[] {
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = (firstDay.getDay() + 6) % 7
  const cells: (Date | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let day = 1; day <= lastDay.getDate(); day++) cells.push(new Date(year, month, day))
  return cells
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

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const [dinners, setDinners] = useState<Dinner[]>([])
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [dinnerEditorDate, setDinnerEditorDate] = useState<string | null>(null)
  const [dinnerNameInput, setDinnerNameInput] = useState('')
  const [dinnerSideInput, setDinnerSideInput] = useState('')
  const [dinnerStarterInput, setDinnerStarterInput] = useState('')
  const [dinnerDessertInput, setDinnerDessertInput] = useState('')
  const [dinnerRecipeLinks, setDinnerRecipeLinks] = useState<RecipeLinks>({})
  const dayStripRef = useRef<HTMLDivElement | null>(null)

  const [recipePickerCourse, setRecipePickerCourse] = useState<CourseKey | null>(null)
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [recipesLoading, setRecipesLoading] = useState(false)
  const [recipesError, setRecipesError] = useState<string | null>(null)
  const [recipeSearch, setRecipeSearch] = useState('')
  const [recipeTypeFilter, setRecipeTypeFilter] = useState('')

  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [justAddedIds, setJustAddedIds] = useState<Set<string>>(new Set())
  const [justCompletedIds, setJustCompletedIds] = useState<Set<string>>(new Set())
  const [confettiBursts, setConfettiBursts] = useState<Map<string, ConfettiPiece[]>>(new Map())
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

  const [listMenuId, setListMenuId] = useState<string | null>(null)
  const listMenuRef = useRef<HTMLDivElement>(null)
  const [editingListId, setEditingListId] = useState<string | null>(null)
  const [editListName, setEditListName] = useState('')
  const [editListType, setEditListType] = useState<ListType>('grocery')

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const itemListRef = useRef<HTMLUListElement | null>(null)

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

  // Load dinners once and keep them in sync in real time.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('dinners')
      .select('*')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          return
        }
        setDinners(data)
      })

    const channel = supabase
      .channel('dinners-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dinners' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Dinner
            setDinners((prev) => (prev.some((d) => d.id === row.id) ? prev : [...prev, row]))
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as Dinner
            setDinners((prev) => prev.map((d) => (d.id === row.id ? row : d)))
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as Dinner
            setDinners((prev) => prev.filter((d) => d.id !== row.id))
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
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
      .eq('archived', false)
      .order('position', { ascending: true })
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
            if (row.archived) return
            setItems((prev) => (prev.some((i) => i.id === row.id) ? prev : sortByPosition([...prev, row])))
            setJustAddedIds((prev) => new Set(prev).add(row.id))
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as Item
            if (row.archived) {
              setItems((prev) => prev.filter((i) => i.id !== row.id))
            } else {
              setItems((prev) =>
                sortByPosition(
                  prev.some((i) => i.id === row.id) ? prev.map((i) => (i.id === row.id ? row : i)) : [...prev, row],
                ),
              )
            }
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
        setListMenuId(null)
        setEditingListId(null)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [switcherOpen])

  useEffect(() => {
    if (!listMenuId) return
    const onClickOutside = (e: MouseEvent) => {
      if (listMenuRef.current && !listMenuRef.current.contains(e.target as Node)) {
        setListMenuId(null)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [listMenuId])

  // Reorder a todo list's items by dragging: live-splice the item into the
  // hovered slot as the pointer moves, then persist a single midpoint
  // position value between its new neighbours on release.
  useEffect(() => {
    if (!draggingId) return
    const draggedId = draggingId
    const onMove = (e: PointerEvent) => {
      const container = itemListRef.current
      if (!container) return
      const liNodes = Array.from(container.querySelectorAll('li[data-item-id]')) as HTMLLIElement[]
      if (liNodes.length === 0) return
      let targetIndex = liNodes.length - 1
      for (let i = 0; i < liNodes.length; i++) {
        const rect = liNodes[i].getBoundingClientRect()
        if (e.clientY < rect.top + rect.height / 2) {
          targetIndex = i
          break
        }
      }
      setItems((prev) => {
        const currentIndex = prev.findIndex((it) => it.id === draggedId)
        if (currentIndex === -1 || currentIndex === targetIndex) return prev
        const next = [...prev]
        const [moved] = next.splice(currentIndex, 1)
        next.splice(targetIndex, 0, moved)
        return next
      })
    }
    const onUp = () => {
      setDraggingId(null)
      setItems((prev) => {
        const index = prev.findIndex((it) => it.id === draggedId)
        if (index === -1) return prev
        const newPosition = nextPositionFor(prev, index)
        supabase
          .from('items')
          .update({ position: newPosition })
          .eq('id', draggedId)
          .then(({ error }) => {
            if (error) setError(error.message)
          })
        return prev.map((it) => (it.id === draggedId ? { ...it, position: newPosition } : it))
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [draggingId])

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
      completed_at: null,
      archived: false,
      created_at: new Date().toISOString(),
      position: Date.now() / 1000,
    }
    setItems((prev) => sortByPosition([...prev, optimisticItem]))
    setJustAddedIds((prev) => new Set(prev).add(optimisticId))
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
    const patch = { done: nextDone, completed_at: nextDone ? new Date().toISOString() : null }
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)))
    if (nextDone) {
      setJustCompletedIds((prev) => new Set(prev).add(item.id))
      setConfettiBursts((prev) => new Map(prev).set(item.id, makeConfetti()))
      setTimeout(() => {
        setJustCompletedIds((prev) => {
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
        setConfettiBursts((prev) => {
          const next = new Map(prev)
          next.delete(item.id)
          return next
        })
      }, 700)
    }
    const { error } = await supabase.from('items').update(patch).eq('id', item.id)
    if (error) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, done: item.done, completed_at: item.completed_at } : i)),
      )
      setError(error.message)
    }
  }

  // Items that were ever completed are archived rather than deleted, so they
  // still show up in Historikk after being removed from the active list.
  const deleteItem = async (item: Item) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    if (item.done) {
      const { error } = await supabase.from('items').update({ archived: true }).eq('id', item.id)
      if (error) {
        setItems((prev) => sortByPosition([...prev, item]))
        setError(error.message)
      }
      return
    }
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (error) {
      setItems((prev) => sortByPosition([...prev, item]))
      setError(error.message)
      return
    }
    deleteStoredImage(item.image_url)
  }

  const clearDone = async (doneItems: Item[]) => {
    if (doneItems.length === 0) return
    const doneIds = doneItems.map((i) => i.id)
    setItems((prev) => prev.filter((i) => !doneIds.includes(i.id)))
    const { error } = await supabase.from('items').update({ archived: true }).in('id', doneIds)
    if (error) {
      setItems((prev) => sortByPosition([...prev, ...doneItems]))
      setError(error.message)
    }
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

  const startEditList = (list: ShoppingList) => {
    setListMenuId(null)
    setEditingListId(list.id)
    setEditListName(list.name)
    setEditListType(list.type)
  }

  const cancelEditList = () => {
    setEditingListId(null)
  }

  const saveEditList = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingListId) return
    const name = editListName.trim()
    if (!name) return
    const id = editingListId
    const previous = lists.find((l) => l.id === id)
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name, type: editListType } : l)))
    setEditingListId(null)
    const { error } = await supabase.from('lists').update({ name, type: editListType }).eq('id', id)
    if (error) {
      if (previous) setLists((prev) => prev.map((l) => (l.id === id ? previous : l)))
      setError(error.message)
    }
  }

  const deleteList = (list: ShoppingList) => {
    setConfirmDialog(null)
    setLists((prev) => prev.filter((l) => l.id !== list.id))
    if (activeId === list.id) {
      const next = lists.find((l) => l.id !== list.id)
      if (next) setActiveId(next.id)
    }
    supabase
      .from('lists')
      .delete()
      .eq('id', list.id)
      .then(({ error }) => {
        if (error) {
          setLists((prev) => sortByCreatedAt([...prev, list]))
          setError(error.message)
        }
      })
  }

  const askDeleteList = (list: ShoppingList) => {
    setListMenuId(null)
    if (lists.length <= 1) {
      setError('Du må ha minst én liste')
      return
    }
    setConfirmDialog({
      message: `Slette listen «${list.name}»? Alle varer i den blir også slettet.`,
      onConfirm: () => deleteList(list),
    })
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

  const openHistory = async () => {
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryError(null)
    const { data, error } = await supabase
      .from('items')
      .select('*, lists(name)')
      .eq('done', true)
      .order('completed_at', { ascending: false })
      .limit(200)
    setHistoryLoading(false)
    if (error) {
      setHistoryError(error.message)
      return
    }
    setHistoryEntries(data as unknown as HistoryEntry[])
  }

  const dayList = useMemo(() => {
    const today = startOfDay(new Date())
    const days: Date[] = []
    for (let i = -DAY_STRIP_BEFORE; i <= DAY_STRIP_AFTER; i++) days.push(addDays(today, i))
    return days
  }, [])

  const dinnersByDate = useMemo(() => {
    const map = new Map<string, Dinner>()
    for (const d of dinners) map.set(d.date, d)
    return map
  }, [dinners])

  const scrollToDate = (key: string, behavior: ScrollBehavior) => {
    const container = dayStripRef.current
    if (!container) return
    const el = container.querySelector<HTMLElement>(`[data-date="${key}"]`)
    if (!el) return
    container.scrollTo({ left: el.offsetLeft - container.offsetLeft, behavior })
  }

  // useCallback keeps this ref's identity stable across re-renders — an inline
  // arrow function here would get a new identity every render, making React
  // detach/reattach it (and re-run the "jump to today" reset) on every
  // unrelated state change, not just on the day-strip's actual mount.
  const setDayStripRef = useCallback((el: HTMLDivElement | null) => {
    dayStripRef.current = el
    if (el) {
      requestAnimationFrame(() => scrollToDate(dateKey(new Date()), 'auto'))
    }
  }, [])

  const shiftCalendarMonth = (delta: number) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const pickCalendarDate = (d: Date) => {
    setCalendarOpen(false)
    // 'auto' (instant), not 'smooth': animated scrollTo fights with this
    // strip's CSS scroll-snap and reliably lands on the wrong card.
    scrollToDate(dateKey(d), 'auto')
  }

  const openDinnerEditor = (key: string, existing: Dinner | undefined) => {
    setDinnerEditorDate(key)
    setDinnerNameInput(existing?.name ?? '')
    setDinnerSideInput(existing?.side ?? '')
    setDinnerStarterInput(existing?.starter ?? '')
    setDinnerDessertInput(existing?.dessert ?? '')
    setDinnerRecipeLinks(existing?.recipe_links ?? {})
  }

  const closeDinnerEditor = () => setDinnerEditorDate(null)

  const saveDinner = async (e: FormEvent) => {
    e.preventDefault()
    const key = dinnerEditorDate
    if (!key) return
    const name = dinnerNameInput.trim()
    if (!name) return
    const side = dinnerSideInput.trim() || null
    const starter = dinnerStarterInput.trim() || null
    const dessert = dinnerDessertInput.trim() || null
    const recipe_links = dinnerRecipeLinks
    const imageUrl = recipe_links.main?.image_url ?? null
    const existing = dinners.find((d) => d.date === key)
    closeDinnerEditor()

    if (existing) {
      const previous = existing
      const updated = { name, side, starter, dessert, recipe_links, image_url: imageUrl }
      setDinners((prev) => prev.map((d) => (d.id === existing.id ? { ...d, ...updated } : d)))
      const { error } = await supabase.from('dinners').update(updated).eq('id', existing.id)
      if (error) {
        setDinners((prev) => prev.map((d) => (d.id === previous.id ? previous : d)))
        setError(error.message)
      }
      return
    }

    const optimisticId = crypto.randomUUID()
    const optimistic: Dinner = {
      id: optimisticId,
      date: key,
      name,
      side,
      starter,
      dessert,
      image_url: imageUrl,
      recipe_links,
      added_by: currentUser,
      created_at: new Date().toISOString(),
    }
    setDinners((prev) => [...prev, optimistic])
    const { error } = await supabase.from('dinners').insert({
      id: optimisticId,
      date: key,
      name,
      side,
      starter,
      dessert,
      image_url: imageUrl,
      recipe_links,
      added_by: currentUser,
    })
    if (error) {
      setDinners((prev) => prev.filter((d) => d.id !== optimisticId))
      setError(error.message)
    }
  }

  const ensureRecipesLoaded = async () => {
    if (recipes || recipesLoading) return
    setRecipesLoading(true)
    setRecipesError(null)
    const { data, error } = await minMunch
      .from('recipes')
      .select('id, title, type, image_url, love_rating, difficulty, prep_time_minutes')
      .order('title', { ascending: true })
    setRecipesLoading(false)
    if (error) {
      setRecipesError(error.message)
      return
    }
    setRecipes(data)
  }

  const openRecipePicker = (course: CourseKey) => {
    setRecipeSearch('')
    setRecipeTypeFilter(COURSE_TYPE_FILTER[course])
    setRecipePickerCourse(course)
    ensureRecipesLoaded()
  }

  const closeRecipePicker = () => setRecipePickerCourse(null)

  const courseInputSetters: Record<CourseKey, (v: string) => void> = {
    main: setDinnerNameInput,
    side: setDinnerSideInput,
    starter: setDinnerStarterInput,
    dessert: setDinnerDessertInput,
  }

  const pickRecipe = (recipe: Recipe) => {
    const course = recipePickerCourse
    if (!course) return
    courseInputSetters[course](recipe.title)
    setDinnerRecipeLinks((prev) => ({
      ...prev,
      [course]: {
        recipe_id: recipe.id,
        image_url: recipe.image_url,
        love_rating: recipe.love_rating,
        difficulty: recipe.difficulty,
        prep_time_minutes: recipe.prep_time_minutes,
      },
    }))
    setRecipePickerCourse(null)
  }

  const unlinkCourseRecipe = (course: CourseKey) => {
    setDinnerRecipeLinks((prev) => {
      const next = { ...prev }
      delete next[course]
      return next
    })
  }

  const courseValues: Record<CourseKey, string> = {
    main: dinnerNameInput,
    side: dinnerSideInput,
    starter: dinnerStarterInput,
    dessert: dinnerDessertInput,
  }

  const renderCourseField = (course: CourseKey, required: boolean) => {
    const link = dinnerRecipeLinks[course]
    const value = courseValues[course]
    const stats = link ? formatRecipeStats(link) : []
    return (
      <div className="dinner-field" key={course}>
        <label className="dinner-field-label" htmlFor={`dinner-${course}-input`}>
          {COURSE_LABELS[course]}
          {!required && ' (valgfritt)'}
        </label>
        <div className="dinner-field-row">
          {link ? (
            <div className="recipe-chip">
              {link.image_url ? (
                <img src={link.image_url} alt="" />
              ) : (
                <span className="recipe-chip-icon" aria-hidden="true">
                  🍽️
                </span>
              )}
              <span className="recipe-chip-title">{value}</span>
              <button
                type="button"
                className="recipe-chip-remove"
                aria-label="Fjern kobling til oppskrift"
                onClick={() => unlinkCourseRecipe(course)}
              >
                ×
              </button>
            </div>
          ) : (
            <input
              id={`dinner-${course}-input`}
              type="text"
              autoComplete="off"
              placeholder={COURSE_PLACEHOLDERS[course]}
              value={value}
              onChange={(e) => courseInputSetters[course](e.target.value)}
              autoFocus={course === 'main'}
            />
          )}
          <button
            type="button"
            className="recipe-pick-button"
            onClick={() => openRecipePicker(course)}
            aria-label={`Velg ${COURSE_LABELS[course].toLowerCase()} fra Min Munch`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 6.5c-1.8-1.1-4-1.3-6-.8v12.6c2-.5 4.2-.3 6 .8 1.8-1.1 4-1.3 6-.8V5.7c-2-.5-4.2-.3-6 .8Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path d="M12 6.5v12.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </button>
        </div>
        {stats.length > 0 && <div className="recipe-chip-stats">{stats.join('   ')}</div>}
      </div>
    )
  }

  const askDeleteDinner = () => {
    const key = dinnerEditorDate
    const existing = dinners.find((d) => d.date === key)
    if (!existing) return
    closeDinnerEditor()
    setConfirmDialog({
      message: `Fjerne middag «${existing.name}»?`,
      onConfirm: () => {
        setConfirmDialog(null)
        setDinners((prev) => prev.filter((d) => d.id !== existing.id))
        supabase
          .from('dinners')
          .delete()
          .eq('id', existing.id)
          .then(({ error }) => {
            if (error) {
              setDinners((prev) => [...prev, existing])
              setError(error.message)
            }
          })
      },
    })
  }

  const remaining = items.filter((item) => !item.done).length
  const hasDone = items.some((item) => item.done)

  const isTodoList = activeList?.type === 'todo'

  // Priority number = live rank among not-yet-done items, so finishing #1
  // automatically bumps #2 up to #1.
  const priorityRanks = useMemo(() => {
    const map = new Map<string, number>()
    if (!isTodoList) return map
    let rank = 1
    for (const item of items) {
      if (!item.done) map.set(item.id, rank++)
    }
    return map
  }, [items, isTodoList])

  const startItemDrag = (e: ReactPointerEvent, itemId: string) => {
    e.preventDefault()
    setDraggingId(itemId)
  }

  const renderItem = (item: Item) => {
    const owner = item.added_by
    const style = owner ? { borderLeftColor: USER_COLORS[owner].accent } : undefined
    const isRemoving = removingIds.has(item.id)
    const isDragging = draggingId === item.id
    const classes = [
      item.done ? 'done' : '',
      isRemoving ? 'removing' : '',
      editingId === item.id ? 'editing' : '',
      isDragging ? 'dragging' : '',
      justCompletedIds.has(item.id) ? 'just-completed' : '',
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <motion.li
        key={item.id}
        data-item-id={item.id}
        className={classes}
        style={style}
        layout="position"
        initial={justAddedIds.has(item.id) ? { opacity: 0, y: 60, scale: 0.88, rotate: 2 } : false}
        animate={{
          opacity: isRemoving ? 0 : 1,
          scale: isRemoving ? 0.94 : isDragging ? 1.03 : 1,
          y: 0,
          rotate: 0,
        }}
        transition={{
          layout: { type: 'spring', stiffness: 260, damping: 24, mass: 0.9 },
          y: { type: 'spring', stiffness: 260, damping: 22 },
          default: { type: 'spring', stiffness: 420, damping: 26 },
        }}
      >
        <span className="checkbox-wrap">
          <button
            type="button"
            className={`checkbox ${isTodoList ? 'checkbox-priority' : ''}`}
            aria-label={item.done ? 'Merk som ikke fullført' : 'Merk som fullført'}
            aria-pressed={item.done}
            onClick={() => toggleItem(item)}
          >
            {item.done ? (
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
            ) : (
              isTodoList && <span className="priority-number">{priorityRanks.get(item.id)}</span>
            )}
          </button>
          {confettiBursts.get(item.id)?.map((piece) => (
            <motion.span
              key={piece.id}
              className="confetti-piece"
              style={{ background: piece.color }}
              initial={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
              animate={{ opacity: 0, x: piece.dx, y: piece.dy, scale: 0.4, rotate: piece.rotate }}
              transition={{ duration: 0.65, delay: piece.delay, ease: 'easeOut' }}
            />
          ))}
        </span>

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
            {isTodoList && (
              <button
                type="button"
                className="drag-handle"
                aria-label={`Flytt ${item.text}`}
                onPointerDown={(e) => startItemDrag(e, item.id)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="9" cy="6" r="1.6" fill="currentColor" />
                  <circle cx="15" cy="6" r="1.6" fill="currentColor" />
                  <circle cx="9" cy="12" r="1.6" fill="currentColor" />
                  <circle cx="15" cy="12" r="1.6" fill="currentColor" />
                  <circle cx="9" cy="18" r="1.6" fill="currentColor" />
                  <circle cx="15" cy="18" r="1.6" fill="currentColor" />
                </svg>
              </button>
            )}
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
      </motion.li>
    )
  }

  const displayItems = sortDoneToBottom(items)

  let listContent: ReactNode = null
  if (activeList) {
    if (items.length === 0) {
      listContent = <div className="empty">{LIST_TYPE_EMPTY[activeList.type]}</div>
    } else if (activeList.type === 'todo') {
      listContent = (
        <ul ref={itemListRef} className={draggingId ? 'dragging-active' : ''}>
          {displayItems.map(renderItem)}
        </ul>
      )
    } else {
      const groups = groupByStore(displayItems, availableStores)
      if (groups.length === 1 && groups[0].store === null) {
        listContent = <ul>{displayItems.map(renderItem)}</ul>
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
      <span
        className="user-avatar"
        style={{ background: currentUser ? USER_COLORS[currentUser].accent : undefined }}
      >
        {currentUser ? currentUser[0] : '?'}
      </span>
    </button>
  )

  const headerActionsEl = (
    <div className="header-actions">
      <button type="button" className="history-button" onClick={openHistory} aria-label="Historikk">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 7.5V12l3 2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {userButtonEl}
    </div>
  )

  const middagHeaderActionsEl = (
    <div className="header-actions">
      <button
        type="button"
        className="today-button"
        onClick={() => scrollToDate(dateKey(new Date()), 'auto')}
      >
        I dag
      </button>
      <button
        type="button"
        className="calendar-button"
        onClick={() => setCalendarOpen(true)}
        aria-label="Velg dato"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {userButtonEl}
    </div>
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
              {headerActionsEl}
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

          {headerActionsEl}
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
                  <li key={l.id} className="switcher-row">
                    {editingListId === l.id ? (
                      <form className="switcher-edit-form" onSubmit={saveEditList}>
                        <div className="switcher-edit-row">
                          <input
                            type="text"
                            autoComplete="off"
                            value={editListName}
                            onChange={(e) => setEditListName(e.target.value)}
                            autoFocus
                          />
                          <select
                            value={editListType}
                            onChange={(e) => setEditListType(e.target.value as ListType)}
                          >
                            {(Object.keys(LIST_TYPE_LABELS) as ListType[]).map((type) => (
                              <option key={type} value={type}>
                                {LIST_TYPE_LABELS[type]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="switcher-edit-actions">
                          <button type="button" className="cancel" onClick={cancelEditList}>
                            Avbryt
                          </button>
                          <button type="submit" className="confirm" disabled={!editListName.trim()}>
                            Lagre
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`switcher-select ${l.id === activeList.id ? 'active' : ''}`}
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
                        <div
                          className="switcher-menu-wrap"
                          ref={listMenuId === l.id ? listMenuRef : undefined}
                        >
                          <button
                            type="button"
                            className="switcher-menu-btn"
                            aria-label={`Flere valg for ${l.name}`}
                            aria-expanded={listMenuId === l.id}
                            onClick={() => setListMenuId((v) => (v === l.id ? null : l.id))}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <circle cx="12" cy="5" r="1.9" fill="currentColor" />
                              <circle cx="12" cy="12" r="1.9" fill="currentColor" />
                              <circle cx="12" cy="19" r="1.9" fill="currentColor" />
                            </svg>
                          </button>
                          {listMenuId === l.id && (
                            <div className="switcher-menu-dropdown">
                              <button type="button" onClick={() => startEditList(l)}>
                                Endre navn / type
                              </button>
                              <button type="button" className="danger" onClick={() => askDeleteList(l)}>
                                Slett liste
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
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
              {middagHeaderActionsEl}
            </div>
            {userPanelEl}
          </header>
          <main className="list dinner-main">
            <div className="day-strip" ref={setDayStripRef}>
              {dayList.map((d) => {
                const key = dateKey(d)
                const dinner = dinnersByDate.get(key)
                const isToday = key === dateKey(new Date())
                return (
                  <div className="day-card" key={key} data-date={key}>
                    <div className={`day-card-label ${isToday ? 'is-today' : ''}`}>{formatDayLabel(d)}</div>
                    {dinner ? (
                      <button
                        type="button"
                        className="day-dinner filled"
                        onClick={() => openDinnerEditor(key, dinner)}
                      >
                        {(() => {
                          const images = dinnerImages(dinner)
                          if (images.length === 0) {
                            return (
                              <div className="day-dinner-image-slot">
                                <span className="day-dinner-icon" aria-hidden="true">
                                  🍽️
                                </span>
                              </div>
                            )
                          }
                          return (
                            <div className={`day-dinner-image-slot split-${images.length}`}>
                              {images.map((url, i) => (
                                <img key={i} src={url} alt="" />
                              ))}
                            </div>
                          )
                        })()}
                        <div className="day-dinner-name">
                          <span className="day-dinner-main">{formatDinnerMain(dinner)}</span>
                          {dinner.starter && <span className="day-dinner-extra">Forrett: {dinner.starter}</span>}
                          {dinner.dessert && <span className="day-dinner-extra">Dessert: {dinner.dessert}</span>}
                          {dinner.recipe_links?.main && (
                            <span className="day-dinner-stats">
                              {formatRecipeStats(dinner.recipe_links.main).join('   ')}
                            </span>
                          )}
                        </div>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="day-dinner empty"
                        onClick={() => openDinnerEditor(key, undefined)}
                      >
                        <span className="day-dinner-plus" aria-hidden="true">
                          +
                        </span>
                        <span className="day-dinner-label">Velg middag</span>
                      </button>
                    )}
                  </div>
                )
              })}
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

      {historyOpen && (
        <div className="modal-backdrop" onClick={() => setHistoryOpen(false)}>
          <div className="history-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="history-header">
              <h2>Historikk</h2>
              <button
                type="button"
                className="history-close"
                onClick={() => setHistoryOpen(false)}
                aria-label="Lukk"
              >
                ×
              </button>
            </div>
            <div className="history-body">
              {historyLoading ? (
                <div className="loading">
                  <div className="spinner" aria-label="Laster" />
                </div>
              ) : historyError ? (
                <p className="loading-error">Feil: {historyError}</p>
              ) : !historyEntries || historyEntries.length === 0 ? (
                <div className="empty">Ingen fullførte varer ennå</div>
              ) : (
                groupHistoryByDay(historyEntries).map((group) => (
                  <div className="history-group" key={group.label}>
                    <div className="history-day-label">{group.label}</div>
                    {group.entries.map((entry) => (
                      <div className="history-row" key={entry.id}>
                        <div className="history-row-main">
                          <span className="history-text">{entry.text}</span>
                          {entry.lists?.name && <span className="history-list-badge">{entry.lists.name}</span>}
                        </div>
                        <div className="history-times">
                          <span>Lagt til {formatDateTime(entry.created_at)}</span>
                          <span>Fullført {formatDateTime(entry.completed_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {calendarOpen && (
        <div className="modal-backdrop" onClick={() => setCalendarOpen(false)}>
          <div className="modal-card calendar-card" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-header">
              <button type="button" onClick={() => shiftCalendarMonth(-1)} aria-label="Forrige måned">
                ‹
              </button>
              <span className="calendar-month-label">
                {calendarMonth.toLocaleDateString('no-NO', { month: 'long', year: 'numeric' })}
              </span>
              <button type="button" onClick={() => shiftCalendarMonth(1)} aria-label="Neste måned">
                ›
              </button>
            </div>
            <div className="calendar-weekdays">
              {['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {daysInMonthGrid(calendarMonth).map((d, i) =>
                d ? (
                  <button
                    type="button"
                    key={dateKey(d)}
                    className={`calendar-day ${dateKey(d) === dateKey(new Date()) ? 'today' : ''} ${
                      dinnersByDate.has(dateKey(d)) ? 'has-dinner' : ''
                    }`}
                    onClick={() => pickCalendarDate(d)}
                  >
                    {d.getDate()}
                  </button>
                ) : (
                  <span key={`empty-${i}`} className="calendar-day empty" />
                ),
              )}
            </div>
          </div>
        </div>
      )}

      {dinnerEditorDate && (
        <div className="modal-backdrop" onClick={closeDinnerEditor}>
          <div className="modal-card dinner-editor" onClick={(e) => e.stopPropagation()}>
            <h2>{formatDinnerEditorTitle(dinnerEditorDate)}</h2>
            <form onSubmit={saveDinner}>
              {renderCourseField('main', true)}
              {renderCourseField('side', false)}
              {renderCourseField('starter', false)}
              {renderCourseField('dessert', false)}
              <div className="dinner-editor-actions">
                {dinners.some((d) => d.date === dinnerEditorDate) && (
                  <button type="button" className="danger-text" onClick={askDeleteDinner}>
                    Fjern
                  </button>
                )}
                <button type="button" className="cancel" onClick={closeDinnerEditor}>
                  Avbryt
                </button>
                <button type="submit" className="confirm" disabled={!dinnerNameInput.trim()}>
                  Lagre
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {recipePickerCourse && (
        <div className="modal-backdrop" onClick={closeRecipePicker}>
          <div className="history-sheet recipe-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="history-header">
              <h2>Velg {COURSE_LABELS[recipePickerCourse].toLowerCase()}</h2>
              <button type="button" className="history-close" onClick={closeRecipePicker} aria-label="Lukk">
                ×
              </button>
            </div>
            <div className="recipe-picker-filters">
              <input
                type="text"
                autoComplete="off"
                placeholder="Søk i oppskrifter…"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
                autoFocus
              />
              <select value={recipeTypeFilter} onChange={(e) => setRecipeTypeFilter(e.target.value)}>
                <option value="">Alle typer</option>
                {RECIPE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="history-body recipe-picker-body">
              {recipesLoading ? (
                <div className="loading">
                  <div className="spinner" aria-label="Laster" />
                </div>
              ) : recipesError ? (
                <p className="loading-error">Feil: {recipesError}</p>
              ) : (
                (() => {
                  const filtered = (recipes ?? []).filter((r) => {
                    if (recipeTypeFilter && r.type !== recipeTypeFilter) return false
                    if (recipeSearch && !r.title.toLowerCase().includes(recipeSearch.toLowerCase())) return false
                    return true
                  })
                  if (filtered.length === 0) {
                    return <div className="empty">Ingen oppskrifter matcher</div>
                  }
                  return (
                    <ul className="recipe-picker-list">
                      {filtered.map((r) => {
                        const stats = formatRecipeStats(r)
                        return (
                          <li key={r.id}>
                            <button type="button" className="recipe-picker-row" onClick={() => pickRecipe(r)}>
                              <div className="recipe-picker-thumb">
                                {r.image_url ? (
                                  <img src={r.image_url} alt="" />
                                ) : (
                                  <span aria-hidden="true">🍽️</span>
                                )}
                              </div>
                              <div className="recipe-picker-info">
                                <span className="recipe-picker-title">{r.title}</span>
                                {stats.length > 0 && (
                                  <span className="recipe-picker-stats">{stats.join('   ')}</span>
                                )}
                              </div>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )
                })()
              )}
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
