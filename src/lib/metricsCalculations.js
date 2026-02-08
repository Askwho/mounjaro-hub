import { getPenAvailability, getTotalCapacity } from './penCalculations'
import { getDaysBetween, formatDateShort } from './dateUtils'

export const calculatePenMetrics = (pen, doses, penUsage) => {
  const usage = penUsage[pen.id] || 0
  const availability = getPenAvailability(pen.size, usage)
  const totalCapacity = getTotalCapacity(pen.size)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const expiryDate = new Date(pen.expirationDate)
  expiryDate.setHours(0, 0, 0, 0)

  const penDoses = doses.filter(d => d.penId === pen.id)
  const completedDoses = penDoses.filter(d => d.isCompleted).sort((a, b) => new Date(b.date) - new Date(a.date))
  const plannedDoses = penDoses.filter(d => !d.isCompleted).sort((a, b) => new Date(a.date) - new Date(b.date))
  const lastDose = completedDoses[0]

  const lastUseDate = lastDose ? new Date(lastDose.date) : null
  if (lastUseDate) lastUseDate.setHours(0, 0, 0, 0)

  const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
  const isExpired = daysUntilExpiry < 0
  const isExpiringSoon = !isExpired && daysUntilExpiry <= 14

  const daysBetweenLastUseAndExpiry = lastUseDate
    ? Math.ceil((expiryDate - lastUseDate) / (1000 * 60 * 60 * 24))
    : null

  const usageEfficiency = (usage / totalCapacity) * 100

  const wastedMg = isExpired ? availability.total : 0
  const wastePercentage = isExpired ? (wastedMg / totalCapacity) * 100 : 0

  // Forward-looking planned dose analysis
  let projectedLastDoseDate = null
  let projectedDaysBetweenLastDoseAndExpiry = null
  let plannedDosesAfterExpiry = []
  let willRunOutBeforePlannedComplete = false
  let projectedWasteMg = availability.total
  let plannedRiskLevel = 'none'

  if (plannedDoses.length > 0) {
    let cumulativeUsed = completedDoses.reduce((sum, d) => sum + d.mg, 0)
    let foundLastValidDose = false

    for (const dose of plannedDoses) {
      const doseDate = new Date(dose.date)
      doseDate.setHours(0, 0, 0, 0)

      const round1 = (n) => Math.round(n * 10) / 10
      const currentRemaining = round1(totalCapacity - cumulativeUsed)
      const wouldRemain = round1(currentRemaining - dose.mg)

      if (doseDate > expiryDate) {
        plannedDosesAfterExpiry.push({
          id: dose.id,
          date: dose.date,
          mg: dose.mg,
          daysAfterExpiry: Math.ceil((doseDate - expiryDate) / (1000 * 60 * 60 * 24))
        })
      }

      if (round1(dose.mg) > currentRemaining && !willRunOutBeforePlannedComplete) {
        willRunOutBeforePlannedComplete = true
      }

      if (doseDate <= expiryDate && wouldRemain >= 0) {
        projectedLastDoseDate = doseDate
        cumulativeUsed = round1(cumulativeUsed + dose.mg)
        foundLastValidDose = true
      }
    }

    if (projectedLastDoseDate) {
      projectedDaysBetweenLastDoseAndExpiry = Math.ceil((expiryDate - projectedLastDoseDate) / (1000 * 60 * 60 * 24))
      projectedWasteMg = Math.max(0, totalCapacity - cumulativeUsed)

      if (projectedDaysBetweenLastDoseAndExpiry > 30) {
        plannedRiskLevel = 'low'
      } else if (projectedDaysBetweenLastDoseAndExpiry > 14) {
        plannedRiskLevel = 'medium'
      } else if (projectedDaysBetweenLastDoseAndExpiry > 7) {
        plannedRiskLevel = 'high'
      } else {
        plannedRiskLevel = 'critical'
      }
    } else if (!foundLastValidDose && plannedDoses.length > 0) {
      plannedRiskLevel = 'critical'
    }
  }

  // Historical risk assessment
  const isEmpty = availability.total === 0
  let historicalRiskLevel = 'none'
  let estimatedDaysToEmpty = null

  if (!isExpired && !isEmpty && completedDoses.length >= 2 && plannedDoses.length === 0) {
    const sortedCompletedDoses = [...completedDoses].sort((a, b) => new Date(a.date) - new Date(b.date))
    let totalGaps = 0
    let gapCount = 0
    for (let i = 1; i < sortedCompletedDoses.length; i++) {
      const gap = getDaysBetween(sortedCompletedDoses[i-1].date, sortedCompletedDoses[i].date)
      totalGaps += gap
      gapCount++
    }
    const avgDaysBetweenDoses = totalGaps / gapCount
    const avgDoseMg = completedDoses.reduce((sum, d) => sum + d.mg, 0) / completedDoses.length
    const dosesRemaining = Math.floor(availability.total / avgDoseMg)
    estimatedDaysToEmpty = dosesRemaining * avgDaysBetweenDoses

    if (estimatedDaysToEmpty > daysUntilExpiry) {
      const daysOver = estimatedDaysToEmpty - daysUntilExpiry
      if (daysOver > 14) {
        historicalRiskLevel = 'high'
      } else if (daysOver > 7) {
        historicalRiskLevel = 'medium'
      } else {
        historicalRiskLevel = 'low'
      }
    }
  }

  const riskLevel = plannedDoses.length > 0 ? plannedRiskLevel : historicalRiskLevel

  return {
    penId: pen.id,
    penSize: pen.size,
    totalCapacity,
    usage,
    remaining: availability.total,
    usageEfficiency,
    daysUntilExpiry,
    isExpired,
    isExpiringSoon,
    isEmpty,
    lastUseDate,
    daysBetweenLastUseAndExpiry,
    wastedMg,
    wastePercentage,
    riskLevel,
    estimatedDaysToEmpty,
    doseCount: penDoses.length,
    completedDoseCount: completedDoses.length,
    plannedDoseCount: plannedDoses.length,
    projectedLastDoseDate,
    projectedDaysBetweenLastDoseAndExpiry,
    plannedDosesAfterExpiry,
    willRunOutBeforePlannedComplete,
    projectedWasteMg,
    hasPlannedDoses: plannedDoses.length > 0
  }
}

export const calculateSystemMetrics = (pens, doses, penUsage) => {
  if (pens.length === 0) {
    return {
      totalPens: 0,
      activePens: 0,
      expiredPens: 0,
      emptyPens: 0,
      totalCapacity: 0,
      totalUsed: 0,
      totalRemaining: 0,
      totalWasted: 0,
      averageWastePerPen: 0,
      averageEfficiency: 0,
      pensAtRisk: [],
      penMetrics: [],
      criticalMetrics: {
        avgDaysBetweenLastUseAndExpiry: null,
        pensExpiredWithMedication: 0,
        totalMedicationWasted: 0
      }
    }
  }

  const penMetrics = pens.map(pen => calculatePenMetrics(pen, doses, penUsage))

  const totalPens = pens.length
  const activePens = penMetrics.filter(m => !m.isExpired && !m.isEmpty).length
  const expiredPens = penMetrics.filter(m => m.isExpired).length
  const emptyPens = penMetrics.filter(m => m.isEmpty).length

  const totalCapacity = penMetrics.reduce((sum, m) => sum + m.totalCapacity, 0)
  const totalUsed = penMetrics.reduce((sum, m) => sum + m.usage, 0)
  const totalRemaining = penMetrics.reduce((sum, m) => sum + m.remaining, 0)
  const totalWasted = penMetrics.reduce((sum, m) => sum + m.wastedMg, 0)

  const averageWastePerPen = totalWasted / totalPens
  const averageEfficiency = (totalUsed / totalCapacity) * 100

  const pensAtRisk = penMetrics.filter(m => m.riskLevel !== 'none')

  const pensWithLastUse = penMetrics.filter(m => m.daysBetweenLastUseAndExpiry !== null)
  const avgDaysBetweenLastUseAndExpiry = pensWithLastUse.length > 0
    ? pensWithLastUse.reduce((sum, m) => sum + m.daysBetweenLastUseAndExpiry, 0) / pensWithLastUse.length
    : null

  const pensExpiredWithMedication = penMetrics.filter(m => m.isExpired && m.wastedMg > 0).length

  return {
    totalPens,
    activePens,
    expiredPens,
    emptyPens,
    totalCapacity,
    totalUsed,
    totalRemaining,
    totalWasted,
    averageWastePerPen,
    averageEfficiency,
    pensAtRisk,
    penMetrics,
    criticalMetrics: {
      avgDaysBetweenLastUseAndExpiry,
      pensExpiredWithMedication,
      totalMedicationWasted: totalWasted
    }
  }
}
