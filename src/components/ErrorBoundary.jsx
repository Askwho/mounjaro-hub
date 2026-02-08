import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] flex items-center justify-center p-8" role="alert">
          <div className="text-center max-w-md">
            <AlertTriangle size={48} className="mx-auto mb-4 text-rose-500" />
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Something went wrong</h2>
            <p className="text-slate-600 mb-4">
              This section encountered an error. Your data is safe.
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <RefreshCw size={16} />
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
