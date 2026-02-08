export const getClickCapacity = (penSize) => penSize * 4
export const getSyringeCapacity = (penSize) => penSize
export const getTotalCapacity = (penSize) => penSize * 5

export const getPenAvailability = (penSize, mgUsed) => {
  const clickCap = getClickCapacity(penSize)
  const totalCap = getTotalCapacity(penSize)

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

export const doseRequiresSyringe = (penSize, mgUsedBefore, doseMg) => {
  const clickCap = getClickCapacity(penSize)
  return (mgUsedBefore + doseMg) > clickCap
}

export const getDoseBreakdown = (penSize, mgUsedBefore, doseMg) => {
  const clickCap = getClickCapacity(penSize)
  const clicksAvailable = Math.max(0, clickCap - mgUsedBefore)

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

export const isDoseSyringe = (dose, pens, doses) => {
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
