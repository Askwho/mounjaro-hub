import React, { useState } from 'react'
import { Package, Plus, Trash2, AlertTriangle, Clock } from 'lucide-react'
import { toast } from 'sonner'
import Modal from './ui/Modal'
import { PEN_SIZES } from '../lib/constants'
import { getPenAvailability, getTotalCapacity, getClickCapacity, getSyringeCapacity } from '../lib/penCalculations'
import { formatDateShort, getDaysUntil } from '../lib/dateUtils'
import { createPen, deletePen, deleteDosesByPenId } from '../lib/supabase'

const PenInventory = ({ pens, setPens, doses, setDoses, penUsage, userId }) => {
  const [showAddModal, setShowAddModal] = useState(false)
  const [deletingPen, setDeletingPen] = useState(null)
  const [loading, setLoading] = useState(false)
  const [newPen, setNewPen] = useState({
    size: 10,
    expirationDate: '',
    notes: ''
  })

  const handleAddPen = async () => {
    if (!newPen.expirationDate) return

    setLoading(true)
    try {
      const pen = await createPen(userId, {
        size: newPen.size,
        purchaseDate: new Date().toISOString(),
        expirationDate: newPen.expirationDate,
        notes: newPen.notes
      })
      setPens(prev => [...prev, pen])
      setShowAddModal(false)
      setNewPen({ size: 10, expirationDate: '', notes: '' })
      toast.success(`${newPen.size}mg pen added`)
    } catch (err) {
      console.error('Error adding pen:', err)
      toast.error('Failed to add pen')
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePen = async () => {
    if (!deletingPen) return

    setLoading(true)
    try {
      await deleteDosesByPenId(deletingPen.id)
      await deletePen(deletingPen.id)
      setPens(prev => prev.filter(p => p.id !== deletingPen.id))
      setDoses(prev => prev.filter(d => d.penId !== deletingPen.id))
      toast.success(`${deletingPen.size}mg pen deleted`)
      setDeletingPen(null)
    } catch (err) {
      console.error('Error deleting pen:', err)
      toast.error('Failed to delete pen')
    } finally {
      setLoading(false)
    }
  }

  const getDosesForPen = (penId) => doses.filter(d => d.penId === penId)

  const sortedPens = [...pens].sort((a, b) => {
    const aExpired = new Date(a.expirationDate) < new Date()
    const bExpired = new Date(b.expirationDate) < new Date()
    if (aExpired !== bExpired) return aExpired ? 1 : -1

    const aUsage = penUsage[a.id] || 0
    const bUsage = penUsage[b.id] || 0
    const aEmpty = getPenAvailability(a.size, aUsage).total === 0
    const bEmpty = getPenAvailability(b.size, bUsage).total === 0
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1

    return new Date(a.expirationDate) - new Date(b.expirationDate)
  })

  const deletingPenDoses = deletingPen ? getDosesForPen(deletingPen.id) : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">Pen Inventory</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          aria-label="Add new pen"
        >
          <Plus size={18} />
          Add Pen
        </button>
      </div>

      {sortedPens.length === 0 ? (
        <div className="text-center py-12 text-slate-500" role="status">
          <Package size={48} className="mx-auto mb-3 opacity-50" />
          <p>No pens in inventory</p>
          <p className="text-sm">Add your first pen to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label="Pen inventory">
          {sortedPens.map(pen => {
            const usage = penUsage[pen.id] || 0
            const availability = getPenAvailability(pen.size, usage)
            const totalCap = getTotalCapacity(pen.size)
            const isExpired = new Date(pen.expirationDate) < new Date()
            const isExpiringSoon = !isExpired && getDaysUntil(pen.expirationDate) <= 14
            const isEmpty = availability.total === 0
            const penDoseCount = getDosesForPen(pen.id).length

            return (
              <div
                key={pen.id}
                role="listitem"
                className={`rounded-xl border p-4 animate-slide-up ${
                  isExpired ? 'bg-rose-50 border-rose-200' :
                  isEmpty ? 'bg-slate-50 border-slate-200 opacity-60' :
                  isExpiringSoon ? 'bg-amber-50 border-amber-200' :
                  'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-2xl font-bold text-slate-800">{pen.size} mg</div>
                    <div className="text-sm text-slate-500">KwikPen</div>
                  </div>
                  <button
                    onClick={() => setDeletingPen(pen)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    aria-label={`Delete ${pen.size}mg pen`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Remaining</span>
                    <span className="font-medium text-slate-700">{availability.total.toFixed(1)} mg</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow={availability.total} aria-valuemax={totalCap} aria-label="Pen remaining">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isExpired ? 'bg-rose-400' : isExpiringSoon ? 'bg-amber-400' : 'bg-teal-500'
                      }`}
                      style={{ width: `${(availability.total / totalCap) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{availability.fromClicks.toFixed(1)}mg clicks</span>
                    <span>{availability.fromSyringe.toFixed(1)}mg syringe</span>
                  </div>
                </div>

                <div className={`flex items-center gap-1.5 text-sm ${
                  isExpired ? 'text-rose-600' : isExpiringSoon ? 'text-amber-600' : 'text-slate-500'
                }`}>
                  {isExpired ? <AlertTriangle size={14} /> : <Clock size={14} />}
                  <span>
                    {isExpired ? 'Expired' : `Expires ${formatDateShort(pen.expirationDate)}`}
                    {!isExpired && ` (${getDaysUntil(pen.expirationDate)} days)`}
                  </span>
                </div>

                {penDoseCount > 0 && (
                  <div className="mt-2 text-xs text-slate-400">
                    {penDoseCount} dose{penDoseCount !== 1 ? 's' : ''} logged
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={!!deletingPen} onClose={() => setDeletingPen(null)} title="Delete Pen">
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-center">
            <Trash2 size={24} className="mx-auto mb-2 text-rose-500" />
            <p className="font-medium text-rose-800">Delete {deletingPen?.size}mg pen?</p>
            {deletingPenDoses.length > 0 ? (
              <p className="text-sm text-rose-600 mt-2">
                <AlertTriangle size={14} className="inline mr-1" />
                This pen has {deletingPenDoses.length} dose{deletingPenDoses.length !== 1 ? 's' : ''} logged.
                Deleting will also remove {deletingPenDoses.length === 1 ? 'this dose' : 'these doses'}.
              </p>
            ) : (
              <p className="text-sm text-rose-600 mt-1">This action cannot be undone.</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDeletingPen(null)}
              disabled={loading}
              className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeletePen}
              disabled={loading}
              className="flex-1 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? 'Deleting...' : 'Yes, Delete'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Pen">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2" id="pen-size-label">Pen Size</label>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="pen-size-label">
              {PEN_SIZES.map(size => (
                <button
                  key={size}
                  onClick={() => setNewPen(p => ({ ...p, size }))}
                  role="radio"
                  aria-checked={newPen.size === size}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    newPen.size === size
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-teal-300'
                  }`}
                >
                  {size} mg
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="pen-expiry" className="block text-sm font-medium text-slate-700 mb-2">Expiration Date</label>
            <input
              id="pen-expiry"
              type="date"
              value={newPen.expirationDate}
              onChange={e => setNewPen(p => ({ ...p, expirationDate: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
            <div>Total capacity: <span className="font-medium">{getTotalCapacity(newPen.size)} mg</span></div>
            <div className="text-slate-400">({getClickCapacity(newPen.size)}mg via clicks + {getSyringeCapacity(newPen.size)}mg via syringe)</div>
          </div>

          <button
            onClick={handleAddPen}
            disabled={!newPen.expirationDate || loading}
            className="w-full py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <Plus size={18} />
            {loading ? 'Adding...' : 'Add Pen'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default PenInventory
