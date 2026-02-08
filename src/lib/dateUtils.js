export const formatDate = (date) => {
  const d = new Date(date)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const formatDateShort = (date) => {
  const d = new Date(date)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export const getDaysUntil = (date) => {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
}

export const getDaysBetween = (date1, date2) => {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  d1.setHours(0, 0, 0, 0)
  d2.setHours(0, 0, 0, 0)
  return Math.abs(Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)))
}
