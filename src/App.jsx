import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Calendar, Syringe, TrendingUp, History, Package, Plus, Trash2,
  ChevronLeft, ChevronRight, AlertTriangle, Check, Clock, Droplets,
  Activity, CalendarDays, X, Edit2, Save, LogOut, User, BarChart3,
  Target, TrendingDown, Award
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts'
import { useAuth } from './contexts/AuthContext'
import {
  fetchPens, createPen, deletePen,
  fetchDoses, createDose, updateDose, deleteDose, deleteDosesByPenId, deleteAllPlannedDoses,
  savePenMetricsSnapshot, saveSystemMetricsSnapshot, fetchSystemMetricsSnapshots
} from './lib/supabase'

// ============================================================================
// CONSTANTS & CORE CALCULATIONS
// ============================================================================

const PEN_SIZES = [2.5, 5, 7.5, 10, 12.5, 15]
const HALF_LIFE_DAYS = 5

const getClickCapacity = (penSize) => penSize * 4
const getSyringeCapacity = (penSize) => penSize
const getTotalCapacity = (penSize) => penSize * 5

const getPenAvailability = (penSize, mgUsed) => {
  const clickCap = getClickCapacity(penSize)
  const totalCap = getTotalCapacity(penSize)
  
  // Round to 1 decimal place to avoid floating point precision issues
  const round1 = (n) => Math.round(n * 10) / 10
  
  const fromClicks = round1(Math.max(0, clickCap - mgUsed))
  const fromSyringe = round1(Math.max(0, totalCap - Math.max(mgUsed, clickCap)))
  const total = round1(fromClicks + fromSyringe)
  
  return {
    fromClicks,
    fromSyringe,
    total,
    clicksRemaining: Math.round(fromClicks * (60 / penSize))
  }
}

const doseRequiresSyringe = (penSize, mgUsedBefore, doseMg) => {
  const clickCap = getClickCapacity(penSize)
  return (mgUsedBefore + doseMg) > clickCap
}

const getDoseBreakdown = (penSize, mgUsedBefore, doseMg) => {
  const clickCap = getClickCapacity(penSize)
  const clicksAvailable = Math.max(0, clickCap - mgUsedBefore)
  
  // Round to 1 decimal place to avoid floating point precision issues
  const round1 = (n) => Math.round(n * 10) / 10
  
  const fromClicks = round1(Math.min(doseMg, clicksAvailable))
  const fromSyringe = round1(doseMg - fromClicks)
  
  return {
    fromClicks,
    fromSyringe,
    clickCount: Math.round(fromClicks * (60 / penSize)),
    requiresSyringe: fromSyringe > 0
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatDate = (date) => {
  const d = new Date(date)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const formatDateShort = (date) => {
  const d = new Date(date)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const getDaysUntil = (date) => {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
}

const getDaysBetween = (date1, date2) => {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  d1.setHours(0, 0, 0, 0)
  d2.setHours(0, 0, 0, 0)
  return Math.abs(Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)))
}

const calculateConcentration = (doses, targetDate) => {
  const target = new Date(targetDate)
  target.setHours(12, 0, 0, 0)
  
  let concentration = 0
  
  const completedDoses = doses
    .filter(d => d.isCompleted && new Date(d.date) <= target)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  
  for (const dose of completedDoses) {
    const doseDate = new Date(dose.date)
    doseDate.setHours(12, 0, 0, 0)
    const daysSinceDose = (target - doseDate) / (1000 * 60 * 60 * 24)
    
    if (daysSinceDose >= 0) {
      const remaining = dose.mg * Math.pow(0.5, daysSinceDose / HALF_LIFE_DAYS)
      concentration += remaining
    }
  }
  
  return concentration
}

// ============================================================================
// METRICS & TRACKING CALCULATIONS
// ============================================================================

const calculatePenMetrics = (pen, doses, penUsage) => {
  const usage = penUsage[pen.id] || 0
  const availability = getPenAvailability(pen.size, usage)
  const totalCapacity = getTotalCapacity(pen.size)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const expiryDate = new Date(pen.expirationDate)
  expiryDate.setHours(0, 0, 0, 0)

  // Find doses for this pen
  const penDoses = doses.filter(d => d.penId === pen.id)
  const completedDoses = penDoses.filter(d => d.isCompleted).sort((a, b) => new Date(b.date) - new Date(a.date))
  const plannedDoses = penDoses.filter(d => !d.isCompleted).sort((a, b) => new Date(a.date) - new Date(b.date))
  const lastDose = completedDoses[0]

  // Calculate last use date (completed doses only)
  const lastUseDate = lastDose ? new Date(lastDose.date) : null
  if (lastUseDate) lastUseDate.setHours(0, 0, 0, 0)

  // Days until expiry
  const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
  const isExpired = daysUntilExpiry < 0
  const isExpiringSoon = !isExpired && daysUntilExpiry <= 14

  // Days between last use and expiry (CRITICAL METRIC)
  const daysBetweenLastUseAndExpiry = lastUseDate
    ? Math.ceil((expiryDate - lastUseDate) / (1000 * 60 * 60 * 24))
    : null

  // Usage efficiency
  const usageEfficiency = (usage / totalCapacity) * 100

  // Waste calculation
  const wastedMg = isExpired ? availability.total : 0
  const wastePercentage = isExpired ? (wastedMg / totalCapacity) * 100 : 0

  // ============================================================================
  // FORWARD-LOOKING PLANNED DOSE ANALYSIS
  // ============================================================================

  let projectedLastDoseDate = null
  let projectedDaysBetweenLastDoseAndExpiry = null
  let plannedDosesAfterExpiry = []
  let willRunOutBeforePlannedComplete = false
  let projectedWasteMg = availability.total
  let plannedRiskLevel = 'none'

  if (plannedDoses.length > 0) {
    // Simulate execution of planned doses
    // Start with only COMPLETED doses in cumulative usage
    let cumulativeUsed = completedDoses.reduce((sum, d) => sum + d.mg, 0)
    let foundLastValidDose = false

    for (const dose of plannedDoses) {
      const doseDate = new Date(dose.date)
      doseDate.setHours(0, 0, 0, 0)

      // Round to 1 decimal to avoid floating point issues
      const round1 = (n) => Math.round(n * 10) / 10
      const currentRemaining = round1(totalCapacity - cumulativeUsed)
      const wouldRemain = round1(currentRemaining - dose.mg)

      // Check if dose is after expiry
      if (doseDate > expiryDate) {
        plannedDosesAfterExpiry.push({
          id: dose.id,
          date: dose.date,
          mg: dose.mg,
          daysAfterExpiry: Math.ceil((doseDate - expiryDate) / (1000 * 60 * 60 * 24))
        })
      }

      // Check if we have LESS medication than this dose requires (not just ending at 0)
      if (round1(dose.mg) > currentRemaining && !willRunOutBeforePlannedComplete) {
        willRunOutBeforePlannedComplete = true
      }

      // Track the last dose that's feasible (before expiry AND has enough med)
      if (doseDate <= expiryDate && wouldRemain >= 0) {
        projectedLastDoseDate = doseDate
        cumulativeUsed = round1(cumulativeUsed + dose.mg)
        foundLastValidDose = true
      }
    }

    // Calculate projected gap
    if (projectedLastDoseDate) {
      projectedDaysBetweenLastDoseAndExpiry = Math.ceil((expiryDate - projectedLastDoseDate) / (1000 * 60 * 60 * 24))
      projectedWasteMg = Math.max(0, totalCapacity - cumulativeUsed)

      // Assess risk based on projected gap
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

  // Historical risk assessment (for pens without planned doses)
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

  // Use planned risk if available, otherwise historical
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
    // Forward-looking metrics
    projectedLastDoseDate,
    projectedDaysBetweenLastDoseAndExpiry,
    plannedDosesAfterExpiry,
    willRunOutBeforePlannedComplete,
    projectedWasteMg,
    hasPlannedDoses: plannedDoses.length > 0
  }
}

const calculateSystemMetrics = (pens, doses, penUsage) => {
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

  // Critical metrics
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

// ============================================================================
// SHARED UI COMPONENTS
// ============================================================================

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

const TabButton = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
      active 
        ? 'bg-teal-50 text-teal-700' 
        : 'text-slate-600 hover:bg-slate-100'
    }`}
  >
    <Icon size={18} />
    <span className="hidden sm:inline">{label}</span>
  </button>
)

// ============================================================================
// LOGIN PAGE
// ============================================================================

const LoginPage = () => {
  const { signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async () => {
    try {
      setLoading(true)
      setError(null)
      await signInWithGoogle()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Droplets size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Mounjaro Hub</h1>
          <p className="text-slate-500 mt-2">Track your Tirzepatide doses and inventory</p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span className="font-medium text-slate-700">
            {loading ? 'Signing in...' : 'Continue with Google'}
          </span>
        </button>

        <p className="text-center text-sm text-slate-400 mt-6">
          Your data is stored securely and only accessible by you
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// DASHBOARD COMPONENT
// ============================================================================

const Dashboard = ({ pens, doses, penUsage }) => {
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">Days Since Dose</div>
          <div className="text-3xl font-bold text-slate-800">
            {daysSinceLastDose !== null ? daysSinceLastDose : '—'}
          </div>
          {lastDose && (
            <div className="text-xs text-slate-400 mt-1">{formatDateShort(lastDose.date)}</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">Next Dose</div>
          <div className="text-3xl font-bold text-slate-800">
            {daysUntilNext !== null ? (daysUntilNext === 0 ? 'Today' : `${daysUntilNext}d`) : '—'}
          </div>
          {nextScheduled && (
            <div className="text-xs text-slate-400 mt-1">{nextScheduled.mg}mg scheduled</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">Est. Concentration</div>
          <div className="text-3xl font-bold text-teal-600">
            {currentConcentration.toFixed(1)}<span className="text-lg">mg</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">in body now</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">Total Supply</div>
          <div className="text-3xl font-bold text-slate-800">
            {totalSupplyRemaining.toFixed(0)}<span className="text-lg">mg</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">across {pens.filter(p => new Date(p.expirationDate) >= new Date()).length} pen(s)</div>
        </div>
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
                  <div className="text-right">
                    <div className={`text-sm font-medium ${daysUntil === 0 ? 'text-teal-600' : 'text-slate-600'}`}>
                      {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                    </div>
                    {gap !== null && (
                      <div className="text-xs text-slate-400">{gap}d gap</div>
                    )}
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

// ============================================================================
// PEN INVENTORY COMPONENT
// ============================================================================

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
    } catch (err) {
      console.error('Error adding pen:', err)
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
      setDeletingPen(null)
    } catch (err) {
      console.error('Error deleting pen:', err)
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
        >
          <Plus size={18} />
          Add Pen
        </button>
      </div>

      {sortedPens.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Package size={48} className="mx-auto mb-3 opacity-50" />
          <p>No pens in inventory</p>
          <p className="text-sm">Add your first pen to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                className={`rounded-xl border p-4 ${
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
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div className="space-y-2 mb-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Remaining</span>
                    <span className="font-medium text-slate-700">{availability.total.toFixed(1)} mg</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Pen Size</label>
            <div className="grid grid-cols-3 gap-2">
              {PEN_SIZES.map(size => (
                <button
                  key={size}
                  onClick={() => setNewPen(p => ({ ...p, size }))}
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Expiration Date</label>
            <input
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

// ============================================================================
// DOSE CALENDAR COMPONENT (Continued in next file due to size)
// ============================================================================

const DoseCalendar = ({ pens, doses, setDoses, penUsage, userId }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [showDoseModal, setShowDoseModal] = useState(false)
  const [editingDose, setEditingDose] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [newDose, setNewDose] = useState({
    penId: '',
    mg: '',
    isCustom: false,
    isCompleted: false,
    repeatEnabled: false,
    repeatDays: 7
  })

  const activePens = useMemo(() => {
    return pens.filter(p => {
      const usage = penUsage[p.id] || 0
      const availability = getPenAvailability(p.size, usage)
      return availability.total > 0 && new Date(p.expirationDate) > new Date()
    })
  }, [pens, penUsage])

  const weeks = useMemo(() => {
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
    const startDate = new Date(monthStart)
    startDate.setDate(startDate.getDate() - startDate.getDay())
    
    const result = []
    let currentWeek = []
    let day = new Date(startDate)
    
    while (day <= monthEnd || currentWeek.length > 0) {
      currentWeek.push(new Date(day))
      if (currentWeek.length === 7) {
        result.push(currentWeek)
        currentWeek = []
        if (day > monthEnd) break
      }
      day.setDate(day.getDate() + 1)
    }
    return result
  }, [currentMonth])

  const getDosesForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0]
    return doses.filter(d => d.date.split('T')[0] === dateStr)
  }

  const getLastDoseBefore = (date) => {
    const targetDate = new Date(date)
    return doses
      .filter(d => new Date(d.date) < targetDate)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null
  }

  const getPenAvailabilityForEdit = useCallback((pen) => {
    if (!pen) return { fromClicks: 0, fromSyringe: 0, total: 0 }
    
    let usage = penUsage[pen.id] || 0
    
    if (editingDose && editingDose.penId === pen.id) {
      usage -= editingDose.mg
    }
    
    return getPenAvailability(pen.size, Math.max(0, usage))
  }, [penUsage, editingDose])

  const canAffordDose = useCallback((mg, pen) => {
    if (!pen || !mg) return false
    const availability = getPenAvailabilityForEdit(pen)
    const doseMg = parseFloat(mg)
    return Math.round(doseMg * 10) <= Math.round(availability.total * 10)
  }, [getPenAvailabilityForEdit])

  const isDoseSyringe = useCallback((dose) => {
    const pen = pens.find(p => p.id === dose.penId)
    if (!pen) return false
    
    const mgUsedBefore = doses
      .filter(d => 
        d.penId === dose.penId && 
        d.id !== dose.id &&
        new Date(d.date) < new Date(dose.date)
      )
      .reduce((sum, d) => sum + d.mg, 0)
    
    return doseRequiresSyringe(pen.size, mgUsedBefore, dose.mg)
  }, [pens, doses])

  const openAddModal = (date) => {
    setSelectedDate(date)
    setEditingDose(null)
    setShowDeleteConfirm(false)
    
    const lastDose = getLastDoseBefore(date)
    const defaultPen = activePens[0]
    
    let defaultMg = defaultPen?.size || ''
    let isCustom = false
    
    if (lastDose && defaultPen) {
      const usage = penUsage[defaultPen.id] || 0
      const availability = getPenAvailability(defaultPen.size, usage)
      if (Math.round(lastDose.mg * 10) <= Math.round(availability.total * 10)) {
        defaultMg = lastDose.mg
        isCustom = !PEN_SIZES.includes(lastDose.mg)
      }
    }
    
    setNewDose({
      penId: defaultPen?.id || '',
      mg: defaultMg,
      isCustom: isCustom,
      isCompleted: date <= new Date(),
      repeatEnabled: false,
      repeatDays: 7
    })
    setShowDoseModal(true)
  }

  const openEditModal = (dose, e) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    setSelectedDate(new Date(dose.date))
    setEditingDose(dose)
    setShowDeleteConfirm(false)
    setNewDose({
      penId: dose.penId,
      mg: dose.mg,
      isCustom: !PEN_SIZES.includes(dose.mg),
      isCompleted: dose.isCompleted,
      repeatEnabled: false,
      repeatDays: 7
    })
    setShowDoseModal(true)
  }

  const closeModal = () => {
    setShowDoseModal(false)
    setEditingDose(null)
    setShowDeleteConfirm(false)
  }

  const handleSaveDose = async () => {
    if (!selectedDate || !newDose.penId || !newDose.mg) return

    const pen = pens.find(p => p.id === newDose.penId)
    if (!pen) return

    // Round to 1 decimal place to avoid floating point issues
    const doseMg = Math.round(parseFloat(newDose.mg) * 10) / 10
    if (!canAffordDose(doseMg, pen)) return

    setLoading(true)
    try {
      if (editingDose) {
        const updated = await updateDose(editingDose.id, {
          penId: newDose.penId,
          date: selectedDate.toISOString(),
          mg: doseMg,
          isCompleted: newDose.isCompleted
        })
        setDoses(prev => prev.map(d => d.id === editingDose.id ? updated : d))
      } else if (newDose.repeatEnabled) {
        // Repeat dosing: create multiple doses until pen is exhausted
        const createdDoses = []
        let currentDate = new Date(selectedDate)
        let currentUsage = penUsage[pen.id] || 0

        // Calculate how many doses we can fit
        while (true) {
          const availability = getPenAvailability(pen.size, currentUsage)

          // Check if we can afford another dose
          if (Math.round(doseMg * 10) > Math.round(availability.total * 10)) {
            break
          }

          // Create the dose
          const dose = await createDose(userId, {
            penId: newDose.penId,
            date: currentDate.toISOString(),
            mg: doseMg,
            isCompleted: false
          })

          createdDoses.push(dose)
          currentUsage += doseMg

          // Move to next date
          currentDate = new Date(currentDate)
          currentDate.setDate(currentDate.getDate() + newDose.repeatDays)
        }

        setDoses(prev => [...prev, ...createdDoses])
      } else {
        const dose = await createDose(userId, {
          penId: newDose.penId,
          date: selectedDate.toISOString(),
          mg: doseMg,
          isCompleted: newDose.isCompleted
        })
        setDoses(prev => [...prev, dose])
      }
      closeModal()
    } catch (err) {
      console.error('Error saving dose:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDose = async () => {
    if (!editingDose) return

    setLoading(true)
    try {
      await deleteDose(editingDose.id)
      setDoses(prev => prev.filter(d => d.id !== editingDose.id))
      closeModal()
    } catch (err) {
      console.error('Error deleting dose:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleClearAllPlanned = async () => {
    setLoading(true)
    try {
      await deleteAllPlannedDoses(userId)
      setDoses(prev => prev.filter(d => d.isCompleted))
      setShowClearAllConfirm(false)
    } catch (err) {
      console.error('Error clearing planned doses:', err)
    } finally {
      setLoading(false)
    }
  }

  const plannedDosesCount = useMemo(() => {
    return doses.filter(d => !d.isCompleted).length
  }, [doses])

  const selectedPen = pens.find(p => p.id === newDose.penId)
  const availability = getPenAvailabilityForEdit(selectedPen)

  const previewBreakdown = useMemo(() => {
    if (!selectedPen || !newDose.mg || !selectedDate) return null
    
    let currentUsage = doses
      .filter(d => 
        d.penId === selectedPen.id && 
        (!editingDose || d.id !== editingDose.id) &&
        new Date(d.date) < selectedDate
      )
      .reduce((sum, d) => sum + d.mg, 0)
    
    return getDoseBreakdown(selectedPen.size, currentUsage, parseFloat(newDose.mg))
  }, [selectedPen, newDose.mg, selectedDate, doses, editingDose])

  const daysSinceInfo = useMemo(() => {
    if (!selectedDate) return null
    
    let lastDose
    if (editingDose) {
      lastDose = doses
        .filter(d => d.id !== editingDose.id && new Date(d.date) < selectedDate)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
    } else {
      lastDose = getLastDoseBefore(selectedDate)
    }
    
    if (!lastDose) return null
    
    return {
      days: getDaysBetween(lastDose.date, selectedDate),
      dose: lastDose
    }
  }, [selectedDate, editingDose, doses])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-slate-800">Dose Calendar</h2>
          {plannedDosesCount > 0 && (
            <button
              onClick={() => setShowClearAllConfirm(true)}
              className="px-3 py-1.5 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 transition-colors flex items-center gap-1.5"
            >
              <Trash2 size={14} />
              Clear All Future ({plannedDosesCount})
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
            className="p-2 hover:bg-slate-100 rounded-lg"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="font-medium text-slate-700 min-w-[140px] text-center">
            {currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            className="p-2 hover:bg-slate-100 rounded-lg"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="px-2 py-2 text-center text-sm font-medium text-slate-500">
              {d}
            </div>
          ))}
        </div>
        
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
            {week.map((day, di) => {
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth()
              const isToday = day.toDateString() === new Date().toDateString()
              const dayDoses = getDosesForDate(day)
              
              return (
                <div
                  key={di}
                  className={`min-h-[80px] p-1 border-r border-slate-100 last:border-r-0 ${
                    !isCurrentMonth && 'bg-slate-50/50'
                  }`}
                >
                  <button
                    onClick={() => openAddModal(day)}
                    className="w-full text-left p-1 rounded hover:bg-slate-100 transition-colors"
                  >
                    <div className={`text-sm font-medium ${
                      isToday ? 'w-6 h-6 bg-teal-600 text-white rounded-full flex items-center justify-center' :
                      isCurrentMonth ? 'text-slate-700' : 'text-slate-400'
                    }`}>
                      {day.getDate()}
                    </div>
                  </button>
                  <div className="space-y-0.5 mt-0.5">
                    {dayDoses.map(dose => {
                      const isSyringe = isDoseSyringe(dose)
                      return (
                        <button
                          key={dose.id}
                          onClick={(e) => openEditModal(dose, e)}
                          className={`w-full text-left text-xs px-1.5 py-1 rounded transition-colors flex items-center gap-1 group ${
                            dose.isCompleted 
                              ? isSyringe 
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                                : 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                              : isSyringe
                                ? 'bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100'
                                : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {isSyringe && <Syringe size={10} className="flex-shrink-0" />}
                          <span className="truncate flex-1">{dose.mg}mg</span>
                          {dose.isCompleted && <Check size={10} className="flex-shrink-0" />}
                          <Edit2 size={10} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-teal-100 border border-teal-200" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-slate-100 border border-slate-300" />
          <span>Scheduled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-100 border border-amber-200 flex items-center justify-center">
            <Syringe size={8} className="text-amber-600" />
          </div>
          <span>Requires syringe</span>
        </div>
        <div className="text-slate-400 ml-auto text-xs">Click date to add • Click dose to edit</div>
      </div>

      <Modal 
        isOpen={showDoseModal} 
        onClose={closeModal} 
        title={editingDose ? 'Edit Dose' : `Add Dose — ${selectedDate ? formatDate(selectedDate) : ''}`}
      >
        <div className="space-y-4">
          {showDeleteConfirm ? (
            <div className="space-y-4">
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-center">
                <Trash2 size={24} className="mx-auto mb-2 text-rose-500" />
                <p className="font-medium text-rose-800">Delete this dose?</p>
                <p className="text-sm text-rose-600 mt-1">This action cannot be undone.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
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
          ) : activePens.length === 0 && !editingDose ? (
            <div className="text-center py-4 text-slate-500">
              <AlertTriangle size={24} className="mx-auto mb-2 text-amber-500" />
              <p>No active pens available</p>
              <p className="text-sm">Add a pen first</p>
            </div>
          ) : (
            <>
              {daysSinceInfo && (
                <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${
                  daysSinceInfo.days <= 5 ? 'bg-amber-50 text-amber-800' : 
                  daysSinceInfo.days <= 7 ? 'bg-teal-50 text-teal-800' : 
                  'bg-slate-100 text-slate-700'
                }`}>
                  <CalendarDays size={16} />
                  <span>
                    <span className="font-medium">{daysSinceInfo.days} day{daysSinceInfo.days !== 1 ? 's' : ''}</span> since last dose
                    <span className="opacity-75 ml-1">({daysSinceInfo.dose.mg}mg on {formatDateShort(daysSinceInfo.dose.date)})</span>
                  </span>
                </div>
              )}

              {editingDose && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
                  <input
                    type="date"
                    value={selectedDate ? selectedDate.toISOString().split('T')[0] : ''}
                    onChange={e => setSelectedDate(new Date(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Select Pen</label>
                {(() => {
                  const editingPen = editingDose ? pens.find(p => p.id === editingDose.penId) : null
                  const availablePens = editingPen && !activePens.find(p => p.id === editingPen.id)
                    ? [editingPen, ...activePens]
                    : activePens
                  
                  if (availablePens.length === 0) {
                    return (
                      <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">
                        No pens available. You can still delete this dose.
                      </div>
                    )
                  }
                  
                  return (
                    <select
                      value={newDose.penId}
                      onChange={e => {
                        const pen = pens.find(p => p.id === e.target.value)
                        setNewDose(d => ({ 
                          ...d, 
                          penId: e.target.value,
                          mg: d.isCustom ? d.mg : (pen?.size || '')
                        }))
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      {availablePens.map(pen => {
                        const avail = getPenAvailabilityForEdit(pen)
                        const isExpired = new Date(pen.expirationDate) < new Date()
                        return (
                          <option key={pen.id} value={pen.id}>
                            {pen.size}mg pen — {avail.total.toFixed(1)}mg remaining
                            {isExpired ? ' (expired)' : ''}
                          </option>
                        )
                      })}
                    </select>
                  )
                })()}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Dose Amount
                  <span className="font-normal text-slate-400 ml-2">
                    ({availability.total.toFixed(1)}mg available)
                  </span>
                </label>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {PEN_SIZES.map(size => {
                      const affordable = canAffordDose(size, selectedPen)
                      const isSelected = !newDose.isCustom && parseFloat(newDose.mg) === size
                      return (
                        <button
                          key={size}
                          onClick={() => affordable && setNewDose(d => ({ ...d, mg: size, isCustom: false }))}
                          disabled={!affordable}
                          className={`py-1.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
                            isSelected
                              ? 'bg-teal-600 border-teal-600 text-white'
                              : affordable
                                ? 'border-slate-200 text-slate-600 hover:border-teal-300'
                                : 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50'
                          }`}
                        >
                          {size}mg
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setNewDose(d => ({ ...d, isCustom: true, mg: '' }))}
                      className={`py-1.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        newDose.isCustom
                          ? 'bg-teal-600 border-teal-600 text-white'
                          : 'border-slate-200 text-slate-600 hover:border-teal-300'
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                  
                  {newDose.isCustom && (
                    <div>
                      <input
                        type="number"
                        step="0.1"
                        value={newDose.mg}
                        onChange={e => setNewDose(d => ({ ...d, mg: e.target.value }))}
                        placeholder="Enter mg"
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                          newDose.mg && !canAffordDose(newDose.mg, selectedPen)
                            ? 'border-rose-300 focus:ring-rose-500'
                            : 'border-slate-200 focus:ring-teal-500'
                        }`}
                      />
                      {newDose.mg && !canAffordDose(newDose.mg, selectedPen) && (
                        <p className="text-xs text-rose-600 mt-1">
                          Not enough remaining. Max: {availability.total.toFixed(1)}mg
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {selectedPen && newDose.mg && canAffordDose(newDose.mg, selectedPen) && previewBreakdown && (
                <div className={`rounded-lg p-3 text-sm ${
                  previewBreakdown.requiresSyringe ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'
                }`}>
                  {previewBreakdown.requiresSyringe ? (
                    <div className="flex items-start gap-2">
                      <Syringe size={16} className="text-amber-600 mt-0.5" />
                      <div>
                        <div className="font-medium text-amber-800">Requires syringe extraction</div>
                        <div className="text-amber-700">
                          {previewBreakdown.fromClicks > 0 && (
                            <span>{previewBreakdown.fromClicks.toFixed(1)}mg via clicks ({previewBreakdown.clickCount} clicks) + </span>
                          )}
                          {previewBreakdown.fromSyringe.toFixed(1)}mg via syringe
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-600">
                      Uses {previewBreakdown.clickCount} clicks ({previewBreakdown.fromClicks.toFixed(1)}mg)
                    </div>
                  )}
                </div>
              )}

              {!editingDose && !newDose.isCompleted && (
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="repeatEnabled"
                      checked={newDose.repeatEnabled}
                      onChange={e => setNewDose(d => ({ ...d, repeatEnabled: e.target.checked }))}
                      className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                    />
                    <label htmlFor="repeatEnabled" className="text-sm font-medium text-slate-700">
                      Repeat every X days until pen is exhausted
                    </label>
                  </div>

                  {newDose.repeatEnabled && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Repeat every (days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={newDose.repeatDays}
                        onChange={e => setNewDose(d => ({ ...d, repeatDays: parseInt(e.target.value) || 7 }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Doses will be scheduled every {newDose.repeatDays} day{newDose.repeatDays !== 1 ? 's' : ''} until the pen runs out
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isCompleted"
                  checked={newDose.isCompleted}
                  onChange={e => setNewDose(d => ({ ...d, isCompleted: e.target.checked, repeatEnabled: e.target.checked ? false : d.repeatEnabled }))}
                  className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                />
                <label htmlFor="isCompleted" className="text-sm text-slate-700">
                  Mark as completed (dose already taken)
                </label>
              </div>
              
              <div className="flex gap-2 pt-2">
                {editingDose && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex-1 py-2.5 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 transition-colors flex items-center justify-center gap-2 font-medium"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                )}
                <button
                  onClick={handleSaveDose}
                  disabled={!newDose.penId || !newDose.mg || !canAffordDose(newDose.mg, selectedPen) || loading}
                  className={`py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium ${editingDose ? 'flex-1' : 'w-full'}`}
                >
                  {editingDose ? <Save size={16} /> : <Plus size={16} />}
                  {loading ? 'Saving...' : editingDose ? 'Save Changes' : 'Add Dose'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showClearAllConfirm}
        onClose={() => setShowClearAllConfirm(false)}
        title="Clear All Future Doses"
      >
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-center">
            <Trash2 size={24} className="mx-auto mb-2 text-rose-500" />
            <p className="font-medium text-rose-800">Delete all {plannedDosesCount} planned dose{plannedDosesCount !== 1 ? 's' : ''}?</p>
            <p className="text-sm text-rose-600 mt-1">This action cannot be undone. Completed doses will not be affected.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowClearAllConfirm(false)}
              disabled={loading}
              className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleClearAllPlanned}
              disabled={loading}
              className="flex-1 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? 'Clearing...' : 'Yes, Clear All'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================================
// PK DECAY CHART COMPONENT
// ============================================================================

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
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
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
                        ✓ Completed: {data.completedDose} mg
                      </div>
                    )}
                    {data?.scheduledDose && (
                      <div className="text-amber-700 mt-1 pt-1 border-t border-slate-100">
                        ○ Scheduled: {data.scheduledDose} mg
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

// ============================================================================
// DOSE HISTORY COMPONENT
// ============================================================================

const DoseHistory = ({ pens, doses, setDoses, penUsage, userId }) => {
  const [deletingDose, setDeletingDose] = useState(null)
  const [loading, setLoading] = useState(false)
  
  const sortedDoses = [...doses]
    .filter(d => d.isCompleted)
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const isDoseSyringe = (dose) => {
    const pen = pens.find(p => p.id === dose.penId)
    if (!pen) return false
    
    const mgUsedBefore = doses
      .filter(d => 
        d.penId === dose.penId && 
        d.id !== dose.id &&
        new Date(d.date) < new Date(dose.date)
      )
      .reduce((sum, d) => sum + d.mg, 0)
    
    return doseRequiresSyringe(pen.size, mgUsedBefore, dose.mg)
  }

  const handleDeleteDose = async () => {
    if (!deletingDose) return
    
    setLoading(true)
    try {
      await deleteDose(deletingDose.id)
      setDoses(prev => prev.filter(d => d.id !== deletingDose.id))
      setDeletingDose(null)
    } catch (err) {
      console.error('Error deleting dose:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-800">Dose History</h2>

      {sortedDoses.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <History size={48} className="mx-auto mb-3 opacity-50" />
          <p>No dose history yet</p>
          <p className="text-sm">Completed doses will appear here</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {sortedDoses.map((dose, idx) => {
              const pen = pens.find(p => p.id === dose.penId)
              const prevDose = sortedDoses[idx + 1]
              const daysSincePrev = prevDose ? getDaysBetween(prevDose.date, dose.date) : null
              const isSyringe = isDoseSyringe(dose)
              
              return (
                <div key={dose.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
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
                        {pen && <span className="ml-2 text-slate-400">• {pen.size}mg pen</span>}
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

// ============================================================================
// METRICS OVERVIEW COMPONENT
// ============================================================================

const MetricsOverview = ({ pens, doses, penUsage, userId }) => {
  const metrics = useMemo(() => calculateSystemMetrics(pens, doses, penUsage), [pens, doses, penUsage])
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [snapshotSaved, setSnapshotSaved] = useState(false)

  const handleSaveSnapshot = async () => {
    setSavingSnapshot(true)
    setSnapshotSaved(false)
    try {
      const today = new Date().toISOString().split('T')[0]

      // Save system-wide metrics
      await saveSystemMetricsSnapshot(userId, metrics, today)

      // Save individual pen metrics
      for (const penMetric of metrics.penMetrics) {
        await savePenMetricsSnapshot(userId, penMetric, today)
      }

      setSnapshotSaved(true)
      setTimeout(() => setSnapshotSaved(false), 3000)
    } catch (err) {
      console.error('Error saving metrics snapshot:', err)
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

      {/* Planned Dose Issues - CRITICAL SECTION */}
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

                    {/* Issue warnings */}
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
                                    • {dose.mg}mg on {formatDateShort(dose.date)} ({dose.daysAfterExpiry} days after expiry)
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
                                Only {penMetric.projectedDaysBetweenLastDoseAndExpiry} days before expiry •
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
                        {penMetric.remaining.toFixed(1)}mg remaining •
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
                        <span className="text-sm text-slate-400">—</span>
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
                        <span className="text-sm text-slate-400">—</span>
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

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [pens, setPens] = useState([])
  const [doses, setDoses] = useState([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch data when user logs in
  useEffect(() => {
    if (!user) {
      setPens([])
      setDoses([])
      setDataLoading(false)
      return
    }

    const loadData = async () => {
      setDataLoading(true)
      setError(null)
      try {
        const [pensData, dosesData] = await Promise.all([
          fetchPens(user.id),
          fetchDoses(user.id)
        ])
        setPens(pensData)
        setDoses(dosesData)
      } catch (err) {
        console.error('Error loading data:', err)
        setError('Failed to load your data. Please try again.')
      } finally {
        setDataLoading(false)
      }
    }

    loadData()
  }, [user])

  // Compute mg used/reserved per pen from ALL doses
  const penUsage = useMemo(() => {
    const usage = {}
    pens.forEach(pen => { usage[pen.id] = 0 })
    
    doses.forEach(dose => {
      if (usage[dose.penId] !== undefined) {
        usage[dose.penId] += dose.mg
      }
    })
    
    return usage
  }, [pens, doses])

  // Show login page if not authenticated
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Droplets size={48} className="mx-auto mb-3 text-teal-600 animate-pulse" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  // Show loading state while fetching data
  if (dataLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Droplets size={48} className="mx-auto mb-3 text-teal-600 animate-pulse" />
          <p className="text-slate-600">Loading your data...</p>
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertTriangle size={48} className="mx-auto mb-3 text-rose-500" />
          <p className="text-slate-800 font-medium mb-2">Something went wrong</p>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center">
                <Droplets size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Mounjaro Hub</h1>
                <p className="text-sm text-slate-500">Tirzepatide dose management</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-600">
                <User size={16} />
                <span>{user.email}</span>
              </div>
              <button
                onClick={signOut}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
          
          <nav className="flex gap-1 overflow-x-auto pb-1">
            <TabButton 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')}
              icon={Activity}
              label="Dashboard"
            />
            <TabButton 
              active={activeTab === 'pens'} 
              onClick={() => setActiveTab('pens')}
              icon={Package}
              label="Pens"
            />
            <TabButton 
              active={activeTab === 'calendar'} 
              onClick={() => setActiveTab('calendar')}
              icon={Calendar}
              label="Calendar"
            />
            <TabButton 
              active={activeTab === 'decay'} 
              onClick={() => setActiveTab('decay')}
              icon={TrendingUp}
              label="PK Chart"
            />
            <TabButton
              active={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
              icon={History}
              label="History"
            />
            <TabButton
              active={activeTab === 'metrics'}
              onClick={() => setActiveTab('metrics')}
              icon={BarChart3}
              label="Metrics"
            />
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {activeTab === 'dashboard' && (
          <Dashboard pens={pens} doses={doses} penUsage={penUsage} />
        )}
        {activeTab === 'pens' && (
          <PenInventory pens={pens} setPens={setPens} doses={doses} setDoses={setDoses} penUsage={penUsage} userId={user.id} />
        )}
        {activeTab === 'calendar' && (
          <DoseCalendar pens={pens} doses={doses} setDoses={setDoses} penUsage={penUsage} userId={user.id} />
        )}
        {activeTab === 'decay' && (
          <PKDecayChart doses={doses} />
        )}
        {activeTab === 'history' && (
          <DoseHistory pens={pens} doses={doses} setDoses={setDoses} penUsage={penUsage} userId={user.id} />
        )}
        {activeTab === 'metrics' && (
          <MetricsOverview pens={pens} doses={doses} penUsage={penUsage} userId={user.id} />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-8">
        <div className="max-w-5xl mx-auto px-4 py-4 text-center text-sm text-slate-500">
          <p>For personal tracking only. Consult your healthcare provider for medical advice.</p>
        </div>
      </footer>
    </div>
  )
}
