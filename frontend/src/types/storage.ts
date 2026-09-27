/** 保藏方式 */
export const STORAGE_METHODS = ['针插', '浸液', '玻片', '干燥'] as const
export type StorageMethod = (typeof STORAGE_METHODS)[number]

/** Storage 保藏位置 */
export interface Storage {
  id: string
  specimenId: string
  method: StorageMethod
  /** 标本柜编号 */
  cabinet: string
  /** 抽屉号 */
  drawer: number
  /** 标本盒号 */
  box: number
  /** 插位序号 */
  slot: number
  storedDate: string
  handler: string
}

/** StorageTransfer 柜位调拨记录：一次调拨前后位置、日期与经手人 */
export interface StorageTransfer {
  id: string
  specimenId: string
  /** 关联的保藏位置记录（调拨只改位置，沿用同一条 Storage） */
  storageId: string
  fromCabinet: string
  fromDrawer: number
  fromBox: number
  fromSlot: number
  toCabinet: string
  toDrawer: number
  toBox: number
  toSlot: number
  /** 调拨日期 */
  date: string
  /** 调拨经手人 */
  handler: string
}
