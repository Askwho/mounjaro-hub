import React, { useState, useMemo } from 'react'
import { Scale, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Scatter } from 'recharts'
import Modal from './ui/Modal'
import { formatDate, formatDateShort } from '../lib/dateUtils'
import { createWeight, deleteWeight } from '../lib/supabase'
import { toast } from 'sonner'

const WeightTracker = ({ weights, setWeights, doses, userId }) => {
  const [showAddModal, setShowAddModal] = useState(false)
  const [deletingEntry, setDeletingEntry] = useState(null)
  const [loading, setLoading] = useState(false)
  const [newEntry, setNewEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    weightKg: '',
    notes: ''
  })

  const sortedWeights = useMemo(
    () => [...weights].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [weights]
  )

  const displayWeights = useMemo(
    () => [...weights].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [weights]
  )

  // ---- Summary Stats ----
  const stats = useMemo(() => {
    if (sortedWeights.length === 0) return null

    const startWeight = sortedWeights[0].weightKg
    const currentWeight = sortedWeights[sortedWeights.length - 1].weightKg
    const totalChange = currentWeight - startWeight

    const firstDate = new Date(sortedWeights[0].date)
    const lastDate = new Date(sortedWeights[sortedWeights.length - 1].date)
    firstDate.setHours(0, 0, 0, 0)
    lastDate.setHours(0, 0, 0, 0)
    const daySpan = Math.round((lastDate - firstDate) / (1000 * 60 * 60 * 24))

    let weeks = Math.floor(daySpan / 7)
    let days = daySpan % 7
    let timeSpanLabel = ''
    if (weeks > 0 && days > 0) {
      timeSpanLabel = `${weeks} week${weeks !== 1 ? 's' : ''}, ${days} day${days !== 1 ? 's' : ''}`
    } else if (weeks > 0) {
      timeSpanLabel = `${weeks} week${weeks !== 1 ? 's' : ''}`
    } else {
      timeSpanLabel = `${days} day${days !== 1 ? 's' : ''}`
    }

    return { startWeight, currentWeight, totalChange, daySpan, timeSpanLabel }
  }, [sortedWeights])

  // ---- Chart Data ----
  const chartData = useMemo(() => {
    if (sortedWeights.length === 0) return []

    const completedDoses = doses
      .filter(d => d.isCompleted)
      .sort((a, b) => new Date(a.date) - new Date(b.date))

    const doseDateSet = new Set(completedDoses.map(d => d.date.split('T')[0]))

    return sortedWeights.map(w => {
      const dateStr = w.date.split('T')[0]
      return {
        date: dateStr,
        displayDate: formatDateShort(w.date),
        weightKg: w.weightKg,
        doseMarker: doseDateSet.has(dateStr) ? w.weightKg : null
      }
    })
  }, [sortedWeights, doses])

  // Compute dose markers that fall within the weight tracking time range
  const doseScatterData = useMemo(() => {
    if (sortedWeights.length === 0) return []

    const firstDate = new Date(sortedWeights[0].date)
    const lastDate = new Date(sortedWeights[sortedWeights.length - 1].date)
    firstDate.setHours(0, 0, 0, 0)
    lastDate.setHours(0, 0, 0, 0)

    const completedDoses = doses.filter(d => d.isCompleted)

    // Find the min weight for positioning dose markers at the bottom of the chart
    const minWeight = Math.min(...sortedWeights.map(w => w.weightKg))
    const yBottom = minWeight - 0.5

    return completedDoses
      .filter(d => {
        const dDate = new Date(d.date)
        dDate.setHours(0, 0, 0, 0)
        return dDate >= firstDate && dDate <= lastDate
      })
      .map(d => ({
        date: d.date.split('T')[0],
        displayDate: formatDateShort(d.date),
        doseMarker: yBottom,
        mg: d.mg
      }))
  }, [sortedWeights, doses])

  // Merge weight data with dose scatter points by date for the chart
  const mergedChartData = useMemo(() => {
    if (chartData.length === 0) return []

    const dateMap = new Map()

    // Add all weight entries
    chartData.forEach(entry => {
      dateMap.set(entry.date, { ...entry })
    })

    // Overlay dose markers
    doseScatterData.forEach(entry => {
      if (dateMap.has(entry.date)) {
        dateMap.get(entry.date).doseMarker = entry.doseMarker
        dateMap.get(entry.date).doseMg = entry.mg
      } else {
        dateMap.set(entry.date, {
          date: entry.date,
          displayDate: entry.displayDate,
          weightKg: null,
          doseMarker: entry.doseMarker,
          doseMg: entry.mg
        })
      }
    })

    return Array.from(dateMap.values()).sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    )
  }, [chartData, doseScatterData])

  // ---- Handlers ----
  const handleAddEntry = async () => {
    if (!newEntry.weightKg || !newEntry.date) return

    setLoading(true)
    try {
      const entry = await createWeight(userId, {
        date: newEntry.date,
        weightKg: parseFloat(newEntry.weightKg),
        notes: newEntry.notes
      })
      setWeights(prev => [...prev, entry])
      setShowAddModal(false)
      setNewEntry({
        date: new Date().toISOString().split('T')[0],
        weightKg: '',
        notes: ''
      })
      toast.success('Weight entry added')
    } catch (err) {
      console.error('Error adding weight entry:', err)
      toast.error('Failed to add weight entry')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteEntry = async () => {
    if (!deletingEntry) return

    setLoading(true)
    try {
      await deleteWeight(deletingEntry.id)
      setWeights(prev => prev.filter(w => w.id !== deletingEntry.id))
      setDeletingEntry(null)
      toast.success('Weight entry deleted')
    } catch (err) {
      console.error('Error deleting weight entry:', err)
      toast.error('Failed to delete weight entry')
    } finally {
      setLoading(false)
    }
  }

  const getChangeFromPrevious = (index) => {
    // displayWeights is sorted newest-first, so "previous" in time is index + 1
    if (index >= displayWeights.length - 1) return null
    const current = displayWeights[index].weightKg
    const previous = displayWeights[index + 1].weightKg
    return current - previous
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">Weight Tracker</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          aria-label="Add weight entry"
        >
          <Plus size={18} />
          Add Entry
        </button>
      </div>

      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-sm text-slate-500 mb-1">Starting Weight</div>
            <div className="text-3xl font-bold text-slate-800">
              {stats.startWeight.toFixed(1)}<span className="text-lg">kg</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {formatDateShort(sortedWeights[0].date)}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-sm text-slate-500 mb-1">Current Weight</div>
            <div className="text-3xl font-bold text-slate-800">
              {stats.currentWeight.toFixed(1)}<span className="text-lg">kg</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {formatDateShort(sortedWeights[sortedWeights.length - 1].date)}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-sm text-slate-500 mb-1">Total Change</div>
            <div className={`text-3xl font-bold ${
              stats.totalChange < 0 ? 'text-teal-600' :
              stats.totalChange > 0 ? 'text-rose-600' :
              'text-slate-800'
            }`}>
              {stats.totalChange > 0 ? '+' : ''}{stats.totalChange.toFixed(1)}<span className="text-lg">kg</span>
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              {stats.totalChange < 0 ? (
                <TrendingDown size={12} className="text-teal-500" />
              ) : stats.totalChange > 0 ? (
                <TrendingUp size={12} className="text-rose-500" />
              ) : null}
              {stats.totalChange < 0 ? 'Loss' : stats.totalChange > 0 ? 'Gain' : 'No change'}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-sm text-slate-500 mb-1">Time Span</div>
            <div className="text-3xl font-bold text-slate-800">
              {stats.daySpan}<span className="text-lg">d</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">{stats.timeSpanLabel}</div>
          </div>
        </div>
      )}

      {/* Weight Trend Chart */}
      {sortedWeights.length >= 2 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 mb-4">Weight Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={mergedChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                domain={['dataMin - 1', 'dataMax + 1']}
                label={{ value: 'kg', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const data = payload[0]?.payload
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-lg">
                      <div className="font-medium text-slate-800">{label}</div>
                      {data?.weightKg != null && (
                        <div className="text-teal-600">
                          Weight: {data.weightKg.toFixed(1)} kg
                        </div>
                      )}
                      {data?.doseMg && (
                        <div className="text-amber-600 mt-1 pt-1 border-t border-slate-100">
                          Dose: {data.doseMg} mg
                        </div>
                      )}
                    </div>
                  )
                }}
              />
              {stats && (
                <ReferenceLine
                  y={stats.startWeight}
                  stroke="#94a3b8"
                  strokeDasharray="5 5"
                  label={{ value: `Start: ${stats.startWeight.toFixed(1)}kg`, position: 'right', fill: '#94a3b8', fontSize: 11 }}
                />
              )}
              <Line
                type="monotone"
                dataKey="weightKg"
                stroke="#0d9488"
                strokeWidth={2}
                dot={{ r: 4, fill: '#0d9488', stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#0d9488', stroke: '#fff', strokeWidth: 2 }}
                connectNulls
              />
              <Scatter
                dataKey="doseMarker"
                fill="#f59e0b"
                shape={(props) => {
                  const { cx, cy } = props
                  if (cx == null || cy == null) return null
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill="#f59e0b"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  )
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-teal-600" />
              <span className="text-slate-600">Weight</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-slate-600">Dose date</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-slate-400" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #94a3b8 0, #94a3b8 4px, transparent 4px, transparent 8px)' }} />
              <span className="text-slate-600">Starting weight</span>
            </div>
          </div>
        </div>
      ) : sortedWeights.length === 1 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          <Scale size={48} className="mx-auto mb-3 opacity-50" />
          <p>Add at least two entries to see a trend chart</p>
        </div>
      ) : null}

      {/* Weight History Table */}
      {displayWeights.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Scale size={48} className="mx-auto mb-3 opacity-50" />
          <p>No weight entries yet</p>
          <p className="text-sm">Add your first entry to start tracking</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="font-semibold text-slate-800">Weight History</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {displayWeights.map((entry, idx) => {
              const change = getChangeFromPrevious(idx)

              return (
                <div key={entry.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-50 flex items-center justify-center">
                      <Scale size={18} className="text-teal-600" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">
                        {entry.weightKg.toFixed(1)} kg
                      </div>
                      <div className="text-sm text-slate-500">
                        {formatDate(entry.date)}
                        {entry.notes && (
                          <span className="ml-2 text-slate-400">&bull; {entry.notes}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {change !== null && (
                      <div className={`text-sm font-medium px-2 py-1 rounded ${
                        change < 0
                          ? 'text-teal-700 bg-teal-50'
                          : change > 0
                          ? 'text-rose-700 bg-rose-50'
                          : 'text-slate-600 bg-slate-100'
                      }`}>
                        {change > 0 ? '+' : ''}{change.toFixed(1)} kg
                      </div>
                    )}
                    <button
                      onClick={() => setDeletingEntry(entry)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      aria-label={`Delete weight entry from ${formatDate(entry.date)}`}
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

      {/* Add Entry Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Weight Entry">
        <div className="space-y-4">
          <div>
            <label htmlFor="weight-date" className="block text-sm font-medium text-slate-700 mb-2">
              Date
            </label>
            <input
              id="weight-date"
              type="date"
              value={newEntry.date}
              onChange={e => setNewEntry(prev => ({ ...prev, date: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label htmlFor="weight-kg" className="block text-sm font-medium text-slate-700 mb-2">
              Weight (kg)
            </label>
            <input
              id="weight-kg"
              type="number"
              step="0.1"
              min="0"
              placeholder="e.g. 85.5"
              value={newEntry.weightKg}
              onChange={e => setNewEntry(prev => ({ ...prev, weightKg: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label htmlFor="weight-notes" className="block text-sm font-medium text-slate-700 mb-2">
              Notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="weight-notes"
              type="text"
              placeholder="e.g. Morning weigh-in"
              value={newEntry.notes}
              onChange={e => setNewEntry(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <button
            onClick={handleAddEntry}
            disabled={!newEntry.weightKg || !newEntry.date || loading}
            className="w-full py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
            aria-label="Save weight entry"
          >
            <Plus size={18} />
            {loading ? 'Adding...' : 'Add Entry'}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deletingEntry} onClose={() => setDeletingEntry(null)} title="Delete Weight Entry">
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-center">
            <Trash2 size={24} className="mx-auto mb-2 text-rose-500" />
            <p className="font-medium text-rose-800">
              Delete {deletingEntry?.weightKg.toFixed(1)}kg entry from {deletingEntry ? formatDateShort(deletingEntry.date) : ''}?
            </p>
            <p className="text-sm text-rose-600 mt-1">This action cannot be undone.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDeletingEntry(null)}
              disabled={loading}
              className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteEntry}
              disabled={loading}
              className="flex-1 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-medium disabled:opacity-50"
              aria-label="Confirm delete weight entry"
            >
              {loading ? 'Deleting...' : 'Yes, Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default WeightTracker
