import React from 'react'
import { NavLink } from 'react-router-dom'

const TabButton = ({ to, icon: Icon, label }) => (
  <NavLink
    to={to}
    end={to === '/'}
    className={({ isActive }) =>
      `flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        isActive
          ? 'bg-teal-50 text-teal-700'
          : 'text-slate-600 hover:bg-slate-100'
      }`
    }
  >
    <Icon size={18} />
    <span className="hidden sm:inline">{label}</span>
  </NavLink>
)

export default TabButton
