import React, { useState, useMemo } from 'react'
import { Calendar, BarChart3, Check, AlertTriangle, Clock, Target, Award } from 'lucide-react'
import { toast } from 'sonner'
import { calculateSystemMetrics } from '../lib/metricsCalculations'
import { formatDateShort } from '../lib/dateUtils'
import { savePenMetricsSnapshot, saveSystemMetricsSnapshot } from '../lib/supabase'

const MetricsOverview = ({ pens, doses, penUsage, userId }) => {
  const metrics = useMemo(() => calculateSystemMetrics(pens, doses, penUsage), [pens, doses, penUsage])
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [snapshotSaved, setSnapshotSaved] = useState(false)

  const handleSaveSnapshot = async () => {
    setSavingSnapshot(true)
    setSnapshotSaved(false)
    try {
      const today = new Date().toISOString().split('T')[0]

      await saveSystemMetricsSnapshot(userId, metrics, today)

      for (const penMetric of metrics.penMetrics) {
        await savePenMetricsSnapshot(userId, penMetric, today)
      }

      setSnapshotSaved(true)
      toast.success('Metrics snapshot saved')
      setTimeout(() => setSnapshotSaved(false), 3000)
    } catch (err) {
      console.error('Error saving metrics snapshot:', err)
      toast.error('Failed to save snapshot')
    } finally {
      setSavingSnapshot(false)
    }
  }

  if (pens.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-800">Pen Metrics & Analytics</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          <BarChart3 size={48} className="mx-auto mb-3 opacity-50" />
          <p>No pens to analyze</p>
          <p className="text-sm">Add pens to see detailed metrics</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">Pen Metrics & Analytics</h2>
        <button
          onClick={handleSaveSnapshot}
          disabled={savingSnapshot}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            snapshotSaved
              ? 'bg-teal-100 text-teal-700 border border-teal-300'
              : 'bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50'
          }`}
        >
          {snapshotSaved ? (
            <>
              <Check size={18} />
              Snapshot Saved
            </>
          ) : (
            <>
              <Calendar size={18} />
              {savingSnapshot ? 'Saving...' : 'Save Daily Snapshot'}
            </>
          )}
        </button>
      </div>

      {/* Critical Metrics - Days Between Last Use and Expiry */}
      <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-5 text-white">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-teal-100 text-sm mb-1">Critical Metric</div>
            <div className="text-2xl font-bold">Last Use to Expiry Gap</div>
          </div>
          <Target size={32} className="text-teal-200" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-teal-100 text-xs mb-1">Average Days Between</div>
            <div className="text-2xl font-bold">
              {metrics.criticalMetrics.avgDaysBetweenLastUseAndExpiry !== null
                ? Math.round(metrics.criticalMetrics.avgDaysBetweenLastUseAndExpiry)
                : '—'}
            </div>
            <div className="text-xs text-teal-100 mt-1">last use and expiry</div>
          </div>

          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-teal-100 text-xs mb-1">Pens Expired With Med</div>
            <div className="text-2xl font-bold">
              {metrics.criticalMetrics.pensExpiredWithMedication}
            </div>
            <div className="text-xs text-teal-100 mt-1">
              {metrics.criticalMetrics.totalMedicationWasted > 0 &&
                `${metrics.criticalMetrics.totalMedicationWasted.toFixed(1)}mg wasted`}
            </div>
          </div>

          <div className="bg-white/10 rounded-lg p-3">
            <div className="text-teal-100 text-xs mb-1">Pens At Risk</div>
            <div className="text-2xl font-bold">{metrics.pensAtRisk.length}</div>
            <div className="text-xs text-teal-100 mt-1">may expire before empty</div>
          </div>
        </div>
      </div>

      {/* System-Wide Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">Total Pens</div>
          <div className="text-3xl font-bold text-slate-800">{metrics.totalPens}</div>
          <div className="text-xs text-slate-400 mt-1">
            {metrics.activePens} active, {metrics.expiredPens} expired
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">Avg Efficiency</div>
          <div className="text-3xl font-bold text-teal-600">
            {metrics.averageEfficiency.toFixed(0)}<span className="text-lg">%</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">medication utilized</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">Total Wasted</div>
          <div className="text-3xl font-bold text-rose-600">
            {metrics.totalWasted.toFixed(0)}<span className="text-lg">mg</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {metrics.averageWastePerPen.toFixed(1)}mg per pen
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">Total Supply</div>
          <div className="text-3xl font-bold text-slate-800">
            {metrics.totalRemaining.toFixed(0)}<span className="text-lg">mg</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">remaining now</div>
        </div>
      </div>

      {/* Planned Dose Issues */}
      {(() => {
        const pensWithPlannedIssues = metrics.penMetrics.filter(m =>
          m.hasPlannedDoses && (
            m.plannedDosesAfterExpiry.length > 0 ||
            m.willRunOutBeforePlannedComplete ||
            (m.riskLevel === 'critical' || m.riskLevel === 'high')
          )
        )

        if (pensWithPlannedIssues.length === 0) return null

        return (
          <div className="bg-white rounded-xl border border-rose-200 overflow-hidden">
            <div className="bg-rose-50 px-4 py-3 border-b border-rose-200">
              <div className="flex items-center gap-2">
                <AlertTriangle size={20} className="text-rose-600" />
                <h3 className="font-semibold text-rose-900">Planned Dose Issues</h3>
              </div>
              <p className="text-sm text-rose-700 mt-1">
                These pens have problems with your scheduled doses
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {pensWithPlannedIssues.map(penMetric => {
                const pen = pens.find(p => p.id === penMetric.penId)
                return (
                  <div key={penMetric.penId} className="px-4 py-4 hover:bg-slate-50">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{penMetric.penSize}mg pen</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            penMetric.riskLevel === 'critical' ? 'bg-rose-100 text-rose-700' :
                            penMetric.riskLevel === 'high' ? 'bg-amber-100 text-amber-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {penMetric.riskLevel === 'critical' ? 'CRITICAL' : penMetric.riskLevel.toUpperCase()} RISK
                          </span>
                          <span className="text-sm text-slate-600">
                            {penMetric.plannedDoseCount} planned dose{penMetric.plannedDoseCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600 mt-1">
                          Expires {formatDateShort(pen.expirationDate)} ({penMetric.daysUntilExpiry} days)
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mt-3">
                      {penMetric.plannedDosesAfterExpiry.length > 0 && (
                        <div className="bg-rose-100 border border-rose-300 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle size={16} className="text-rose-700 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="font-medium text-rose-900">
                                {penMetric.plannedDosesAfterExpiry.length} dose{penMetric.plannedDosesAfterExpiry.length !== 1 ? 's' : ''} scheduled after expiry
                              </div>
                              <div className="text-sm text-rose-700 mt-1">
                                {penMetric.plannedDosesAfterExpiry.slice(0, 3).map((dose, idx) => (
                                  <div key={idx}>
                                    {dose.mg}mg on {formatDateShort(dose.date)} ({dose.daysAfterExpiry} days after expiry)
                                  </div>
                                ))}
                                {penMetric.plannedDosesAfterExpiry.length > 3 && (
                                  <div className="text-rose-600 mt-1">
                                    ...and {penMetric.plannedDosesAfterExpiry.length - 3} more
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {penMetric.willRunOutBeforePlannedComplete && (
                        <div className="bg-amber-100 border border-amber-300 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle size={16} className="text-amber-700 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="font-medium text-amber-900">
                                Insufficient medication for all planned doses
                              </div>
                              <div className="text-sm text-amber-700 mt-1">
                                Only {penMetric.remaining.toFixed(1)}mg remaining, but planned doses require more
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {penMetric.projectedLastDoseDate && penMetric.projectedDaysBetweenLastDoseAndExpiry !== null && (
                        <div className={`rounded-lg p-3 ${
                          penMetric.projectedDaysBetweenLastDoseAndExpiry <= 7
                            ? 'bg-rose-100 border border-rose-200'
                            : 'bg-amber-100 border border-amber-200'
                        }`}>
                          <div className="flex items-start gap-2">
                            <Clock size={16} className={`${
                              penMetric.projectedDaysBetweenLastDoseAndExpiry <= 7 ? 'text-rose-700' : 'text-amber-700'
                            } mt-0.5 flex-shrink-0`} />
                            <div className="flex-1">
                              <div className={`font-medium ${
                                penMetric.projectedDaysBetweenLastDoseAndExpiry <= 7 ? 'text-rose-900' : 'text-amber-900'
                              }`}>
                                Projected last dose: {formatDateShort(penMetric.projectedLastDoseDate)}
                              </div>
                              <div className={`text-sm mt-1 ${
                                penMetric.projectedDaysBetweenLastDoseAndExpiry <= 7 ? 'text-rose-700' : 'text-amber-700'
                              }`}>
                                Only {penMetric.projectedDaysBetweenLastDoseAndExpiry} days before expiry &bull;
                                Projected waste: {penMetric.projectedWasteMg.toFixed(1)}mg
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Pens At Risk */}
      {metrics.pensAtRisk.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-600" />
              <h3 className="font-semibold text-amber-900">Pens At Risk of Expiry</h3>
            </div>
            <p className="text-sm text-amber-700 mt-1">
              These pens may expire before being fully used at your current dosing rate
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {metrics.pensAtRisk.map(penMetric => {
              const pen = pens.find(p => p.id === penMetric.penId)
              return (
                <div key={penMetric.penId} className="px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{penMetric.penSize}mg pen</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          penMetric.riskLevel === 'high' ? 'bg-rose-100 text-rose-700' :
                          penMetric.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {penMetric.riskLevel.toUpperCase()} RISK
                        </span>
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        {penMetric.remaining.toFixed(1)}mg remaining &bull;
                        Expires {formatDateShort(pen.expirationDate)} ({penMetric.daysUntilExpiry} days)
                      </div>
                      {penMetric.estimatedDaysToEmpty !== null && (
                        <div className="text-sm text-amber-700 mt-1 flex items-center gap-1">
                          <Clock size={14} />
                          <span>
                            Estimated {Math.ceil(penMetric.estimatedDaysToEmpty)} days to empty at current rate
                            ({Math.ceil(penMetric.estimatedDaysToEmpty - penMetric.daysUntilExpiry)} days after expiry)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Detailed Pen Metrics */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-slate-800">Detailed Pen Metrics</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Pen</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Efficiency</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Days to Expiry</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Last Use Gap</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Planned Projection</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Waste</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Doses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.penMetrics.map(penMetric => {
                const pen = pens.find(p => p.id === penMetric.penId)
                return (
                  <tr key={penMetric.penId} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{penMetric.penSize}mg</div>
                      <div className="text-xs text-slate-500">
                        {penMetric.remaining.toFixed(1)}/{penMetric.totalCapacity}mg
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {penMetric.isExpired ? (
                          <>
                            <div className="w-2 h-2 rounded-full bg-rose-500" />
                            <span className="text-sm text-rose-700">Expired</span>
                          </>
                        ) : penMetric.isEmpty ? (
                          <>
                            <div className="w-2 h-2 rounded-full bg-slate-400" />
                            <span className="text-sm text-slate-600">Empty</span>
                          </>
                        ) : penMetric.isExpiringSoon ? (
                          <>
                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                            <span className="text-sm text-amber-700">Expiring Soon</span>
                          </>
                        ) : (
                          <>
                            <div className="w-2 h-2 rounded-full bg-teal-500" />
                            <span className="text-sm text-teal-700">Active</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className={`text-sm font-medium ${
                        penMetric.usageEfficiency >= 90 ? 'text-teal-600' :
                        penMetric.usageEfficiency >= 70 ? 'text-amber-600' :
                        'text-slate-600'
                      }`}>
                        {penMetric.usageEfficiency.toFixed(0)}%
                      </div>
                      {penMetric.usageEfficiency >= 90 && (
                        <Award size={12} className="inline text-teal-500 ml-1" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className={`text-sm ${
                        penMetric.isExpired ? 'text-rose-600' :
                        penMetric.daysUntilExpiry <= 7 ? 'text-amber-600' :
                        'text-slate-700'
                      }`}>
                        {penMetric.isExpired ? 'Expired' : `${penMetric.daysUntilExpiry}d`}
                      </div>
                      <div className="text-xs text-slate-400">
                        {formatDateShort(pen.expirationDate)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {penMetric.daysBetweenLastUseAndExpiry !== null ? (
                        <div>
                          <div className={`text-sm font-medium ${
                            penMetric.daysBetweenLastUseAndExpiry <= 7 ? 'text-rose-600' :
                            penMetric.daysBetweenLastUseAndExpiry <= 14 ? 'text-amber-600' :
                            'text-teal-600'
                          }`}>
                            {penMetric.daysBetweenLastUseAndExpiry}d
                          </div>
                          <div className="text-xs text-slate-400">
                            {formatDateShort(penMetric.lastUseDate)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {penMetric.hasPlannedDoses ? (
                        <div>
                          {penMetric.projectedLastDoseDate ? (
                            <>
                              <div className={`text-sm font-medium ${
                                penMetric.projectedDaysBetweenLastDoseAndExpiry <= 7 ? 'text-rose-600' :
                                penMetric.projectedDaysBetweenLastDoseAndExpiry <= 14 ? 'text-amber-600' :
                                'text-teal-600'
                              }`}>
                                {penMetric.projectedDaysBetweenLastDoseAndExpiry}d gap
                              </div>
                              <div className="text-xs text-slate-400">
                                {formatDateShort(penMetric.projectedLastDoseDate)}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm font-medium text-rose-600">
                              No valid doses
                            </div>
                          )}
                          {(penMetric.plannedDosesAfterExpiry.length > 0 || penMetric.willRunOutBeforePlannedComplete) && (
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <AlertTriangle size={12} className="text-rose-500" />
                              <span className="text-xs text-rose-600">Issues</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">No planned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {penMetric.wastedMg > 0 ? (
                        <div>
                          <div className="text-sm font-medium text-rose-600">
                            {penMetric.wastedMg.toFixed(1)}mg
                          </div>
                          <div className="text-xs text-rose-500">
                            {penMetric.wastePercentage.toFixed(0)}%
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm text-slate-700">
                        {penMetric.completedDoseCount}/{penMetric.doseCount}
                      </div>
                      <div className="text-xs text-slate-400">completed</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600">
        <div className="font-medium text-slate-800 mb-2">Metric Definitions</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div><span className="font-medium">Efficiency:</span> Percentage of pen capacity that has been used</div>
          <div><span className="font-medium">Days to Expiry:</span> Days remaining until expiration date</div>
          <div><span className="font-medium">Last Use Gap:</span> Days between last completed dose and expiry date</div>
          <div><span className="font-medium">Planned Projection:</span> Projected gap between last planned dose and expiry (forward-looking)</div>
          <div><span className="font-medium">Waste:</span> Medication remaining when pen expired</div>
          <div><span className="font-medium">Risk Assessment:</span> Based on planned doses or historical patterns</div>
        </div>
      </div>
    </div>
  )
}

export default MetricsOverview
