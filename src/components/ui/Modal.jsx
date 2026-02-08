import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const Modal = ({ isOpen, onClose, title, children }) => {
  const dialogRef = useRef(null)
  const previousFocus = useRef(null)

  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement
      // Focus the dialog after animation
      const timer = setTimeout(() => {
        dialogRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    } else if (previousFocus.current) {
      previousFocus.current.focus()
      previousFocus.current = null
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      // Trap focus inside modal
      if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (!focusable?.length) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-backdrop-enter"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto animate-modal-enter focus:outline-none"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close dialog"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export default Modal
