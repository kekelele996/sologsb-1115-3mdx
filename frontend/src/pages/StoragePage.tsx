import { useMemo, useState } from 'react'
import type { Storage, StorageMethod } from '@/types'
import { STORAGE_METHODS } from '@/types'
import CabinetGrid from '@/components/common/CabinetGrid'
import StatusTag from '@/components/common/StatusTag'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { specimenStore } from '@/stores/specimenStore'
import { storageStore } from '@/stores/storageStore'
import { siteStore } from '@/stores/siteStore'
import { transferStore } from '@/stores/transferStore'
import { encodeSlot, findSlotConflicts, specimenTaxon, storageSlotText, transferRouteText } from '@/utils/codec'
import { uid } from '@/utils/id'

/** 保藏柜位图：柜-抽屉-盒-位三级展开，拖拽调整插位，重复占用给出提示，插位明细内调拨留痕 */
export default function StoragePage(): JSX.Element {
  const specimens = usePersistentStore(specimenStore, (state) => state.rows)
  const storages = usePersistentStore(storageStore, (state) => state.rows)
  const sites = usePersistentStore(siteStore, (state) => state.rows)
  const transfers = usePersistentStore(transferStore, (state) => state.rows)

  const [cabinet, setCabinet] = useState('C01')
  const [drawers, setDrawers] = useState(2)
  const [boxes, setBoxes] = useState(3)
  const [slots, setSlots] = useState(8)
  const [method, setMethod] = useState<StorageMethod>('针插')
  const [handler, setHandler] = useState('')
  const [picked, setPicked] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [warning, setWarning] = useState('')
  const [detail, setDetail] = useState<Storage | null>(null)
  const [transferring, setTransferring] = useState(false)
  const [target, setTarget] = useState({ cabinet: 'C01', drawer: 1, box: 1, slot: 1 })
  const [transferHandler, setTransferHandler] = useState('')

  const codeOf = (specimenId: string): string => specimens.find((item) => item.id === specimenId)?.code ?? '未知'
  const siteName = (siteId: string): string => sites.find((site) => site.id === siteId)?.name ?? '未关联采集地'
  const placedIds = useMemo(() => new Set(storages.map((item) => item.specimenId)), [storages])
  const unplaced = specimens.filter((item) => !placedIds.has(item.id))
  const detailTransfers = useMemo(
    () => (detail ? transfers.filter((item) => item.specimenId === detail.specimenId) : []),
    [detail, transfers]
  )

  const openDetail = (storage: Storage): void => {
    setDetail(storage)
    setTransferring(false)
  }

  const place = async (position: { cabinet: string; drawer: number; box: number; slot: number }): Promise<void> => {
    const specimenId = dragging ?? picked
    if (!specimenId) {
      setWarning('请先在右侧选择或拖动一份未入柜标本')
      return
    }
    const candidate: Storage = {
      id: storages.find((item) => item.specimenId === specimenId)?.id ?? uid('stg'),
      specimenId,
      method,
      cabinet: position.cabinet,
      drawer: position.drawer,
      box: position.box,
      slot: position.slot,
      storedDate: new Date().toISOString().slice(0, 10),
      handler: handler.trim()
    }
    const conflicts = findSlotConflicts(storages, candidate)
    if (conflicts.length > 0) {
      setWarning(
        `柜位 ${encodeSlot(position.cabinet, position.drawer, position.box, position.slot)} 已被占用：` +
          conflicts.map((item) => `${codeOf(item.specimenId)}（${item.method}）`).join('、') +
          '，请换一个插位或先出柜'
      )
      return
    }
    setWarning('')
    await storageStore.getState().save(candidate)
    setMessage(`${codeOf(specimenId)} 已入柜 ${storageSlotText(candidate)}`)
    setPicked('')
    setDragging(null)
  }

  const takeOut = async (storage: Storage): Promise<void> => {
    await storageStore.getState().remove(storage.id)
    setMessage(`${codeOf(storage.specimenId)} 已从 ${storageSlotText(storage)} 出柜`)
    setDetail(null)
  }

  /** 打开调拨表单：预填当前柜位，经手人沿用页面填写值 */
  const openTransfer = (): void => {
    if (!detail) return
    setTarget({ cabinet: detail.cabinet, drawer: detail.drawer, box: detail.box, slot: detail.slot })
    setTransferHandler(handler)
    setWarning('')
    setTransferring(true)
  }

  /** 调拨：校验通过后经 transferStore 同事务改挂柜位并留痕，目标被占用则原位置保持不变 */
  const submitTransfer = async (): Promise<void> => {
    if (!detail) return
    const handlerName = transferHandler.trim()
    if (!handlerName) {
      setWarning('请填写调拨经手人')
      return
    }
    const next = {
      cabinet: target.cabinet.trim().toUpperCase(),
      drawer: target.drawer,
      box: target.box,
      slot: target.slot
    }
    if (!next.cabinet) {
      setWarning('请填写新柜位所在的标本柜编号')
      return
    }
    if (encodeSlot(next.cabinet, next.drawer, next.box, next.slot) === storageSlotText(detail)) {
      setWarning('新柜位与当前柜位相同，无需调拨')
      return
    }
    const conflicts = findSlotConflicts(storages, { ...detail, ...next })
    if (conflicts.length > 0) {
      setWarning(
        `柜位 ${encodeSlot(next.cabinet, next.drawer, next.box, next.slot)} 已被占用：` +
          conflicts.map((item) => `${codeOf(item.specimenId)}（${item.method}）`).join('、') +
          '，调拨未执行，原位置保持不变'
      )
      return
    }
    setWarning('')
    try {
      const moved = await transferStore.getState().transfer(detail, next, handlerName)
      setDetail(moved)
      setTransferring(false)
      setMessage(`${codeOf(moved.specimenId)} 已调拨至 ${storageSlotText(moved)}（经手人 ${handlerName}），原位置已释放`)
    } catch {
      setWarning('调拨未执行：目标插位已被占用，原位置保持不变')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="page-title">保藏柜位图</h1>
        <p className="page-sub">
          按柜—抽屉—盒三级展开插位，空位虚线显示；拖动标本到插位即可入柜，重复占用会列出已有标本；点击占用插位可查看明细并调拨，调拨前后位置与经手人全程留痕。
        </p>
      </header>

      <section className="panel flex flex-wrap items-end gap-3">
        <div>
          <span className="field-label">标本柜编号</span>
          <input className="field-input w-28" value={cabinet} onChange={(e) => setCabinet(e.target.value.toUpperCase())} />
        </div>
        <div>
          <span className="field-label">抽屉数</span>
          <input type="number" min={1} max={8} className="field-input w-20" value={drawers} onChange={(e) => setDrawers(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div>
          <span className="field-label">每屉盒数</span>
          <input type="number" min={1} max={8} className="field-input w-20" value={boxes} onChange={(e) => setBoxes(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div>
          <span className="field-label">每盒插位</span>
          <input type="number" min={1} max={20} className="field-input w-20" value={slots} onChange={(e) => setSlots(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div>
          <span className="field-label">保藏方式</span>
          <select className="field-input w-28" value={method} onChange={(e) => setMethod(e.target.value as StorageMethod)}>
            {STORAGE_METHODS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">经手人</span>
          <input className="field-input w-32" value={handler} onChange={(e) => setHandler(e.target.value)} placeholder="如 覃羽" />
        </div>
        <div className="text-xs text-slate-500">
          已入柜 {storages.length} 份 · 未入柜 {unplaced.length} 份
          {picked ? ` · 当前选中 ${codeOf(picked)}` : ''}
        </div>
      </section>

      {warning ? <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p> : null}
      {message ? <p className="rounded-lg border border-field-100 bg-field-50 px-3 py-2 text-sm text-field-700">{message}</p> : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <CabinetGrid
          cabinet={cabinet}
          drawers={drawers}
          boxes={boxes}
          slots={slots}
          storages={storages}
          codeOf={codeOf}
          draggingCode={dragging ? codeOf(dragging) : picked ? codeOf(picked) : null}
          onDropSlot={(position) => void place(position)}
          onPickStorage={openDetail}
        />

        <div className="flex flex-col gap-4">
          <div className="panel">
            <h2 className="text-sm font-semibold text-slate-700">未入柜标本（拖到插位）</h2>
            <div className="mt-2 max-h-72 space-y-2 overflow-auto">
              {unplaced.map((specimen) => (
                <div
                  key={specimen.id}
                  draggable
                  onDragStart={() => setDragging(specimen.id)}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => setPicked(specimen.id)}
                  className={`cursor-grab rounded-lg border px-3 py-2 text-xs transition ${
                    picked === specimen.id ? 'border-field-500 bg-field-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-mono text-field-700">{specimen.code}</p>
                  <p className="text-slate-600">{specimenTaxon(specimen)}</p>
                  <p className="text-slate-400">
                    {siteName(specimen.siteId)} · <StatusTag status={specimen.status} />
                  </p>
                </div>
              ))}
              {unplaced.length === 0 ? <p className="text-xs text-slate-400">所有标本都已入柜</p> : null}
            </div>
          </div>

          <div className="panel">
            <h2 className="text-sm font-semibold text-slate-700">已入柜明细</h2>
            <ul className="mt-2 space-y-1.5 text-xs">
              {storages.map((storage) => (
                <li key={storage.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
                  <button type="button" className="flex-1 text-left" title="查看插位明细 / 调拨" onClick={() => openDetail(storage)}>
                    <span className="font-mono text-field-700">{storageSlotText(storage)}</span>
                    <span className="ml-2 text-slate-600">{codeOf(storage.specimenId)}</span>
                    <span className="ml-1 text-slate-400">{storage.method}</span>
                  </button>
                  <button className="btn-danger" type="button" onClick={() => void takeOut(storage)}>
                    出柜
                  </button>
                </li>
              ))}
              {storages.length === 0 ? <li className="text-slate-400">暂无入柜记录</li> : null}
            </ul>
          </div>

          {detail ? (
            <div className="panel">
              <h2 className="text-sm font-semibold text-slate-700">插位明细</h2>
              <p className="mt-1 text-xs text-slate-600">
                柜位 {storageSlotText(detail)} · {detail.method} · 入柜日期 {detail.storedDate} · 经手人{' '}
                {detail.handler || '—'}
              </p>
              <p className="text-xs text-slate-600">标本：{codeOf(detail.specimenId)}</p>

              {transferring ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-600">调拨到新柜位</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <span className="field-label">标本柜编号</span>
                      <input
                        className="field-input"
                        value={target.cabinet}
                        onChange={(e) => setTarget({ ...target, cabinet: e.target.value.toUpperCase() })}
                      />
                    </div>
                    <div>
                      <span className="field-label">抽屉号</span>
                      <input
                        type="number"
                        min={1}
                        className="field-input"
                        value={target.drawer}
                        onChange={(e) => setTarget({ ...target, drawer: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </div>
                    <div>
                      <span className="field-label">盒号</span>
                      <input
                        type="number"
                        min={1}
                        className="field-input"
                        value={target.box}
                        onChange={(e) => setTarget({ ...target, box: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </div>
                    <div>
                      <span className="field-label">插位序号</span>
                      <input
                        type="number"
                        min={1}
                        className="field-input"
                        value={target.slot}
                        onChange={(e) => setTarget({ ...target, slot: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="field-label">调拨经手人（必填）</span>
                    <input
                      className="field-input"
                      value={transferHandler}
                      onChange={(e) => setTransferHandler(e.target.value)}
                      placeholder="如 覃羽"
                    />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="btn-primary" type="button" onClick={() => void submitTransfer()}>
                      确认调拨
                    </button>
                    <button className="btn-ghost" type="button" onClick={() => setTransferring(false)}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary" type="button" onClick={openTransfer}>
                    调拨
                  </button>
                  <button className="btn-ghost" type="button" onClick={() => setDetail(null)}>
                    关闭
                  </button>
                </div>
              )}

              {detailTransfers.length > 0 ? (
                <div className="mt-3">
                  <h3 className="text-xs font-semibold text-slate-500">调拨记录（{detailTransfers.length}）</h3>
                  <ul className="mt-1 space-y-1 text-xs text-slate-600">
                    {detailTransfers.map((item) => (
                      <li key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                        <span className="font-mono text-field-700">{transferRouteText(item)}</span>
                        <span className="ml-2">{item.date}</span>
                        <span className="ml-1 text-slate-400">经手人 {item.handler || '—'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
