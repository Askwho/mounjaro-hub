import React, { useState } from 'react'
import { CalendarDays, Droplets, Check, TrendingDown, TrendingUp as TrendUp, Scale } from 'lucide-react'
import { formatDateShort, getDaysUntil, getDaysBetween } from '../lib/dateUtils'
import { getPenAvailability, getTotalCapacity } from '../lib/penCalculations'
import { calculateConcentration } from '../lib/pkCalculations'
import { updateDose } from '../lib/supabase'
import { toast } from 'sonner'

const Dashboard = ({ pens, doses, setDoses, penUsage, weights }) => {
  const [completingDoseId, setCompletingDoseId] = useState(null)

  const completedDoses = doses.filter(d => d.isCompleted).sort((a, b) => new Date(b.date) - new Date(a.date))
  const lastDose = completedDoses[0]
  const nextScheduled = doses
    .filter(d => !d.isCompleted && new Date(d.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0]

  const daysSinceLastDose = lastDose ? getDaysBetween(lastDose.date, new Date()) : null
  const daysUntilNext = nextScheduled ? getDaysUntil(nextScheduled.date) : null
  const currentConcentration = calculateConcentration(doses, new Date())

  const totalSupplyRemaining = pens.reduce((sum, pen) => {
    const usage = penUsage[pen.id] || 0
    const availability = getPenAvailability(pen.size, usage)
    const isExpired = new Date(pen.expirationDate) < new Date()
    return sum + (isExpired ? 0 : availability.total)
  }, 0)

  const activePen = pens.find(pen => {
    const usage = penUsage[pen.id] || 0
    const availability = getPenAvailability(pen.size, usage)
    return availability.total > 0 && new Date(pen.expirationDate) >= new Date()
  })

  const upcomingDoses = doses
    .filter(d => !d.isCompleted)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5)

  const handleMarkDone = async (doseId) => {
    setCompletingDoseId(doseId)
    try {
      await updateDose(doseId, { isCompleted: true })
      setDoses(prev => prev.map(d => d.id === doseId ? { ...d, isCompleted: true } : d))
      toast.success('Dose completed!')
    } catch (error) {
      toast.error('Failed to mark dose as completed.')
    } finally {
      setCompletingDoseId(null)
    }
  }

  // Weight widget calculations
  const sortedWeights = weights && weights.length > 0
    ? [...weights].sort((a, b) => new Date(a.date) - new Date(b.date))
    : []
  const latestWeight = sortedWeights.length > 0 ? sortedWeights[sortedWeights.length - 1] : null
  const firstWeight = sortedWeights.length > 0 ? sortedWeights[0] : null
  const weightChange = latestWeight && firstWeight && sortedWeights.length > 1
    ? latestWeight.weightKg - firstWeight.weightKg
    : null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4" role="status" aria-label="Days since last dose">
          <div className="text-sm text-slate-500 mb-1">Days Since Dose</div>
          <div className="text-3xl font-bold text-slate-800">
            {daysSinceLastDose !== null ? daysSinceLastDose : '—'}
          </div>
          {lastDose && (
            <div className="text-xs text-slate-400 mt-1">{formatDateShort(lastDose.date)}</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4" role="status" aria-label="Next scheduled dose">
          <div className="text-sm text-slate-500 mb-1">Next Dose</div>
          <div className="text-3xl font-bold text-slate-800">
            {daysUntilNext !== null ? (daysUntilNext === 0 ? 'Today' : `${daysUntilNext}d`) : '—'}
          </div>
          {nextScheduled && (
            <div className="text-xs text-slate-400 mt-1">{nextScheduled.mg}mg scheduled</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4" role="status" aria-label="Estimated concentration">
          <div className="text-sm text-slate-500 mb-1">Est. Concentration</div>
          <div className="text-3xl font-bold text-teal-600">
            {currentConcentration.toFixed(1)}<span className="text-lg">mg</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">in body now</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4" role="status" aria-label="Total supply remaining">
          <div className="text-sm text-slate-500 mb-1">Total Supply</div>
          <div className="text-3xl font-bold text-slate-800">
            {totalSupplyRemaining.toFixed(0)}<span className="text-lg">mg</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">across {pens.filter(p => new Date(p.expirationDate) >= new Date()).length} pen(s)</div>
        </div>

        {latestWeight && (
          <div className="bg-white rounded-xl border border-slate-200 p-4" role="status" aria-label="Current weight">
            <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-1">
              <Scale size={14} />
              <span>Current Weight</span>
            </div>
            <div className="text-3xl font-bold text-slate-800">
              {latestWeight.weightKg}<span className="text-lg">kg</span>
            </div>
            {weightChange !== null && (
              <div className="flex items-center gap-1 text-xs mt-1">
                {weightChange < 0 ? (
                  <>
                    <TrendingDown size={14} className="text-green-500" />
                    <span className="text-green-600 font-medium">{weightChange.toFixed(1)} kg</span>
                  </>
                ) : weightChange > 0 ? (
                  <>
                    <TrendUp size={14} className="text-red-500" />
                    <span className="text-red-600 font-medium">+{weightChange.toFixed(1)} kg</span>
                  </>
                ) : (
                  <span className="text-slate-400">No change</span>
                )}
                <span className="text-slate-400 ml-1">overall</span>
              </div>
            )}
          </div>
        )}
      </div>

      {activePen && (
        <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-5 text-white">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-teal-100 text-sm mb-1">Active Pen</div>
              <div className="text-3xl font-bold">{activePen.size} mg</div>
            </div>
            <Droplets size={32} className="text-teal-200" />
          </div>

          {(() => {
            const usage = penUsage[activePen.id] || 0
            const availability = getPenAvailability(activePen.size, usage)
            const totalCap = getTotalCapacity(activePen.size)

            return (
              <>
                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-teal-100">Remaining</span>
                    <span className="font-medium">{availability.total.toFixed(1)} mg</span>
                  </div>
                  <div className="h-2 bg-teal-400/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full"
                      style={{ width: `${(availability.total / totalCap) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xs text-teal-100">
                  <span>{availability.fromClicks.toFixed(1)}mg via clicks</span>
                  <span>{availability.fromSyringe.toFixed(1)}mg via syringe</span>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {upcomingDoses.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Upcoming Doses</h3>
          <div className="space-y-2">
            {upcomingDoses.map((dose, idx) => {
              const pen = pens.find(p => p.id === dose.penId)
              const daysUntil = getDaysUntil(dose.date)
              const prevDose = idx > 0 ? upcomingDoses[idx - 1] : completedDoses[0]
              const gap = prevDose ? getDaysBetween(prevDose.date, dose.date) : null
              const isCompleting = completingDoseId === dose.id

              return (
                <div key={dose.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                      <CalendarDays size={16} className="text-slate-500" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-700">{dose.mg} mg</div>
                      <div className="text-sm text-slate-500">{formatDateShort(dose.date)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`text-sm font-medium ${daysUntil === 0 ? 'text-teal-600' : 'text-slate-600'}`}>
                        {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                      </div>
                      {gap !== null && (
                        <div className="text-xs text-slate-400">{gap}d gap</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleMarkDone(dose.id)}
                      disabled={isCompleting}
                      aria-label={`Mark ${dose.mg}mg dose on ${formatDateShort(dose.date)} as done`}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check size={14} />
                      {isCompleting ? 'Saving...' : 'Mark as Done'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
