import { HALF_LIFE_DAYS } from './constants'

export const calculateConcentration = (doses, targetDate) => {
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
