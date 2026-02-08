import React, { useState, useMemo, useCallback } from 'react'
import { Syringe, Plus, Trash2, AlertTriangle, Check, ChevronLeft, ChevronRight, CalendarDays, Edit2, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import Modal from './ui/Modal'
import { PEN_SIZES } from '../lib/constants'
import { getPenAvailability, getDoseBreakdown, isDoseSyringe } from '../lib/penCalculations'
import { formatDate, formatDateShort, getDaysUntil, getDaysBetween } from '../lib/dateUtils'
import { createDose, updateDose, deleteDose, deleteAllPlannedDoses } from '../lib/supabase'

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
    const dayOfWeek = monthStart.getDay()
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    startDate.setDate(startDate.getDate() - mondayOffset)

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
        toast.success('Dose updated')
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
        toast.success('Dose added')
      } else {
        const dose = await createDose(userId, {
          penId: newDose.penId,
          date: selectedDate.toISOString(),
          mg: doseMg,
          isCompleted: newDose.isCompleted
        })
        setDoses(prev => [...prev, dose])
        toast.success('Dose added')
      }
      closeModal()
    } catch (err) {
      console.error('Error saving dose:', err)
      toast.error('Failed to save dose')
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
      toast.success('Dose deleted')
      closeModal()
    } catch (err) {
      console.error('Error deleting dose:', err)
      toast.error('Failed to delete dose')
    } finally {
      setLoading(false)
    }
  }

  const handleClearAllPlanned = async () => {
    setLoading(true)
    try {
      await deleteAllPlannedDoses(userId)
      setDoses(prev => prev.filter(d => d.isCompleted))
      toast.success('Planned doses cleared')
      setShowClearAllConfirm(false)
    } catch (err) {
      console.error('Error clearing planned doses:', err)
      toast.error('Failed to clear planned doses')
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
            aria-label="Previous month"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="font-medium text-slate-700 min-w-[140px] text-center">
            {currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
            className="p-2 hover:bg-slate-100 rounded-lg"
            aria-label="Next month"
          >
            <ChevronRight size={20} />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 py-1.5 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
            aria-label="Today"
          >
            Today
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
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
                      const isSyringe = isDoseSyringe(dose, pens, doses)
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

export default DoseCalendar
