import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppWithProviders } from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#F5F7FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 40, maxWidth: 480, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1A395C', marginBottom: 8 }}>Something went wrong</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>{this.state.error?.message || 'An unexpected error occurred.'}</div>
            <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', borderRadius: 6, border: 'none', background: '#1A395C', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppWithProviders />
    </ErrorBoundary>
  </React.StrictMode>,
)
