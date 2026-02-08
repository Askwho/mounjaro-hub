import React, { useState, useMemo, useCallback } from 'react'
import { TrendingUp } from 'lucide-react'
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts'
import { HALF_LIFE_DAYS } from '../lib/constants'
import { formatDateShort } from '../lib/dateUtils'

const PKDecayChart = ({ doses }) => {
  const [viewMode, setViewMode] = useState('actual')

  const calculateConcentrationWithMode = useCallback((targetDate, includePlanned) => {
    const target = new Date(targetDate)
    target.setHours(12, 0, 0, 0)

    let concentration = 0

    const relevantDoses = doses
      .filter(d => {
        if (includePlanned) {
          return new Date(d.date) <= target
        } else {
          return d.isCompleted && new Date(d.date) <= target
        }
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date))

    for (const dose of relevantDoses) {
      const doseDate = new Date(dose.date)
      doseDate.setHours(12, 0, 0, 0)
      const daysSinceDose = (target - doseDate) / (1000 * 60 * 60 * 24)

      if (daysSinceDose >= 0) {
        const remaining = dose.mg * Math.pow(0.5, daysSinceDose / HALF_LIFE_DAYS)
        concentration += remaining
      }
    }

    return concentration
  }, [doses])

  const chartData = useMemo(() => {
    const completedDoses = doses.filter(d => d.isCompleted).sort((a, b) => new Date(a.date) - new Date(b.date))
    const allDoses = [...doses].sort((a, b) => new Date(a.date) - new Date(b.date))

    if (completedDoses.length === 0) return []

    const firstDose = new Date(completedDoses[0].date)
    firstDose.setHours(0, 0, 0, 0)

    const lastCompletedDose = new Date(completedDoses[completedDoses.length - 1].date)
    const lastScheduledDose = allDoses.length > 0 ? new Date(allDoses[allDoses.length - 1].date) : lastCompletedDose

    const projectionEnd = new Date(Math.max(lastCompletedDose, lastScheduledDose))
    projectionEnd.setDate(projectionEnd.getDate() + 21)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const data = []
    let currentDate = new Date(firstDose)

    while (currentDate <= projectionEnd) {
      const dateStr = currentDate.toISOString().split('T')[0]
      const isPast = currentDate <= today

      const actualConc = calculateConcentrationWithMode(currentDate, false)
      const plannedConc = calculateConcentrationWithMode(currentDate, true)

      const dayDoses = doses.filter(d => d.date.split('T')[0] === dateStr)
      const completedDayDose = dayDoses.find(d => d.isCompleted)
      const scheduledDayDose = dayDoses.find(d => !d.isCompleted)

      data.push({
        date: dateStr,
        displayDate: formatDateShort(currentDate),
        actual: isPast ? actualConc : null,
        projected: !isPast ? (viewMode === 'plan' ? plannedConc : actualConc) : null,
        completedDose: completedDayDose?.mg,
        scheduledDose: scheduledDayDose?.mg,
        isToday: currentDate.toDateString() === today.toDateString()
      })

      currentDate.setDate(currentDate.getDate() + 1)
    }

    return data
  }, [doses, calculateConcentrationWithMode, viewMode])

  const completedDoses = doses.filter(d => d.isCompleted)
  const scheduledDoses = doses.filter(d => !d.isCompleted)

  const steadyStateEstimate = completedDoses.length >= 4
    ? completedDoses.slice(-4).reduce((sum, d) => sum + d.mg, 0) / 4 * 1.5
    : null

  if (completedDoses.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-800">PK Decay Chart</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500" role="status">
          <TrendingUp size={48} className="mx-auto mb-3 opacity-50" />
          <p>No completed doses yet</p>
          <p className="text-sm">Complete a dose to see concentration tracking</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">PK Decay Chart</h2>
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('actual')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'actual' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            Actual
          </button>
          <button
            onClick={() => setViewMode('plan')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
              viewMode === 'plan' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            Plan
            {scheduledDoses.length > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">
                {scheduledDoses.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
              label={{ value: 'mg', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const data = payload[0]?.payload
                return (
                  <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-lg">
                    <div className="font-medium text-slate-800">{label}</div>
                    <div className="text-teal-600">
                      Level: {(data?.actual ?? data?.projected ?? 0).toFixed(1)} mg
                    </div>
                    {data?.completedDose && (
                      <div className="text-teal-700 mt-1 pt-1 border-t border-slate-100">
                        Completed: {data.completedDose} mg
                      </div>
                    )}
                    {data?.scheduledDose && (
                      <div className="text-amber-700 mt-1 pt-1 border-t border-slate-100">
                        Scheduled: {data.scheduledDose} mg
                      </div>
                    )}
                  </div>
                )
              }}
            />
            {steadyStateEstimate && (
              <ReferenceLine
                y={steadyStateEstimate}
                stroke="#94a3b8"
                strokeDasharray="5 5"
                label={{ value: 'Est. Steady State', position: 'right', fill: '#94a3b8', fontSize: 11 }}
              />
            )}
            <Area
              type="monotone"
              dataKey="actual"
              stroke="#0d9488"
              fill="#ccfbf1"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="projected"
              stroke={viewMode === 'plan' ? '#f59e0b' : '#0d9488'}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-6 mt-4 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 bg-teal-100 border-2 border-teal-600 rounded-sm" />
          <span className="text-slate-600">Completed doses</span>
        </div>
        {viewMode === 'plan' ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-amber-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #f59e0b 0, #f59e0b 4px, transparent 4px, transparent 8px)' }} />
            <span className="text-slate-600">Including scheduled doses</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-teal-600" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #0d9488 0, #0d9488 4px, transparent 4px, transparent 8px)' }} />
            <span className="text-slate-600">Projected decay</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default PKDecayChart
