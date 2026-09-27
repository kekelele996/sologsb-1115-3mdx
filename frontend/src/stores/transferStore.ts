import { create } from 'zustand'
import type { StorageTransfer } from '@/types'
import { db, loadAll } from '@/hooks/usePersistentStore'

export interface TransferState {
  rows: StorageTransfer[]
  loaded: boolean
  hydrate: () => Promise<void>
}

export const transferStore = create<TransferState>((set) => ({
  rows: [],
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<StorageTransfer>(db.transfers)
    rows.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id))
    set({ rows, loaded: true })
  }
}))
