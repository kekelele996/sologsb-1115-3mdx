import { create } from 'zustand'
import type { Storage, Transfer } from '@/types'
import { db, loadAll } from '@/hooks/usePersistentStore'
import { findSlotConflicts } from '@/utils/codec'
import { uid } from '@/utils/id'
import { storageStore } from '@/stores/storageStore'

/** 调拨目标柜位 */
export interface TransferTarget {
  cabinet: string
  drawer: number
  box: number
  slot: number
}

export interface TransferState {
  rows: Transfer[]
  loaded: boolean
  hydrate: () => Promise<void>
  /**
   * 调拨：同一事务内写入调拨记录并把柜位明细改挂到新插位，
   * 目标插位被占用则整体回滚，原位置不会先空掉
   */
  transfer: (storage: Storage, target: TransferTarget, handler: string) => Promise<Storage>
}

export const transferStore = create<TransferState>((set, get) => ({
  rows: [],
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<Transfer>(db.transfers)
    rows.sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`))
    set({ rows, loaded: true })
  },
  transfer: async (storage, target, handler) => {
    const date = new Date().toISOString().slice(0, 10)
    const moved: Storage = { ...storage, ...target, storedDate: date, handler }
    const record: Transfer = {
      id: uid('trf'),
      specimenId: storage.specimenId,
      fromCabinet: storage.cabinet,
      fromDrawer: storage.drawer,
      fromBox: storage.box,
      fromSlot: storage.slot,
      toCabinet: target.cabinet,
      toDrawer: target.drawer,
      toBox: target.box,
      toSlot: target.slot,
      date,
      handler
    }
    await db.transaction('rw', db.storages, db.transfers, async () => {
      const conflicts = findSlotConflicts(await db.storages.toArray(), moved)
      if (conflicts.length > 0) {
        throw new Error(`目标插位已被占用：${conflicts.map((item) => item.specimenId).join('、')}`)
      }
      await db.storages.put(moved)
      await db.transfers.put(record)
    })
    await storageStore.getState().hydrate()
    await get().hydrate()
    return moved
  }
}))
