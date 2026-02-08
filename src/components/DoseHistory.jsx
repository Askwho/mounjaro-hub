import React, { useState } from 'react'
import { History, Syringe, Check, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Modal from './ui/Modal'
import { isDoseSyringe } from '../lib/penCalculations'
import { formatDate, formatDateShort, getDaysBetween } from '../lib/dateUtils'
import { deleteDose } from '../lib/supabase'

const DoseHistory = ({ pens, doses, setDoses, penUsage, userId }) => {
  const [deletingDose, setDeletingDose] = useState(null)
  const [loading, setLoading] = useState(false)

  const sortedDoses = [...doses]
    .filter(d => d.isCompleted)
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const handleDeleteDose = async () => {
    if (!deletingDose) return

    setLoading(true)
    try {
      await deleteDose(deletingDose.id)
      setDoses(prev => prev.filter(d => d.id !== deletingDose.id))
      toast.success('Dose deleted')
      setDeletingDose(null)
    } catch (err) {
      console.error('Error deleting dose:', err)
      toast.error('Failed to delete dose')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-800">Dose History</h2>

      {sortedDoses.length === 0 ? (
        <div className="text-center py-12 text-slate-500" role="status">
          <History size={48} className="mx-auto mb-3 opacity-50" />
          <p>No dose history yet</p>
          <p className="text-sm">Completed doses will appear here</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100" role="list" aria-label="Completed doses">
            {sortedDoses.map((dose, idx) => {
              const pen = pens.find(p => p.id === dose.penId)
              const prevDose = sortedDoses[idx + 1]
              const daysSincePrev = prevDose ? getDaysBetween(prevDose.date, dose.date) : null
              const isSyringe = isDoseSyringe(dose, pens, doses)

              return (
                <div key={dose.id} role="listitem" className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isSyringe ? 'bg-amber-50' : 'bg-teal-50'
                    }`}>
                      {isSyringe ? (
                        <Syringe size={18} className="text-amber-600" />
                      ) : (
                        <Check size={18} className="text-teal-600" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">
                        {dose.mg} mg
                        {isSyringe && (
                          <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            Syringe
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-500">
                        {formatDate(dose.date)}
                        {pen && <span className="ml-2 text-slate-400">&bull; {pen.size}mg pen</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {daysSincePrev !== null && (
                      <div className="text-sm text-slate-500 bg-slate-100 px-2 py-1 rounded">
                        {daysSincePrev} days since last
                      </div>
                    )}
                    <button
                      onClick={() => setDeletingDose(dose)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      aria-label={`Delete ${dose.mg}mg dose from ${formatDateShort(dose.date)}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Modal isOpen={!!deletingDose} onClose={() => setDeletingDose(null)} title="Delete Dose">
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-center">
            <Trash2 size={24} className="mx-auto mb-2 text-rose-500" />
            <p className="font-medium text-rose-800">
              Delete {deletingDose?.mg}mg dose from {deletingDose ? formatDateShort(deletingDose.date) : ''}?
            </p>
            <p className="text-sm text-rose-600 mt-1">This action cannot be undone.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDeletingDose(null)}
              disabled={loading}
              className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteDose}
              disabled={loading}
              className="flex-1 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? 'Deleting...' : 'Yes, Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default DoseHistory
