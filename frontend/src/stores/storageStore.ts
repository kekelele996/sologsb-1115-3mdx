import { create } from 'zustand'
import type { Storage, StorageTransfer } from '@/types'
import { db, deleteRow, loadAll, putRow } from '@/hooks/usePersistentStore'
import { transferStore } from '@/stores/transferStore'
import { encodeSlot } from '@/utils/codec'
import { uid } from '@/utils/id'

export interface TransferTarget {
  cabinet: string
  drawer: number
  box: number
  slot: number
}

export interface StorageState {
  rows: Storage[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (row: Storage) => Promise<void>
  remove: (id: string) => Promise<void>
  removeBySpecimen: (specimenId: string) => Promise<void>
  /**
   * 柜位调拨：同一事务内先校验目标插位空闲，再更新保藏位置并落调拨记录。
   * 目标被占用时整体放弃，原位置保持不变；成功时返回更新后的保藏位置。
   */
  transfer: (storageId: string, target: TransferTarget, handler: string) => Promise<Storage>
}

export const storageStore = create<StorageState>((set, get) => ({
  rows: [],
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<Storage>(db.storages)
    rows.sort((a, b) => (a.cabinet + a.drawer + a.box + a.slot).localeCompare(`${b.cabinet}${b.drawer}${b.box}${b.slot}`))
    set({ rows, loaded: true })
  },
  save: async (row) => {
    await putRow<Storage>(db.storages, row)
    await get().hydrate()
  },
  remove: async (id) => {
    await deleteRow<Storage>(db.storages, id)
    await get().hydrate()
  },
  removeBySpecimen: async (specimenId) => {
    const targets = get().rows.filter((row) => row.specimenId === specimenId)
    await Promise.all(targets.map((row) => deleteRow<Storage>(db.storages, row.id)))
    await get().hydrate()
  },
  transfer: async (storageId, target, handler) => {
    const current = get().rows.find((row) => row.id === storageId)
    if (!current) {
      throw new Error('未找到该插位记录，调拨未执行')
    }
    const date = new Date().toISOString().slice(0, 10)
    const next: Storage = {
      ...current,
      cabinet: target.cabinet.toUpperCase(),
      drawer: target.drawer,
      box: target.box,
      slot: target.slot,
      storedDate: date,
      handler
    }
    const record: StorageTransfer = {
      id: uid('trf'),
      specimenId: current.specimenId,
      storageId: current.id,
      fromCabinet: current.cabinet,
      fromDrawer: current.drawer,
      fromBox: current.box,
      fromSlot: current.slot,
      toCabinet: next.cabinet,
      toDrawer: next.drawer,
      toBox: next.box,
      toSlot: next.slot,
      date,
      handler
    }
    await db.transaction('rw', db.storages, db.transfers, async () => {
      const occupants = await db.storages
        .filter(
          (row) =>
            row.id !== current.id &&
            row.cabinet.toUpperCase() === next.cabinet &&
            row.drawer === next.drawer &&
            row.box === next.box &&
            row.slot === next.slot
        )
        .toArray()
      if (occupants.length > 0) {
        throw new Error(`目标插位 ${encodeSlot(next.cabinet, next.drawer, next.box, next.slot)} 已被占用，调拨未执行，原位置保持不变`)
      }
      await db.storages.put(next)
      await db.transfers.put(record)
    })
    await get().hydrate()
    await transferStore.getState().hydrate()
    return next
  }
}))
