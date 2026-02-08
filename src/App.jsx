import React, { useState, useEffect, useMemo } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import {
  Droplets, AlertTriangle, LogOut, User,
  Activity, Package, Calendar, TrendingUp, History, BarChart3, Scale
} from 'lucide-react'
import { useAuth } from './contexts/AuthContext'
import { fetchPens, fetchDoses, fetchWeights } from './lib/supabase'
import TabButton from './components/ui/TabButton'
import ErrorBoundary from './components/ErrorBoundary'
import LoginPage from './components/LoginPage'
import Dashboard from './components/Dashboard'
import PenInventory from './components/PenInventory'
import DoseCalendar from './components/DoseCalendar'
import PKDecayChart from './components/PKDecayChart'
import DoseHistory from './components/DoseHistory'
import MetricsOverview from './components/MetricsOverview'
import WeightTracker from './components/WeightTracker'

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [pens, setPens] = useState([])
  const [doses, setDoses] = useState([])
  const [weights, setWeights] = useState([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) {
      setPens([])
      setDoses([])
      setWeights([])
      setDataLoading(false)
      return
    }

    const loadData = async () => {
      setDataLoading(true)
      setError(null)
      try {
        const [pensData, dosesData, weightsData] = await Promise.all([
          fetchPens(user.id),
          fetchDoses(user.id),
          fetchWeights(user.id).catch(() => [])
        ])
        setPens(pensData)
        setDoses(dosesData)
        setWeights(weightsData)
      } catch (err) {
        console.error('Error loading data:', err)
        setError('Failed to load your data. Please try again.')
      } finally {
        setDataLoading(false)
      }
    }

    loadData()
  }, [user])

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

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md" role="alert">
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
      <Toaster position="top-center" richColors closeButton />

      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

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
                aria-label="Sign out"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto pb-1" aria-label="Main navigation">
            <TabButton to="/" icon={Activity} label="Dashboard" />
            <TabButton to="/pens" icon={Package} label="Pens" />
            <TabButton to="/calendar" icon={Calendar} label="Calendar" />
            <TabButton to="/chart" icon={TrendingUp} label="PK Chart" />
            <TabButton to="/history" icon={History} label="History" />
            <TabButton to="/weight" icon={Scale} label="Weight" />
            <TabButton to="/metrics" icon={BarChart3} label="Metrics" />
          </nav>
        </div>
      </header>

      <main id="main-content" className="max-w-5xl mx-auto px-4 py-6">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard pens={pens} doses={doses} setDoses={setDoses} penUsage={penUsage} weights={weights} />} />
            <Route path="/pens" element={<PenInventory pens={pens} setPens={setPens} doses={doses} setDoses={setDoses} penUsage={penUsage} userId={user.id} />} />
            <Route path="/calendar" element={<DoseCalendar pens={pens} doses={doses} setDoses={setDoses} penUsage={penUsage} userId={user.id} />} />
            <Route path="/chart" element={<PKDecayChart doses={doses} />} />
            <Route path="/history" element={<DoseHistory pens={pens} doses={doses} setDoses={setDoses} penUsage={penUsage} userId={user.id} />} />
            <Route path="/weight" element={<WeightTracker weights={weights} setWeights={setWeights} doses={doses} userId={user.id} />} />
            <Route path="/metrics" element={<MetricsOverview pens={pens} doses={doses} penUsage={penUsage} userId={user.id} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-8">
        <div className="max-w-5xl mx-auto px-4 py-4 text-center text-sm text-slate-500">
          <p>For personal tracking only. Consult your healthcare provider for medical advice.</p>
        </div>
      </footer>
    </div>
  )
}
