import React, { useState } from 'react'
import { Droplets } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

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
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-4 text-sm text-rose-700" role="alert">
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

export default LoginPage
