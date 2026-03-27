import React, { useState, useEffect, useCallback, useRef } from 'react'

// ─── Supabase Config ────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://aejnfgtttbenrnlmrsam.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlam5mZ3R0dGJlbnJubG1yc2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Mzk5NTMsImV4cCI6MjA5MDIxNTk1M30.8fLf1gmgdtF3J0JaLX_LC73Jk15N451zAfiM6NuDXdU'

const headers = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
}

const headersGet = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
}

// ─── Pipeline Stages ────────────────────────────────────────────────────────
const STAGES = [
  'Lead Gen', 'Initial Contact', 'Discovery Call', 'Proposal Sent',
  'Proposal Review', 'Intake Received', 'Eligibility Analysis',
  'Employer Review', 'Ready to Enroll', 'Enrolling', 'Implementation', 'Active'
]

const STAGE_COLORS = {
  'Lead Gen': '#94a3b8', 'Initial Contact': '#60a5fa', 'Discovery Call': '#818cf8',
  'Proposal Sent': '#a78bfa', 'Proposal Review': '#c084fc', 'Intake Received': '#29ABE2',
  'Eligibility Analysis': '#f59e0b', 'Employer Review': '#fb923c',
  'Ready to Enroll': '#34d399', 'Enrolling': '#7AC143', 'Implementation': '#22c55e', 'Active': '#16a34a'
}

// ─── API Helpers ────────────────────────────────────────────────────────────
const fetchOrgs = async () => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/organizations?select=*,brokers(id,name,agency_name)&order=created_at.desc`,
    { headers: headersGet }
  )
  if (!res.ok) throw new Error('Failed to fetch organizations')
  return res.json()
}

const fetchBrokers = async () => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/brokers?select=*&order=name.asc`,
    { headers: headersGet }
  )
  if (!res.ok) throw new Error('Failed to fetch brokers')
  return res.json()
}

const fetchCommissions = async () => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/broker_commissions?select=*,brokers(name),organizations(company_name)&order=created_at.desc`,
    { headers: headersGet }
  )
  if (!res.ok) return []
  return res.json()
}

const fetchCampaigns = async () => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/enrollment_campaigns?select=*,organizations(company_name)&order=created_at.desc`,
    { headers: headersGet }
  )
  if (!res.ok) return []
  return res.json()
}

const fetchAuditLog = async (orgId) => {
  const url = orgId
    ? `${SUPABASE_URL}/rest/v1/audit_log?organization_id=eq.${orgId}&order=created_at.desc&limit=50`
    : `${SUPABASE_URL}/rest/v1/audit_log?order=created_at.desc&limit=100`
  const res = await fetch(url, { headers: headersGet })
  if (!res.ok) return []
  return res.json()
}

const updateOrgStage = async (id, newStage) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      pipeline_stage: newStage,
      stage_changed_at: new Date().toISOString()
    })
  })
  if (!res.ok) throw new Error('Failed to update stage')
}

const updateOrg = async (id, data) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to update organization')
}

// ─── Utility ────────────────────────────────────────────────────────────────
const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / 86400000)
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const formatCurrency = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'

// ─── CSV Export ─────────────────────────────────────────────────────────────
const exportCSV = (orgs) => {
  const cols = ['company_name', 'pipeline_stage', 'contact_first_name', 'contact_last_name', 'contact_email', 'contact_phone', 'employee_count', 'city', 'state', 'created_at']
  const header = cols.join(',')
  const rows = orgs.map(o => cols.map(c => `"${(o[c] ?? '').toString().replace(/"/g, '""')}"`).join(','))
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lw360-organizations-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState('pipeline')
  const [orgs, setOrgs] = useState([])
  const [brokers, setBrokers] = useState([])
  const [commissions, setCommissions] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedOrg, setSelectedOrg] = useState(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [dragOrgId, setDragOrgId] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [orgData, brokerData, commData, campData] = await Promise.all([
        fetchOrgs(), fetchBrokers(), fetchCommissions(), fetchCampaigns()
      ])
      setOrgs(orgData || [])
      setBrokers(brokerData || [])
      setCommissions(commData || [])
      setCampaigns(campData || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleStageChange = async (orgId, newStage) => {
    try {
      await updateOrgStage(orgId, newStage)
      setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, pipeline_stage: newStage, stage_changed_at: new Date().toISOString() } : o))
      if (selectedOrg?.id === orgId) setSelectedOrg(prev => ({ ...prev, pipeline_stage: newStage, stage_changed_at: new Date().toISOString() }))
    } catch (e) {
      alert('Failed to update stage: ' + e.message)
    }
  }

  // Stats
  const totalOrgs = orgs.length
  const stageCounts = STAGES.reduce((acc, s) => { acc[s] = orgs.filter(o => o.pipeline_stage === s).length; return acc }, {})
  const thisMonth = orgs.filter(o => {
    if (!o.created_at) return false
    const d = new Date(o.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const activeEnrollments = orgs.filter(o => ['Enrolling', 'Active'].includes(o.pipeline_stage)).length

  const filteredOrgs = orgs.filter(o => {
    const matchSearch = !search || (o.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.contact_email || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.contact_first_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.contact_last_name || '').toLowerCase().includes(search.toLowerCase())
    const matchStage = !stageFilter || o.pipeline_stage === stageFilter
    return matchSearch && matchStage
  })

  return (
    <div style={{ minHeight: '100vh', background: '#F5F7FA' }}>
      {/* Header */}
      <header style={{ background: '#1A395C', color: 'white', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#7AC143', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>LW</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>Live Well 360</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Internal Tracker</div>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: 4, marginLeft: 32 }}>
            {['pipeline', 'organizations', 'brokers', 'reports'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
                background: tab === t ? 'rgba(122,193,67,0.2)' : 'transparent',
                color: tab === t ? '#7AC143' : 'rgba(255,255,255,0.7)',
              }}>{t}</button>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={loadData} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            Refresh
          </button>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#29ABE2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>JA</div>
        </div>
      </header>

      {/* Stats Bar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total Organizations" value={totalOrgs} color="#1A395C" />
        <StatCard label="New This Month" value={thisMonth} color="#29ABE2" />
        <StatCard label="Active Enrollments" value={activeEnrollments} color="#7AC143" />
        <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', minWidth: 200 }}>
          {STAGES.map(s => (
            <span key={s} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `${STAGE_COLORS[s]}18`, color: STAGE_COLORS[s], fontWeight: 600, whiteSpace: 'nowrap' }}>
              {s}: {stageCounts[s]}
            </span>
          ))}
        </div>
      </div>

      {/* Error / Loading */}
      {error && (
        <div style={{ margin: 24, padding: 16, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontSize: 14 }}>
          {error} <button onClick={loadData} style={{ marginLeft: 8, color: '#29ABE2', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, color: '#64748b' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#29ABE2', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            Loading data...
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex' }}>
          {/* Main Content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {tab === 'pipeline' && (
              <PipelineView orgs={orgs} onStageChange={handleStageChange} onSelect={setSelectedOrg}
                dragOrgId={dragOrgId} setDragOrgId={setDragOrgId} />
            )}
            {tab === 'organizations' && (
              <OrganizationsTable orgs={filteredOrgs} allOrgs={orgs} search={search} setSearch={setSearch}
                stageFilter={stageFilter} setStageFilter={setStageFilter}
                onSelect={setSelectedOrg} onStageChange={handleStageChange} />
            )}
            {tab === 'brokers' && (
              <BrokersView brokers={brokers} orgs={orgs} commissions={commissions} />
            )}
            {tab === 'reports' && (
              <ReportsView orgs={orgs} campaigns={campaigns} brokers={brokers} commissions={commissions} />
            )}
          </div>

          {/* Detail Sidebar */}
          {selectedOrg && (
            <DetailSidebar org={selectedOrg} brokers={brokers} campaigns={campaigns}
              onClose={() => setSelectedOrg(null)} onStageChange={handleStageChange}
              onUpdate={async (id, data) => { await updateOrg(id, data); await loadData() }} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div style={{ minWidth: 140 }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE VIEW (Kanban)
// ═══════════════════════════════════════════════════════════════════════════
function PipelineView({ orgs, onStageChange, onSelect, dragOrgId, setDragOrgId }) {
  const handleDrop = (stage) => (e) => {
    e.preventDefault()
    if (dragOrgId) {
      onStageChange(dragOrgId, stage)
      setDragOrgId(null)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, padding: 16, overflowX: 'auto', minHeight: 'calc(100vh - 180px)' }}>
      {STAGES.map(stage => {
        const stageOrgs = orgs.filter(o => o.pipeline_stage === stage)
        return (
          <div key={stage}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop(stage)}
            style={{ minWidth: 220, maxWidth: 260, flex: '0 0 220px', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              padding: '8px 12px', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: STAGE_COLORS[stage], color: 'white', fontSize: 12, fontWeight: 600
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stage}</span>
              <span style={{ background: 'rgba(255,255,255,0.3)', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{stageOrgs.length}</span>
            </div>
            <div style={{ flex: 1, background: '#f1f5f9', borderRadius: '0 0 8px 8px', padding: 6, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 100 }}>
              {stageOrgs.map(org => (
                <PipelineCard key={org.id} org={org} onSelect={onSelect} setDragOrgId={setDragOrgId} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PipelineCard({ org, onSelect, setDragOrgId }) {
  const daysInStage = org.stage_changed_at ? daysBetween(org.stage_changed_at, new Date()) : org.created_at ? daysBetween(org.created_at, new Date()) : 0
  const status = daysInStage > 21 ? 'red' : daysInStage > 14 ? 'yellow' : 'green'
  const statusColors = { green: '#7AC143', yellow: '#f59e0b', red: '#ef4444' }

  return (
    <div draggable onDragStart={() => setDragOrgId(org.id)} onClick={() => onSelect(org)}
      style={{
        background: 'white', borderRadius: 6, padding: 10, cursor: 'pointer', fontSize: 12,
        borderLeft: `3px solid ${statusColors[status]}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)', transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'}
    >
      <div style={{ fontWeight: 600, color: '#1A395C', marginBottom: 4, lineHeight: 1.3 }}>{org.company_name || 'Unnamed'}</div>
      {(org.contact_first_name || org.contact_last_name) && (
        <div style={{ color: '#64748b', marginBottom: 2 }}>{org.contact_first_name} {org.contact_last_name}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: '#94a3b8', fontSize: 10 }}>
        {org.employee_count && <span>{org.employee_count} employees</span>}
        <span style={{ color: statusColors[status], fontWeight: 600 }}>{daysInStage}d</span>
      </div>
      {org.brokers?.name && (
        <div style={{ marginTop: 4, fontSize: 10, color: '#29ABE2' }}>{org.brokers.name}</div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATIONS TABLE
// ═══════════════════════════════════════════════════════════════════════════
function OrganizationsTable({ orgs, allOrgs, search, setSearch, stageFilter, setStageFilter, onSelect, onStageChange }) {
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  const sorted = [...orgs].sort((a, b) => {
    let va = a[sortField], vb = b[sortField]
    if (sortField === 'created_at') { va = va || ''; vb = vb || '' }
    if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase() }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortHeader = ({ field, children }) => (
    <th onClick={() => toggleSort(field)} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {children} {sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <div style={{ padding: 24 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search organizations..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, flex: 1, minWidth: 200, outline: 'none' }} />
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, background: 'white' }}>
          <option value="">All Stages</option>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => exportCSV(allOrgs)} style={{
          padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1A395C', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer'
        }}>Export CSV</button>
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ borderBottom: '2px solid #e2e8f0' }}>
            <tr>
              <SortHeader field="company_name">Name</SortHeader>
              <SortHeader field="pipeline_stage">Stage</SortHeader>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Broker</th>
              <SortHeader field="employee_count">Employees</SortHeader>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Contact</th>
              <SortHeader field="created_at">Created</SortHeader>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(org => (
              <tr key={org.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#1A395C', cursor: 'pointer' }} onClick={() => onSelect(org)}>
                  {org.company_name || '—'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 600,
                    background: `${STAGE_COLORS[org.pipeline_stage] || '#94a3b8'}18`,
                    color: STAGE_COLORS[org.pipeline_stage] || '#94a3b8'
                  }}>{org.pipeline_stage || '—'}</span>
                </td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>{org.brokers?.name || '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>{org.employee_count || '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>
                  {org.contact_first_name || org.contact_last_name
                    ? `${org.contact_first_name || ''} ${org.contact_last_name || ''}`.trim()
                    : '—'}
                  {org.contact_email && <div style={{ fontSize: 11, color: '#29ABE2' }}>{org.contact_email}</div>}
                </td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8' }}>{formatDate(org.created_at)}</td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => onSelect(org)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#1A395C' }}>View</button>
                    <select value="" onChange={e => { if (e.target.value) onStageChange(org.id, e.target.value) }}
                      style={{ fontSize: 11, padding: '4px 6px', borderRadius: 4, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#64748b' }}>
                      <option value="">Move to...</option>
                      {STAGES.filter(s => s !== org.pipeline_stage).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>No organizations found</div>
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>Showing {sorted.length} of {allOrgs.length} organizations</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAIL SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════
function DetailSidebar({ org, brokers, campaigns, onClose, onStageChange, onUpdate }) {
  const [notes, setNotes] = useState(org.notes || '')
  const [auditLog, setAuditLog] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNotes(org.notes || '')
    fetchAuditLog(org.id).then(setAuditLog)
  }, [org.id])

  const saveNotes = async () => {
    setSaving(true)
    try {
      await onUpdate(org.id, { notes })
    } catch (e) {
      alert('Failed to save: ' + e.message)
    }
    setSaving(false)
  }

  const orgCampaigns = campaigns.filter(c => c.organization_id === org.id)
  const currentStageIdx = STAGES.indexOf(org.pipeline_stage)

  return (
    <div style={{ width: 420, borderLeft: '1px solid #e2e8f0', background: 'white', height: 'calc(100vh - 130px)', overflowY: 'auto', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1A395C' }}>{org.company_name || 'Unnamed'}</div>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 600, background: `${STAGE_COLORS[org.pipeline_stage] || '#94a3b8'}18`, color: STAGE_COLORS[org.pipeline_stage] || '#94a3b8' }}>
            {org.pipeline_stage || 'No Stage'}
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>x</button>
      </div>

      <div style={{ padding: 20 }}>
        {/* Stage Progress */}
        <Section title="Pipeline Progress">
          <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
            {STAGES.map((s, i) => (
              <div key={s} title={s} style={{
                flex: 1, height: 6, borderRadius: 3,
                background: i <= currentStageIdx ? STAGE_COLORS[s] : '#e2e8f0'
              }} />
            ))}
          </div>
          <select value={org.pipeline_stage || ''} onChange={e => onStageChange(org.id, e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Section>

        {/* Contact */}
        <Section title="Contact Information">
          <Field label="Name" value={`${org.contact_first_name || ''} ${org.contact_last_name || ''}`.trim()} />
          <Field label="Title" value={org.contact_title} />
          <Field label="Email" value={org.contact_email} link={`mailto:${org.contact_email}`} />
          <Field label="Phone" value={org.contact_phone} />
        </Section>

        {/* Company Info */}
        <Section title="Company Details">
          <Field label="Industry" value={org.industry} />
          <Field label="Employees" value={org.employee_count} />
          <Field label="Location" value={[org.city, org.state, org.zip_code].filter(Boolean).join(', ')} />
          <Field label="Address" value={org.street_address} />
          <Field label="EIN" value={org.ein} />
          <Field label="Website" value={org.website} />
        </Section>

        {/* Payroll */}
        <Section title="Payroll & Benefits">
          <Field label="Payroll Provider" value={org.payroll_provider} />
          <Field label="Pay Frequency" value={org.pay_frequency} />
          <Field label="Current Benefits" value={org.current_benefits_carrier} />
          <Field label="Renewal Date" value={formatDate(org.renewal_date)} />
          <Field label="Monthly Premium" value={formatCurrency(org.current_monthly_premium)} />
        </Section>

        {/* Broker */}
        <Section title="Broker Assignment">
          <Field label="Broker" value={org.brokers?.name} />
          <Field label="Agency" value={org.brokers?.agency_name} />
        </Section>

        {/* Campaigns */}
        {orgCampaigns.length > 0 && (
          <Section title="Enrollment Campaigns">
            {orgCampaigns.map(c => (
              <div key={c.id} style={{ padding: 8, background: '#f8fafc', borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: '#1A395C' }}>{c.campaign_name || 'Campaign'}</div>
                <div style={{ color: '#64748b', marginTop: 2 }}>Status: {c.status || '—'}</div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>{formatDate(c.start_date)} - {formatDate(c.end_date)}</div>
              </div>
            ))}
          </Section>
        )}

        {/* Notes */}
        <Section title="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
            placeholder="Add notes about this organization..."
            style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
          <button onClick={saveNotes} disabled={saving}
            style={{ marginTop: 6, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#7AC143', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Save Notes'}
          </button>
        </Section>

        {/* Activity Log */}
        <Section title="Activity Log">
          {auditLog.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>No activity recorded</div>
          ) : auditLog.slice(0, 10).map(log => (
            <div key={log.id} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
              <div style={{ color: '#1A395C', fontWeight: 500 }}>{log.action}</div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>{formatDate(log.created_at)}</div>
            </div>
          ))}
        </Section>

        {/* Timestamps */}
        <Section title="Dates">
          <Field label="Created" value={formatDate(org.created_at)} />
          <Field label="Stage Changed" value={formatDate(org.stage_changed_at)} />
          <Field label="Updated" value={formatDate(org.updated_at)} />
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function Field({ label, value, link }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      {link ? <a href={link} style={{ color: '#29ABE2', textDecoration: 'none' }}>{value}</a> : <span style={{ color: '#1A395C', fontWeight: 500, textAlign: 'right' }}>{value}</span>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// BROKERS VIEW
// ═══════════════════════════════════════════════════════════════════════════
function BrokersView({ brokers, orgs, commissions }) {
  const [selectedBroker, setSelectedBroker] = useState(null)

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1A395C', marginBottom: 16 }}>Broker Network</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {brokers.map(b => {
          const brokerOrgs = orgs.filter(o => o.broker_id === b.id)
          const brokerComm = commissions.filter(c => c.broker_id === b.id)
          const totalComm = brokerComm.reduce((sum, c) => sum + (c.amount || 0), 0)
          return (
            <div key={b.id} onClick={() => setSelectedBroker(selectedBroker?.id === b.id ? null : b)}
              style={{
                background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', cursor: 'pointer',
                border: selectedBroker?.id === b.id ? '2px solid #29ABE2' : '2px solid transparent'
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1A395C' }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{b.agency_name || ''}</div>
                </div>
                <div style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 600, background: b.status === 'active' ? '#7AC14318' : '#94a3b818', color: b.status === 'active' ? '#7AC143' : '#94a3b8' }}>
                  {b.status || 'active'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Deals</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1A395C' }}>{brokerOrgs.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Commissions</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#7AC143' }}>{formatCurrency(totalComm)}</div>
                </div>
              </div>
              {b.email && <div style={{ marginTop: 8, fontSize: 12, color: '#29ABE2' }}>{b.email}</div>}
              {b.phone && <div style={{ fontSize: 12, color: '#64748b' }}>{b.phone}</div>}

              {/* Upline info */}
              {b.upline_broker_id && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                  Upline: {brokers.find(ub => ub.id === b.upline_broker_id)?.name || 'Unknown'}
                </div>
              )}

              {/* Expanded detail */}
              {selectedBroker?.id === b.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1A395C', marginBottom: 6 }}>Assigned Organizations</div>
                  {brokerOrgs.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>No organizations assigned</div>
                  ) : brokerOrgs.map(o => (
                    <div key={o.id} style={{ fontSize: 12, padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#1A395C' }}>{o.company_name}</span>
                      <span style={{ color: STAGE_COLORS[o.pipeline_stage], fontSize: 11, fontWeight: 600 }}>{o.pipeline_stage}</span>
                    </div>
                  ))}

                  {/* Downline brokers */}
                  {brokers.filter(db => db.upline_broker_id === b.id).length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1A395C', marginBottom: 4 }}>Downline Brokers</div>
                      {brokers.filter(db => db.upline_broker_id === b.id).map(db => (
                        <div key={db.id} style={{ fontSize: 12, color: '#64748b', padding: '2px 0' }}>{db.name} — {db.agency_name || ''}</div>
                      ))}
                    </div>
                  )}

                  {/* Commission history */}
                  {brokerComm.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1A395C', marginBottom: 4 }}>Commission History</div>
                      {brokerComm.slice(0, 5).map(c => (
                        <div key={c.id} style={{ fontSize: 11, padding: '3px 0', display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                          <span>{c.organizations?.company_name || '—'}</span>
                          <span style={{ color: '#7AC143', fontWeight: 600 }}>{formatCurrency(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {brokers.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No brokers found</div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS VIEW
// ═══════════════════════════════════════════════════════════════════════════
function ReportsView({ orgs, campaigns, brokers, commissions }) {
  // Stage distribution
  const stageData = STAGES.map(s => ({ stage: s, count: orgs.filter(o => o.pipeline_stage === s).length }))
  const maxCount = Math.max(...stageData.map(d => d.count), 1)

  // Monthly intakes
  const monthlyData = {}
  orgs.forEach(o => {
    if (!o.created_at) return
    const key = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    monthlyData[key] = (monthlyData[key] || 0) + 1
  })
  const months = Object.entries(monthlyData).slice(-6)
  const maxMonthly = Math.max(...months.map(([, v]) => v), 1)

  // Broker leaderboard
  const brokerStats = brokers.map(b => ({
    ...b,
    deals: orgs.filter(o => o.broker_id === b.id).length,
    totalComm: commissions.filter(c => c.broker_id === b.id).reduce((sum, c) => sum + (c.amount || 0), 0)
  })).sort((a, b) => b.deals - a.deals)

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1A395C' }}>Reports</h2>
        <button onClick={() => exportCSV(orgs)} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1A395C', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Export All Data (CSV)
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
        {/* Stage Distribution */}
        <div style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A395C', marginBottom: 16 }}>Pipeline Distribution</div>
          {stageData.map(d => (
            <div key={d.stage} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 110, fontSize: 11, color: '#64748b', textAlign: 'right', flexShrink: 0 }}>{d.stage}</div>
              <div style={{ flex: 1, height: 20, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(d.count / maxCount) * 100}%`, height: '100%', background: STAGE_COLORS[d.stage], borderRadius: 4, transition: 'width 0.3s', minWidth: d.count > 0 ? 20 : 0 }} />
              </div>
              <div style={{ width: 24, fontSize: 12, fontWeight: 600, color: '#1A395C', textAlign: 'right' }}>{d.count}</div>
            </div>
          ))}
        </div>

        {/* Monthly Intakes */}
        <div style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A395C', marginBottom: 16 }}>Monthly New Intakes</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160 }}>
            {months.map(([month, count]) => (
              <div key={month} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: `${(count / maxMonthly) * 120}px`, background: '#29ABE2', borderRadius: '4px 4px 0 0', minHeight: 4, transition: 'height 0.3s' }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1A395C', marginTop: 4 }}>{count}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{month}</div>
              </div>
            ))}
          </div>
          {months.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No data yet</div>}
        </div>

        {/* Broker Leaderboard */}
        <div style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A395C', marginBottom: 16 }}>Broker Leaderboard</div>
          {brokerStats.slice(0, 10).map((b, i) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ width: 24, fontSize: 14, fontWeight: 700, color: i < 3 ? '#f59e0b' : '#94a3b8' }}>#{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A395C' }}>{b.name}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{b.agency_name || ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A395C' }}>{b.deals} deals</div>
                <div style={{ fontSize: 11, color: '#7AC143' }}>{formatCurrency(b.totalComm)}</div>
              </div>
            </div>
          ))}
          {brokerStats.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No brokers yet</div>}
        </div>

        {/* Enrollment Campaigns */}
        <div style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A395C', marginBottom: 16 }}>Enrollment Campaigns</div>
          {campaigns.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No campaigns yet</div>
          ) : campaigns.slice(0, 10).map(c => (
            <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A395C' }}>{c.campaign_name || 'Unnamed'}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{c.organizations?.company_name || '—'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                  background: c.status === 'active' ? '#7AC14318' : c.status === 'completed' ? '#29ABE218' : '#94a3b818',
                  color: c.status === 'active' ? '#7AC143' : c.status === 'completed' ? '#29ABE2' : '#94a3b8'
                }}>{c.status || '—'}</span>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{formatDate(c.start_date)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 40, textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 11 }}>
        <div>Live Well 360 Health Strategy Advisors</div>
        <div>6609 Toledo Avenue Ste. 1, Lubbock, TX | (806) 799-1099 | livewellhealth360.com</div>
      </div>
    </div>
  )
}
