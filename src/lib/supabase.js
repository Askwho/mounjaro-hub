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
