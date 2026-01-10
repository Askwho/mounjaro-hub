import { createClient } from '@supabase/supabase-js'

// These will be replaced with your actual Supabase credentials
// For production, use environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database helper functions

// ============================================================================
// PENS
// ============================================================================

export async function fetchPens(userId) {
  const { data, error } = await supabase
    .from('pens')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  
  if (error) throw error
  return data.map(pen => ({
    id: pen.id,
    size: pen.size,
    purchaseDate: pen.purchase_date,
    expirationDate: pen.expiration_date,
    notes: pen.notes
  }))
}

export async function createPen(userId, pen) {
  const { data, error } = await supabase
    .from('pens')
    .insert({
      user_id: userId,
      size: pen.size,
      purchase_date: pen.purchaseDate,
      expiration_date: pen.expirationDate,
      notes: pen.notes || ''
    })
    .select()
    .single()
  
  if (error) throw error
  return {
    id: data.id,
    size: data.size,
    purchaseDate: data.purchase_date,
    expirationDate: data.expiration_date,
    notes: data.notes
  }
}

export async function deletePen(penId) {
  const { error } = await supabase
    .from('pens')
    .delete()
    .eq('id', penId)
  
  if (error) throw error
}

// ============================================================================
// DOSES
// ============================================================================

export async function fetchDoses(userId) {
  const { data, error } = await supabase
    .from('doses')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })
  
  if (error) throw error
  return data.map(dose => ({
    id: dose.id,
    penId: dose.pen_id,
    date: dose.date,
    mg: dose.mg,
    isCompleted: dose.is_completed
  }))
}

export async function createDose(userId, dose) {
  const { data, error } = await supabase
    .from('doses')
    .insert({
      user_id: userId,
      pen_id: dose.penId,
      date: dose.date,
      mg: dose.mg,
      is_completed: dose.isCompleted
    })
    .select()
    .single()
  
  if (error) throw error
  return {
    id: data.id,
    penId: data.pen_id,
    date: data.date,
    mg: data.mg,
    isCompleted: data.is_completed
  }
}

export async function updateDose(doseId, updates) {
  const dbUpdates = {}
  if (updates.penId !== undefined) dbUpdates.pen_id = updates.penId
  if (updates.date !== undefined) dbUpdates.date = updates.date
  if (updates.mg !== undefined) dbUpdates.mg = updates.mg
  if (updates.isCompleted !== undefined) dbUpdates.is_completed = updates.isCompleted
  
  const { data, error } = await supabase
    .from('doses')
    .update(dbUpdates)
    .eq('id', doseId)
    .select()
    .single()
  
  if (error) throw error
  return {
    id: data.id,
    penId: data.pen_id,
    date: data.date,
    mg: data.mg,
    isCompleted: data.is_completed
  }
}

export async function deleteDose(doseId) {
  const { error } = await supabase
    .from('doses')
    .delete()
    .eq('id', doseId)
  
  if (error) throw error
}

export async function deleteDosesByPenId(penId) {
  const { error } = await supabase
    .from('doses')
    .delete()
    .eq('pen_id', penId)

  if (error) throw error
}

export async function deleteAllPlannedDoses(userId) {
  const { error } = await supabase
    .from('doses')
    .delete()
    .eq('user_id', userId)
    .eq('is_completed', false)

  if (error) throw error
}

// ============================================================================
// METRICS SNAPSHOTS
// ============================================================================

export async function savePenMetricsSnapshot(userId, penMetric, snapshotDate) {
  const { data, error } = await supabase
    .from('pen_metrics_snapshots')
    .upsert({
      user_id: userId,
      pen_id: penMetric.penId,
      snapshot_date: snapshotDate,
      pen_size: penMetric.penSize,
      total_capacity: penMetric.totalCapacity,
      mg_used: penMetric.usage,
      mg_remaining: penMetric.remaining,
      usage_efficiency: penMetric.usageEfficiency,
      days_until_expiry: penMetric.daysUntilExpiry,
      is_expired: penMetric.isExpired,
      is_expiring_soon: penMetric.isExpiringSoon,
      last_use_date: penMetric.lastUseDate ? penMetric.lastUseDate.toISOString().split('T')[0] : null,
      days_between_last_use_and_expiry: penMetric.daysBetweenLastUseAndExpiry,
      wasted_mg: penMetric.wastedMg,
      waste_percentage: penMetric.wastePercentage,
      risk_level: penMetric.riskLevel,
      estimated_days_to_empty: penMetric.estimatedDaysToEmpty,
      total_doses: penMetric.doseCount,
      completed_doses: penMetric.completedDoseCount
    }, {
      onConflict: 'pen_id,snapshot_date'
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function saveSystemMetricsSnapshot(userId, systemMetrics, snapshotDate) {
  const { data, error } = await supabase
    .from('system_metrics_snapshots')
    .upsert({
      user_id: userId,
      snapshot_date: snapshotDate,
      total_pens: systemMetrics.totalPens,
      active_pens: systemMetrics.activePens,
      expired_pens: systemMetrics.expiredPens,
      empty_pens: systemMetrics.emptyPens,
      total_capacity: systemMetrics.totalCapacity,
      total_used: systemMetrics.totalUsed,
      total_remaining: systemMetrics.totalRemaining,
      total_wasted: systemMetrics.totalWasted,
      average_efficiency: systemMetrics.averageEfficiency,
      average_waste_per_pen: systemMetrics.averageWastePerPen,
      avg_days_between_last_use_and_expiry: systemMetrics.criticalMetrics.avgDaysBetweenLastUseAndExpiry,
      pens_expired_with_medication: systemMetrics.criticalMetrics.pensExpiredWithMedication,
      total_medication_wasted: systemMetrics.criticalMetrics.totalMedicationWasted,
      pens_at_risk_count: systemMetrics.pensAtRisk.length
    }, {
      onConflict: 'user_id,snapshot_date'
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function fetchSystemMetricsSnapshots(userId, startDate, endDate) {
  let query = supabase
    .from('system_metrics_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: true })

  if (startDate) query = query.gte('snapshot_date', startDate)
  if (endDate) query = query.lte('snapshot_date', endDate)

  const { data, error } = await query
  if (error) throw error

  return data.map(snapshot => ({
    date: snapshot.snapshot_date,
    totalPens: snapshot.total_pens,
    activePens: snapshot.active_pens,
    expiredPens: snapshot.expired_pens,
    emptyPens: snapshot.empty_pens,
    totalCapacity: snapshot.total_capacity,
    totalUsed: snapshot.total_used,
    totalRemaining: snapshot.total_remaining,
    totalWasted: snapshot.total_wasted,
    averageEfficiency: snapshot.average_efficiency,
    averageWastePerPen: snapshot.average_waste_per_pen,
    avgDaysBetweenLastUseAndExpiry: snapshot.avg_days_between_last_use_and_expiry,
    pensExpiredWithMedication: snapshot.pens_expired_with_medication,
    totalMedicationWasted: snapshot.total_medication_wasted,
    pensAtRiskCount: snapshot.pens_at_risk_count
  }))
}

export async function fetchPenMetricsSnapshots(userId, penId, startDate, endDate) {
  let query = supabase
    .from('pen_metrics_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: true })

  if (penId) query = query.eq('pen_id', penId)
  if (startDate) query = query.gte('snapshot_date', startDate)
  if (endDate) query = query.lte('snapshot_date', endDate)

  const { data, error } = await query
  if (error) throw error

  return data.map(snapshot => ({
    date: snapshot.snapshot_date,
    penId: snapshot.pen_id,
    penSize: snapshot.pen_size,
    totalCapacity: snapshot.total_capacity,
    mgUsed: snapshot.mg_used,
    mgRemaining: snapshot.mg_remaining,
    usageEfficiency: snapshot.usage_efficiency,
    daysUntilExpiry: snapshot.days_until_expiry,
    isExpired: snapshot.is_expired,
    isExpiringSoon: snapshot.is_expiring_soon,
    lastUseDate: snapshot.last_use_date,
    daysBetweenLastUseAndExpiry: snapshot.days_between_last_use_and_expiry,
    wastedMg: snapshot.wasted_mg,
    wastePercentage: snapshot.waste_percentage,
    riskLevel: snapshot.risk_level,
    estimatedDaysToEmpty: snapshot.estimated_days_to_empty,
    totalDoses: snapshot.total_doses,
    completedDoses: snapshot.completed_doses
  }))
}
