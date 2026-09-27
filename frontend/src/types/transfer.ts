/** Transfer 调拨记录：标本在柜位间调整的留痕 */
export interface Transfer {
  id: string
  specimenId: string
  /** 调拨前柜位 */
  fromCabinet: string
  fromDrawer: number
  fromBox: number
  fromSlot: number
  /** 调拨后柜位 */
  toCabinet: string
  toDrawer: number
  toBox: number
  toSlot: number
  /** 调拨日期 */
  date: string
  /** 调拨经手人 */
  handler: string
}
