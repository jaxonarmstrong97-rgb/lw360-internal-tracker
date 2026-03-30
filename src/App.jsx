import React, { useState, useEffect, useCallback, useRef } from 'react'
import { calculateEligibility, runValidationTests } from './utils/eligibility.js'

// ─── Supabase Config ────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://aejnfgtttbenrnlmrsam.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlam5mZ3R0dGJlbnJubG1yc2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Mzk5NTMsImV4cCI6MjA5MDIxNTk1M30.8fLf1gmgdtF3J0JaLX_LC73Jk15N451zAfiM6NuDXdU'

const headers = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
}

const headersRepr = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
}

const headersGet = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
}

// ─── HARDCODED TEST MODE — ALL emails go here ──────────────────────────────
const TEST_EMAIL_RECIPIENT = 'jaxon@livewellhsa.com'
const TEST_SUBJECT_PREFIX = '[TEST] '

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

// ─── Payroll Constants ──────────────────────────────────────────────────────
const LW_PREM = { 'Weekly': 270.69, 'Biweekly': 541.38, 'Semi-Monthly': 586.50, 'Monthly': 1173.00 }
const LW_EE_FEE = { 'Weekly': 20.68, 'Biweekly': 41.42, 'Semi-Monthly': 44.87, 'Monthly': 89.73 }

const CAMPAIGN_STATUSES = ['Draft', 'Previewed', 'Approved', 'Sending', 'In Progress', 'Pending Finalization', 'Completed']
const CAMPAIGN_STATUS_COLORS = {
  'Draft': '#94a3b8', 'Previewed': '#818cf8', 'Approved': '#f59e0b',
  'Sending': '#fb923c', 'In Progress': '#29ABE2', 'Pending Finalization': '#a78bfa', 'Completed': '#7AC143'
}

const EMPLOYEE_FIELDS = [
  'first_name', 'last_name', 'email', 'annual_salary', 'hourly_rate', 'hours_per_week',
  'filing_status', 'job_title', 'department', 'hire_date', 'pay_type', 'pay_frequency',
  'current_401k_per_period', 'current_health_insurance_per_period',
  'current_hsa_per_period', 'current_other_pretax_per_period'
]

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

const fetchEmployees = async (orgId) => {
  const url = orgId
    ? `${SUPABASE_URL}/rest/v1/employees?organization_id=eq.${orgId}&order=last_name.asc`
    : `${SUPABASE_URL}/rest/v1/employees?order=last_name.asc`
  const res = await fetch(url, { headers: headersGet })
  if (!res.ok) return []
  return res.json()
}

const fetchNotifications = async () => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notifications?order=created_at.desc&limit=30`,
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
    body: JSON.stringify({ pipeline_stage: newStage, stage_changed_at: new Date().toISOString() })
  })
  if (!res.ok) throw new Error('Failed to update stage')
}

const updateOrg = async (id, data) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${id}`, {
    method: 'PATCH', headers, body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to update organization')
}

const createAuditEntry = async (entry) => {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/audit_log`, {
      method: 'POST', headers,
      body: JSON.stringify({ ...entry, created_at: new Date().toISOString() })
    })
  } catch (e) { console.error('Audit log error:', e) }
}

const createNotification = async (notification) => {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST', headers,
      body: JSON.stringify({ ...notification, is_read: false, created_at: new Date().toISOString() })
    })
  } catch (e) { console.error('Notification error:', e) }
}

const markNotificationRead = async (id) => {
  await fetch(`${SUPABASE_URL}/rest/v1/notifications?id=eq.${id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ is_read: true })
  })
}

// ─── Utility ────────────────────────────────────────────────────────────────
const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / 86400000)
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const formatCurrency = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

const generateOptOutId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let id = 'LW'
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

// ─── CSV Export ─────────────────────────────────────────────────────────────
const exportCSV = (orgs) => {
  const cols = ['company_name', 'pipeline_stage', 'contact_first_name', 'contact_last_name', 'contact_email', 'contact_phone', 'employee_count', 'city', 'state', 'created_at']
  const header = cols.join(',')
  const rows = orgs.map(o => cols.map(c => `"${(o[c] ?? '').toString().replace(/"/g, '""')}"`).join(','))
  const csv = [header, ...rows].join('\n')
  downloadBlob(csv, `lw360-organizations-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv')
}

const downloadBlob = (content, filename, type) => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── CSV Parsing ────────────────────────────────────────────────────────────
const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  const parseLine = (line) => {
    const result = []; let current = ''; let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = '' }
      else current += ch
    }
    result.push(current.trim())
    return result
  }
  const csvHeaders = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine).filter(r => r.some(c => c))
  return { headers: csvHeaders, rows }
}

// ─── Test Data Badge ────────────────────────────────────────────────────────
function TestBadge() {
  return (
    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 700, marginLeft: 6, verticalAlign: 'middle' }}>
      TEST DATA
    </span>
  )
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
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedOrg, setSelectedOrg] = useState(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [dragOrgId, setDragOrgId] = useState(null)
  const [showNotifications, setShowNotifications] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      const [orgData, brokerData, commData, campData, notifData] = await Promise.all([
        fetchOrgs(), fetchBrokers(), fetchCommissions(), fetchCampaigns(), fetchNotifications()
      ])
      setOrgs(orgData || []); setBrokers(brokerData || [])
      setCommissions(commData || []); setCampaigns(campData || [])
      setNotifications(notifData || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleStageChange = async (orgId, newStage) => {
    try {
      await updateOrgStage(orgId, newStage)
      setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, pipeline_stage: newStage, stage_changed_at: new Date().toISOString() } : o))
      if (selectedOrg?.id === orgId) setSelectedOrg(prev => ({ ...prev, pipeline_stage: newStage, stage_changed_at: new Date().toISOString() }))
      await createAuditEntry({ action: `Pipeline stage changed to "${newStage}"`, action_category: 'pipeline', organization_id: orgId, details: { new_stage: newStage } })
    } catch (e) { alert('Failed to update stage: ' + e.message) }
  }

  // Stats
  const totalOrgs = orgs.length
  const stageCounts = STAGES.reduce((acc, s) => { acc[s] = orgs.filter(o => o.pipeline_stage === s).length; return acc }, {})
  const thisMonth = orgs.filter(o => {
    if (!o.created_at) return false
    const d = new Date(o.created_at), now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const activeEnrollments = orgs.filter(o => ['Enrolling', 'Active'].includes(o.pipeline_stage)).length
  const unreadNotifCount = notifications.filter(n => !n.is_read).length

  const filteredOrgs = orgs.filter(o => {
    const matchSearch = !search || (o.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.contact_email || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.contact_first_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.contact_last_name || '').toLowerCase().includes(search.toLowerCase())
    const matchStage = !stageFilter || o.pipeline_stage === stageFilter
    return matchSearch && matchStage
  })

  const handleMarkNotifRead = async (id) => {
    await markNotificationRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

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
            {['pipeline', 'organizations', 'enrollment', 'brokers', 'reports'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
                background: tab === t ? 'rgba(122,193,67,0.2)' : 'transparent',
                color: tab === t ? '#7AC143' : 'rgba(255,255,255,0.7)',
              }}>{t}</button>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Live Mode Toggle (DISABLED) */}
          <div style={{ position: 'relative', display: 'inline-block' }} title="Live sending will be enabled after system verification">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.4, cursor: 'not-allowed' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Live Mode</span>
              <div style={{ width: 36, height: 20, borderRadius: 10, background: '#475569', position: 'relative' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#94a3b8', position: 'absolute', top: 2, left: 2 }} />
              </div>
            </div>
          </div>

          {/* Notification Bell */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowNotifications(!showNotifications)}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 16, position: 'relative' }}>
              {'\u{1F514}'}
              {unreadNotifCount > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {unreadNotifCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <NotificationDropdown notifications={notifications} onMarkRead={handleMarkNotifRead} onClose={() => setShowNotifications(false)} />
            )}
          </div>

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
            {tab === 'enrollment' && (
              <EnrollmentView orgs={orgs} campaigns={campaigns} onRefresh={loadData} />
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
              onUpdate={async (id, data) => { await updateOrg(id, data); await loadData() }}
              onRefresh={loadData} orgs={orgs} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Notification Dropdown ─────────────────────────────────────────────────
function NotificationDropdown({ notifications, onMarkRead, onClose }) {
  return (
    <div style={{ position: 'absolute', top: 40, right: 0, width: 360, maxHeight: 400, overflowY: 'auto', background: 'white', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 1000 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, color: '#1A395C', fontSize: 14 }}>Notifications</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>x</button>
      </div>
      {notifications.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No notifications</div>
      ) : notifications.map(n => (
        <div key={n.id} onClick={() => onMarkRead(n.id)}
          style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: n.is_read ? 'white' : '#f0f9ff' }}>
          <div style={{ fontSize: 13, color: '#1A395C', fontWeight: n.is_read ? 400 : 600 }}>{n.title || n.message}</div>
          {n.message && n.title && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{n.message}</div>}
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{formatDate(n.created_at)}</div>
        </div>
      ))}
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
    if (dragOrgId) { onStageChange(dragOrgId, stage); setDragOrgId(null) }
  }
  return (
    <div style={{ display: 'flex', gap: 8, padding: 16, overflowX: 'auto', minHeight: 'calc(100vh - 180px)' }}>
      {STAGES.map(stage => {
        const stageOrgs = orgs.filter(o => o.pipeline_stage === stage)
        return (
          <div key={stage} onDragOver={e => e.preventDefault()} onDrop={handleDrop(stage)}
            style={{ minWidth: 220, maxWidth: 260, flex: '0 0 220px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 12px', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: STAGE_COLORS[stage], color: 'white', fontSize: 12, fontWeight: 600 }}>
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
      style={{ background: 'white', borderRadius: 6, padding: 10, cursor: 'pointer', fontSize: 12, borderLeft: `3px solid ${statusColors[status]}`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', transition: 'box-shadow 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'}>
      <div style={{ fontWeight: 600, color: '#1A395C', marginBottom: 4, lineHeight: 1.3 }}>
        {org.company_name || 'Unnamed'}{org.is_test && <TestBadge />}
      </div>
      {(org.contact_first_name || org.contact_last_name) && (
        <div style={{ color: '#64748b', marginBottom: 2 }}>{org.contact_first_name} {org.contact_last_name}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: '#94a3b8', fontSize: 10 }}>
        {org.employee_count && <span>{org.employee_count} employees</span>}
        <span style={{ color: statusColors[status], fontWeight: 600 }}>{daysInStage}d</span>
      </div>
      {org.brokers?.name && <div style={{ marginTop: 4, fontSize: 10, color: '#29ABE2' }}>{org.brokers.name}</div>}
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
      {children} {sortField === field ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''}
    </th>
  )

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search organizations..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, flex: 1, minWidth: 200, outline: 'none' }} />
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, background: 'white' }}>
          <option value="">All Stages</option>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => exportCSV(allOrgs)} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1A395C', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Export CSV</button>
      </div>

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
                  {org.company_name || '—'}{org.is_test && <TestBadge />}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 600, background: `${STAGE_COLORS[org.pipeline_stage] || '#94a3b8'}18`, color: STAGE_COLORS[org.pipeline_stage] || '#94a3b8' }}>{org.pipeline_stage || '—'}</span>
                </td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>{org.brokers?.name || '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>{org.employee_count || '—'}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>
                  {org.contact_first_name || org.contact_last_name ? `${org.contact_first_name || ''} ${org.contact_last_name || ''}`.trim() : '—'}
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
        {sorted.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>No organizations found</div>}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>Showing {sorted.length} of {allOrgs.length} organizations</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAIL SIDEBAR (Enhanced)
// ═══════════════════════════════════════════════════════════════════════════
function DetailSidebar({ org, brokers, campaigns, onClose, onStageChange, onUpdate, onRefresh, orgs }) {
  const [notes, setNotes] = useState(org.notes || '')
  const [auditLog, setAuditLog] = useState([])
  const [saving, setSaving] = useState(false)
  const [showCensusModal, setShowCensusModal] = useState(false)
  const [showEligibilityModal, setShowEligibilityModal] = useState(false)
  const [showEmployeeList, setShowEmployeeList] = useState(false)
  const [showCampaignCreator, setShowCampaignCreator] = useState(false)

  useEffect(() => {
    setNotes(org.notes || '')
    fetchAuditLog(org.id).then(setAuditLog)
  }, [org.id])

  const saveNotes = async () => {
    setSaving(true)
    try { await onUpdate(org.id, { notes }) } catch (e) { alert('Failed to save: ' + e.message) }
    setSaving(false)
  }

  const orgCampaigns = campaigns.filter(c => c.organization_id === org.id)
  const currentStageIdx = STAGES.indexOf(org.pipeline_stage)

  return (
    <div style={{ width: 420, borderLeft: '1px solid #e2e8f0', background: 'white', height: 'calc(100vh - 130px)', overflowY: 'auto', flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1A395C' }}>{org.company_name || 'Unnamed'}{org.is_test && <TestBadge />}</div>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 600, background: `${STAGE_COLORS[org.pipeline_stage] || '#94a3b8'}18`, color: STAGE_COLORS[org.pipeline_stage] || '#94a3b8' }}>
            {org.pipeline_stage || 'No Stage'}
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>x</button>
      </div>

      <div style={{ padding: 20 }}>
        {/* Action Buttons */}
        <Section title="Actions">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <ActionBtn label="Upload Census" color="#29ABE2" onClick={() => setShowCensusModal(true)} />
            <ActionBtn label="Run Eligibility" color="#7AC143" onClick={() => setShowEligibilityModal(true)} />
            <ActionBtn label="Create Campaign" color="#a78bfa" onClick={() => setShowCampaignCreator(true)} />
            <ActionBtn label="Employee List" color="#1A395C" onClick={() => setShowEmployeeList(true)} />
          </div>
        </Section>

        {/* Stage Progress */}
        <Section title="Pipeline Progress">
          <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
            {STAGES.map((s, i) => (
              <div key={s} title={s} style={{ flex: 1, height: 6, borderRadius: 3, background: i <= currentStageIdx ? STAGE_COLORS[s] : '#e2e8f0' }} />
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
          <Field label="School District" value={org.is_school_district ? 'Yes' : 'No'} />
          <Field label="TRS District" value={org.is_trs_district ? 'Yes' : 'No'} />
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
                <div style={{ color: '#64748b', marginTop: 2 }}>Status: <span style={{ color: CAMPAIGN_STATUS_COLORS[c.status] || '#94a3b8', fontWeight: 600 }}>{c.status || '—'}</span></div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>{formatDate(c.start_date)} - {formatDate(c.end_date)}</div>
              </div>
            ))}
          </Section>
        )}

        {/* Notes */}
        <Section title="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
            placeholder="Add notes about this organization..."
            style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
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

      {/* Modals */}
      {showCensusModal && <CensusUploadModal org={org} onClose={() => { setShowCensusModal(false); onRefresh() }} />}
      {showEligibilityModal && <EligibilityModal org={org} onClose={() => { setShowEligibilityModal(false); onRefresh() }} />}
      {showEmployeeList && <EmployeeListModal org={org} onClose={() => setShowEmployeeList(false)} />}
      {showCampaignCreator && <CampaignCreatorModal org={org} orgs={orgs} onClose={() => { setShowCampaignCreator(false); onRefresh() }} />}
    </div>
  )
}

function ActionBtn({ label, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 6, border: `1px solid ${color}`,
      background: `${color}12`, color, fontSize: 12, fontWeight: 600, cursor: 'pointer'
    }}>{label}</button>
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
// MODAL WRAPPER
// ═══════════════════════════════════════════════════════════════════════════
function Modal({ title, onClose, width, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 12, width: width || 700, maxWidth: '95vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1A395C' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>x</button>
        </div>
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CENSUS UPLOAD MODAL
// ═══════════════════════════════════════════════════════════════════════════
function CensusUploadModal({ org, onClose }) {
  const [step, setStep] = useState('upload') // upload | mapping | importing | done
  const [csvData, setCsvData] = useState(null)
  const [columnMapping, setColumnMapping] = useState({})
  const [warnings, setWarnings] = useState([])
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)

  const handleFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const parsed = parseCSV(text)
      parsed.fileName = file.name
      parsed.fileSize = file.size
      setCsvData(parsed)
      // Auto-detect columns
      const autoMap = {}
      parsed.headers.forEach((h, i) => {
        const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '')
        if (lower.includes('firstname') || lower === 'first') autoMap[i] = 'first_name'
        else if (lower.includes('lastname') || lower === 'last') autoMap[i] = 'last_name'
        else if (lower.includes('email') || lower.includes('emailaddress')) autoMap[i] = 'email'
        else if (lower.includes('salary') || lower.includes('annualsalary') || lower.includes('annualpay')) autoMap[i] = 'annual_salary'
        else if (lower.includes('hourlyrate') || lower.includes('hourly')) autoMap[i] = 'hourly_rate'
        else if (lower.includes('hoursperweek') || lower.includes('hours')) autoMap[i] = 'hours_per_week'
        else if (lower.includes('filingstatus') || lower.includes('filing')) autoMap[i] = 'filing_status'
        else if (lower.includes('jobtitle') || lower.includes('title') || lower.includes('position')) autoMap[i] = 'job_title'
        else if (lower.includes('department') || lower.includes('dept')) autoMap[i] = 'department'
        else if (lower.includes('hiredate') || lower.includes('dateofhire')) autoMap[i] = 'hire_date'
        else if (lower.includes('paytype')) autoMap[i] = 'pay_type'
        else if (lower.includes('payfrequency') || lower.includes('payfreq')) autoMap[i] = 'pay_frequency'
        else if (lower.includes('401k') || lower.includes('retirement')) autoMap[i] = 'current_401k_per_period'
        else if (lower.includes('healthinsurance') || lower.includes('healthins') || lower.includes('medical')) autoMap[i] = 'current_health_insurance_per_period'
        else if (lower.includes('hsa')) autoMap[i] = 'current_hsa_per_period'
        else if (lower.includes('otherpretax') || lower.includes('pretax')) autoMap[i] = 'current_other_pretax_per_period'
      })
      setColumnMapping(autoMap)
      setStep('mapping')
    }
    reader.readAsText(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.CSV'))) handleFile(file)
    else alert('Please upload a CSV file')
  }

  const runImport = async () => {
    if (!csvData) return
    setStep('importing')
    const w = []
    const emails = new Set()
    const employees = []

    for (let ri = 0; ri < csvData.rows.length; ri++) {
      const row = csvData.rows[ri]
      const emp = { organization_id: org.id }
      Object.entries(columnMapping).forEach(([colIdx, field]) => {
        if (field && row[colIdx] !== undefined) {
          let val = row[colIdx]
          if (['annual_salary', 'hourly_rate', 'hours_per_week', 'current_401k_per_period', 'current_health_insurance_per_period', 'current_hsa_per_period', 'current_other_pretax_per_period'].includes(field)) {
            val = parseFloat(val.replace(/[$,]/g, '')) || 0
          }
          emp[field] = val
        }
      })
      // Validations
      if (!emp.email) w.push(`Row ${ri + 2}: Missing email`)
      else if (emails.has(emp.email.toLowerCase())) w.push(`Row ${ri + 2}: Duplicate email "${emp.email}"`)
      else emails.add((emp.email || '').toLowerCase())
      employees.push(emp)
    }
    setWarnings(w)

    // Batch insert
    const batchSize = 50
    let imported = 0
    for (let i = 0; i < employees.length; i += batchSize) {
      const batch = employees.slice(i, i + batchSize)
      const res = await fetch(`${SUPABASE_URL}/rest/v1/employees`, {
        method: 'POST', headers, body: JSON.stringify(batch)
      })
      if (!res.ok) {
        const err = await res.text()
        w.push(`Batch error at row ${i + 2}: ${err}`)
      }
      imported += batch.length
      setImportProgress({ current: imported, total: employees.length })
    }

    // Create census_uploads record (Bug #13)
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/census_uploads`, {
        method: 'POST', headers,
        body: JSON.stringify({
          organization_id: org.id,
          file_name: csvData?.fileName || 'census-upload.csv',
          file_size_bytes: csvData?.fileSize || null,
          status: 'Processed',
          employee_count_total: employees.length,
          column_mapping: columnMapping,
          processed_at: new Date().toISOString()
        })
      })
    } catch (e) { console.error('Census upload record error:', e) }

    // Update org stage
    await updateOrgStage(org.id, 'Census Received').catch(() => {})
    await createAuditEntry({
      action: `Census uploaded: ${employees.length} employees imported`,
      action_category: 'census',
      organization_id: org.id,
      details: { employee_count: employees.length, warnings: w.length }
    })

    setImportResult({ total: employees.length, warnings: w })
    setStep('done')
  }

  return (
    <Modal title={`Upload Census — ${org.company_name}`} onClose={onClose} width={800}>
      {step === 'upload' && (
        <div>
          <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{ border: '2px dashed #29ABE2', borderRadius: 12, padding: 60, textAlign: 'center', cursor: 'pointer', background: '#f0f9ff' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{'\u{1F4C4}'}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1A395C', marginBottom: 4 }}>Drop CSV file here or click to browse</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Accepts .csv files</div>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,.CSV" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />
        </div>
      )}

      {step === 'mapping' && csvData && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A395C', marginBottom: 12 }}>
            Detected {csvData.headers.length} columns, {csvData.rows.length} rows
          </div>

          {/* Preview first 5 rows */}
          <div style={{ overflowX: 'auto', marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {csvData.headers.map((h, i) => (
                    <th key={i} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvData.rows.slice(0, 5).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Column Mapping */}
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A395C', marginBottom: 12 }}>Column Mapping</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {csvData.headers.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#64748b', minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h}</span>
                <select value={columnMapping[i] || ''} onChange={e => setColumnMapping(prev => ({ ...prev, [i]: e.target.value }))}
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 12 }}>
                  <option value="">-- Skip --</option>
                  {EMPLOYEE_FIELDS.map(f => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            ))}
          </div>

          <button onClick={runImport} style={{ marginTop: 20, padding: '10px 24px', borderRadius: 6, border: 'none', background: '#7AC143', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Import {csvData.rows.length} Employees
          </button>
        </div>
      )}

      {step === 'importing' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1A395C', marginBottom: 16 }}>Importing employees...</div>
          <ProgressBar current={importProgress.current} total={importProgress.total} />
          <div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>{importProgress.current} of {importProgress.total}</div>
        </div>
      )}

      {step === 'done' && importResult && (
        <div>
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{'\u2705'}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1A395C' }}>Import Complete</div>
            <div style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>{importResult.total} employees imported</div>
          </div>
          {importResult.warnings.length > 0 && (
            <div style={{ marginTop: 16, padding: 16, background: '#fef3c7', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>Warnings ({importResult.warnings.length})</div>
              {importResult.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 12, color: '#92400e', padding: '2px 0' }}>{w}</div>
              ))}
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 6, border: 'none', background: '#1A395C', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ELIGIBILITY MODAL
// ═══════════════════════════════════════════════════════════════════════════
function EligibilityModal({ org, onClose }) {
  const [step, setStep] = useState('running') // running | results
  const [employees, setEmployees] = useState([])
  const [results, setResults] = useState([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [sortField, setSortField] = useState('last_name')
  const [sortDir, setSortDir] = useState('asc')

  useEffect(() => {
    runEligibility()
  }, [])

  const runEligibility = async () => {
    const emps = await fetchEmployees(org.id)
    setEmployees(emps)
    setProgress({ current: 0, total: emps.length })
    const orgSettings = {
      is_school_district: org.is_school_district || false,
      is_trs_district: org.is_trs_district || false,
    }
    const calculated = []
    for (let i = 0; i < emps.length; i++) {
      const emp = emps[i]
      const result = calculateEligibility({
        annual_salary: emp.annual_salary,
        hourly_rate: emp.hourly_rate,
        hours_per_week: emp.hours_per_week,
        filing_status: emp.filing_status || 'Single',
        pay_frequency: emp.pay_frequency || org.pay_frequency || 'Semi-Monthly',
        current_401k_per_period: emp.current_401k_per_period,
        current_health_insurance_per_period: emp.current_health_insurance_per_period,
        current_hsa_per_period: emp.current_hsa_per_period,
        current_other_pretax_per_period: emp.current_other_pretax_per_period,
      }, orgSettings)
      calculated.push({ ...emp, eligibility: result })
      setProgress({ current: i + 1, total: emps.length })

      // Update employee record in Supabase with ALL eligibility fields
      const ppy = result.periods_per_year
      const isTrs = orgSettings.is_trs_district
      const currentSsAnnual = (!isTrs && result.annual_gross <= 176100) ? Math.min(result.annual_gross, 176100) * 0.062 : 0
      const newSsAnnual = currentSsAnnual - result.ss_savings_annual
      const currentMedicareAnnual = result.annual_gross * 0.0145
      const newMedicareAnnual = currentMedicareAnnual - result.medicare_savings_annual
      const grossPerPeriod = result.annual_gross / ppy
      const currentPretaxPP = Number(emp.current_401k_per_period || 0) + Number(emp.current_health_insurance_per_period || 0) + Number(emp.current_hsa_per_period || 0) + Number(emp.current_other_pretax_per_period || 0)
      const currentNetPP = grossPerPeriod - currentPretaxPP - (result.fit_before_annual / ppy) - (currentSsAnnual / ppy) - (currentMedicareAnnual / ppy)
      const newNetPP = grossPerPeriod - currentPretaxPP - result.lw_premium_per_period - (result.fit_after_annual / ppy) - (newSsAnnual / ppy) - (newMedicareAnnual / ppy) + result.lw_reimbursement_per_period - result.fee_per_period
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/employees?id=eq.${emp.id}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({
            is_eligible: result.is_eligible,
            ineligible_reason: result.ineligible_reason,
            eligibility_calculated_at: new Date().toISOString(),
            gross_pay_per_period: Math.round(grossPerPeriod * 100) / 100,
            taxable_income_per_period: Math.round((result.taxable_income_before / ppy) * 100) / 100,
            new_taxable_income_per_period: Math.round((result.taxable_income_after / ppy) * 100) / 100,
            current_fit_per_period: Math.round((result.fit_before_annual / ppy) * 100) / 100,
            current_fit_rate: Math.round(result.effective_fit_rate * 10000) / 10000,
            new_fit_per_period: Math.round((result.fit_after_annual / ppy) * 100) / 100,
            current_ss_per_period: Math.round((currentSsAnnual / ppy) * 100) / 100,
            new_ss_per_period: Math.round((newSsAnnual / ppy) * 100) / 100,
            current_medicare_per_period: Math.round((currentMedicareAnnual / ppy) * 100) / 100,
            new_medicare_per_period: Math.round((newMedicareAnnual / ppy) * 100) / 100,
            fit_savings_per_period: Math.round(result.fit_savings_per_period * 100) / 100,
            ss_savings_per_period: Math.round(result.ss_savings_per_period * 100) / 100,
            medicare_savings_per_period: Math.round(result.medicare_savings_per_period * 100) / 100,
            total_tax_savings_per_period: Math.round(result.total_tax_savings_per_period * 100) / 100,
            lw_premium_per_period: Math.round(result.lw_premium_per_period * 100) / 100,
            lw_fee_per_period: Math.round(result.fee_per_period * 100) / 100,
            lw_reimbursement_per_period: Math.round(result.lw_reimbursement_per_period * 100) / 100,
            net_benefit_per_period: Math.round(result.net_benefit_per_period * 100) / 100,
            net_benefit_monthly: Math.round(result.net_benefit_monthly * 100) / 100,
            net_benefit_annual: Math.round(result.net_benefit_annual * 100) / 100,
            current_net_per_period: Math.round(currentNetPP * 100) / 100,
            new_net_per_period: Math.round(newNetPP * 100) / 100,
          })
        })
      } catch (e) { console.error('Eligibility save error:', e) }
    }
    setResults(calculated)
    setStep('results')

    // Update org stage
    await updateOrgStage(org.id, 'Analysis Ready').catch(() => {})
    await createAuditEntry({
      action: `Eligibility analysis completed: ${calculated.filter(c => c.eligibility.is_eligible).length} eligible of ${calculated.length}`,
      action_category: 'eligibility',
      organization_id: org.id,
      details: {
        total: calculated.length,
        eligible: calculated.filter(c => c.eligibility.is_eligible).length,
        ineligible: calculated.filter(c => !c.eligibility.is_eligible).length,
        straddle_zone: calculated.filter(c => c.eligibility.in_straddle_zone).length,
      }
    })
  }

  const eligible = results.filter(r => r.eligibility.is_eligible)
  const ineligible = results.filter(r => !r.eligibility.is_eligible)
  const inStraddleZone = results.filter(r => r.eligibility.in_straddle_zone)

  const sortedResults = [...results].sort((a, b) => {
    let va, vb
    if (sortField === 'last_name') { va = a.last_name || ''; vb = b.last_name || '' }
    else if (sortField === 'gross') { va = a.eligibility.annual_gross; vb = b.eligibility.annual_gross }
    else if (sortField === 'net_benefit') { va = a.eligibility.net_benefit_monthly; vb = b.eligibility.net_benefit_monthly }
    else if (sortField === 'fit_savings') { va = a.eligibility.fit_savings_monthly; vb = b.eligibility.fit_savings_monthly }
    else { va = a[sortField] || ''; vb = b[sortField] || '' }
    if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase() }
    return sortDir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0)
  })

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const exportResults = () => {
    const cols = ['Name', 'Gross Annual', 'Filing Status', 'Taxable Before', 'Taxable After', 'FIT Before', 'FIT After', 'FIT Savings/mo', 'FICA Savings/mo', 'Fee/mo', 'Net Benefit/mo', 'Eligible', 'Straddle Zone']
    const rows = results.map(r => [
      `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      r.eligibility.annual_gross,
      r.eligibility.filing_status,
      r.eligibility.taxable_income_before.toFixed(2),
      r.eligibility.taxable_income_after.toFixed(2),
      r.eligibility.fit_before_annual.toFixed(2),
      r.eligibility.fit_after_annual.toFixed(2),
      r.eligibility.fit_savings_monthly.toFixed(2),
      ((r.eligibility.ss_savings_annual + r.eligibility.medicare_savings_annual) / 12).toFixed(2),
      r.eligibility.fee_monthly.toFixed(2),
      r.eligibility.net_benefit_monthly.toFixed(2),
      r.eligibility.is_eligible ? 'Yes' : 'No',
      r.eligibility.in_straddle_zone ? 'Yes' : 'No',
    ])
    const csv = [cols.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    downloadBlob(csv, `eligibility-${org.company_name}-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv')
  }

  const approveAnalysis = async () => {
    await createAuditEntry({
      action: 'Eligibility analysis approved',
      action_category: 'eligibility',
      organization_id: org.id,
      details: { eligible: eligible.length, total: results.length }
    })
    await createNotification({
      recipient_id: '8fba22c5-1d5b-4549-8465-1f3627d616ea',
      recipient_type: 'internal',
      notification_type: 'analysis_approved',
      title: `Analysis approved for ${org.company_name}`,
      message: `${eligible.length} eligible employees ready for enrollment`,
      organization_id: org.id,
    })
    alert('Analysis approved. Results are now available for campaigns.')
  }

  return (
    <Modal title={`Eligibility Analysis — ${org.company_name}`} onClose={onClose} width={1100}>
      {step === 'running' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1A395C', marginBottom: 16 }}>Running eligibility calculations...</div>
          <ProgressBar current={progress.current} total={progress.total} />
          <div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>{progress.current} of {progress.total} employees</div>
        </div>
      )}

      {step === 'results' && (
        <div>
          {/* Summary */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: 16, background: '#f0fdf4', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{eligible.length}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Eligible</div>
            </div>
            <div style={{ flex: 1, padding: 16, background: '#fef2f2', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#dc2626' }}>{ineligible.length}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Ineligible</div>
            </div>
            <div style={{ flex: 1, padding: 16, background: '#fef3c7', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#d97706' }}>{inStraddleZone.length}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Straddle Zone</div>
            </div>
            <div style={{ flex: 1, padding: 16, background: '#f0f9ff', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#29ABE2' }}>{results.length}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Total</div>
            </div>
          </div>

          {/* Ineligible reasons */}
          {ineligible.length > 0 && (
            <div style={{ marginBottom: 16, padding: 12, background: '#fef2f2', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 4 }}>Ineligible Reasons:</div>
              {[...new Set(ineligible.map(r => r.eligibility.ineligible_reason))].filter(Boolean).map((reason, i) => (
                <div key={i} style={{ fontSize: 12, color: '#7f1d1d' }}>- {reason} ({ineligible.filter(r => r.eligibility.ineligible_reason === reason).length} employees)</div>
              ))}
            </div>
          )}

          {/* Results Table */}
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {[
                    { k: 'last_name', l: 'Name' }, { k: 'gross', l: 'Gross' }, { k: 'filing_status', l: 'Filing' },
                    { k: '', l: 'Tax Before' }, { k: '', l: 'Tax After' }, { k: 'fit_savings', l: 'FIT Sav/mo' },
                    { k: '', l: 'FICA Sav/mo' }, { k: '', l: 'Fee/mo' }, { k: 'net_benefit', l: 'Net Benefit/mo' },
                    { k: '', l: 'Flag' }
                  ].map((col, i) => (
                    <th key={i} onClick={col.k ? () => toggleSort(col.k) : undefined}
                      style={{ padding: '8px 6px', textAlign: col.k ? 'left' : 'right', fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', cursor: col.k ? 'pointer' : 'default', whiteSpace: 'nowrap', fontSize: 10 }}>
                      {col.l}{col.k && sortField === col.k ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.map(r => {
                  const e = r.eligibility
                  const ficaSavMo = (e.ss_savings_annual + e.medicare_savings_annual) / 12
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', background: !e.is_eligible ? '#fef2f2' : e.in_straddle_zone ? '#fef3c7' : 'white' }}>
                      <td style={{ padding: '6px', fontWeight: 500, color: '#1A395C' }}>
                        {r.first_name} {r.last_name}{r.is_test && <TestBadge />}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(e.annual_gross)}</td>
                      <td style={{ padding: '6px' }}>{e.filing_status}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(e.taxable_income_before)}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{formatCurrency(e.taxable_income_after)}</td>
                      <td style={{ padding: '6px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{formatCurrency(e.fit_savings_monthly)}</td>
                      <td style={{ padding: '6px', textAlign: 'right', color: '#16a34a' }}>{formatCurrency(ficaSavMo)}</td>
                      <td style={{ padding: '6px', textAlign: 'right', color: '#dc2626' }}>{formatCurrency(e.fee_monthly)}</td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, color: e.net_benefit_monthly > 0 ? '#16a34a' : '#dc2626' }}>{formatCurrency(e.net_benefit_monthly)}</td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        {e.in_straddle_zone && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>STRADDLE</span>}
                        {!e.is_eligible && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontWeight: 600 }}>{e.ineligible_reason || 'INELIGIBLE'}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={exportResults} style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#1A395C', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Export to CSV</button>
            <button onClick={approveAnalysis} style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#7AC143', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Approve Analysis</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEE LIST MODAL
// ═══════════════════════════════════════════════════════════════════════════
function EmployeeListModal({ org, onClose }) {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState('last_name')
  const [sortDir, setSortDir] = useState('asc')
  const [filter, setFilter] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})

  useEffect(() => {
    fetchEmployees(org.id).then(emps => { setEmployees(emps); setLoading(false) })
  }, [org.id])

  const filtered = employees.filter(e => {
    if (!filter) return true
    const s = filter.toLowerCase()
    return (e.first_name || '').toLowerCase().includes(s) || (e.last_name || '').toLowerCase().includes(s) || (e.email || '').toLowerCase().includes(s)
  })

  const sorted = [...filtered].sort((a, b) => {
    let va = a[sortField] || '', vb = b[sortField] || ''
    if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase() }
    return sortDir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0)
  })

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const startEdit = (emp) => {
    setEditingId(emp.id)
    setEditData({ first_name: emp.first_name || '', last_name: emp.last_name || '', email: emp.email || '', annual_salary: emp.annual_salary || '', filing_status: emp.filing_status || 'Single' })
  }

  const saveEdit = async () => {
    const data = { ...editData }
    if (data.annual_salary) data.annual_salary = parseFloat(data.annual_salary)
    await fetch(`${SUPABASE_URL}/rest/v1/employees?id=eq.${editingId}`, { method: 'PATCH', headers, body: JSON.stringify(data) })
    setEmployees(prev => prev.map(e => e.id === editingId ? { ...e, ...data } : e))
    setEditingId(null)
  }

  return (
    <Modal title={`Employees — ${org.company_name}`} onClose={onClose} width={900}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading employees...</div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <input type="text" placeholder="Filter employees..." value={filter} onChange={e => setFilter(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, flex: 1 }} />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} of {employees.length}</span>
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['last_name', 'email', 'annual_salary', 'is_eligible', 'net_benefit_monthly', 'enrollment_status'].map(f => (
                    <th key={f} onClick={() => toggleSort(f)} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}{sortField === f ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''}
                    </th>
                  ))}
                  <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(emp => (
                  <tr key={emp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {editingId === emp.id ? (
                      <>
                        <td style={{ padding: '4px 6px' }}>
                          <input value={editData.first_name} onChange={e => setEditData(d => ({ ...d, first_name: e.target.value }))} style={{ width: 60, fontSize: 11, padding: 2, border: '1px solid #e2e8f0', borderRadius: 3 }} />
                          <input value={editData.last_name} onChange={e => setEditData(d => ({ ...d, last_name: e.target.value }))} style={{ width: 60, fontSize: 11, padding: 2, border: '1px solid #e2e8f0', borderRadius: 3, marginLeft: 4 }} />
                        </td>
                        <td style={{ padding: '4px 6px' }}><input value={editData.email} onChange={e => setEditData(d => ({ ...d, email: e.target.value }))} style={{ width: 140, fontSize: 11, padding: 2, border: '1px solid #e2e8f0', borderRadius: 3 }} /></td>
                        <td style={{ padding: '4px 6px' }}><input value={editData.annual_salary} onChange={e => setEditData(d => ({ ...d, annual_salary: e.target.value }))} style={{ width: 80, fontSize: 11, padding: 2, border: '1px solid #e2e8f0', borderRadius: 3 }} /></td>
                        <td colSpan={3} />
                        <td style={{ padding: '4px 6px' }}>
                          <button onClick={saveEdit} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, border: 'none', background: '#7AC143', color: 'white', cursor: 'pointer', marginRight: 4 }}>Save</button>
                          <button onClick={() => setEditingId(null)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '8px 10px', fontWeight: 500, color: '#1A395C' }}>
                          {emp.first_name} {emp.last_name}{emp.is_test && <TestBadge />}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#29ABE2' }}>{emp.email || '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{emp.annual_salary ? formatCurrency(emp.annual_salary) : '—'}</td>
                        <td style={{ padding: '8px 10px' }}>
                          {emp.is_eligible === true && <span style={{ color: '#16a34a', fontWeight: 600 }}>Yes</span>}
                          {emp.is_eligible === false && <span style={{ color: '#dc2626', fontWeight: 600 }}>No</span>}
                          {emp.is_eligible == null && <span style={{ color: '#94a3b8' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: (emp.net_benefit_monthly || 0) > 0 ? '#16a34a' : '#64748b' }}>
                          {emp.net_benefit_monthly != null ? formatCurrency(emp.net_benefit_monthly) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: emp.enrollment_status === 'Enrolled' ? '#7AC14318' : emp.enrollment_status === 'Email Sent' ? '#29ABE218' : '#94a3b818', color: emp.enrollment_status === 'Enrolled' ? '#7AC143' : emp.enrollment_status === 'Email Sent' ? '#29ABE2' : '#94a3b8' }}>
                            {emp.enrollment_status || 'None'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <button onClick={() => startEdit(emp)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#64748b' }}>Edit</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No employees found</div>}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESS BAR
// ═══════════════════════════════════════════════════════════════════════════
function ProgressBar({ current, total, color }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div style={{ width: '100%', height: 20, background: '#e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color || '#29ABE2', borderRadius: 10, transition: 'width 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {pct > 15 && <span style={{ fontSize: 10, fontWeight: 700, color: 'white' }}>{pct}%</span>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ENROLLMENT VIEW (Tab)
// ═══════════════════════════════════════════════════════════════════════════
function EnrollmentView({ orgs, campaigns, onRefresh }) {
  const [subView, setSubView] = useState('campaigns') // campaigns | create
  const [selectedCampaign, setSelectedCampaign] = useState(null)

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1A395C' }}>Enrollment</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ k: 'campaigns', l: 'Campaigns' }, { k: 'create', l: 'Create Campaign' }].map(sv => (
            <button key={sv.k} onClick={() => { setSubView(sv.k); setSelectedCampaign(null) }}
              style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: subView === sv.k ? '#1A395C' : '#e2e8f0', color: subView === sv.k ? 'white' : '#64748b' }}>
              {sv.l}
            </button>
          ))}
        </div>
      </div>

      {subView === 'campaigns' && !selectedCampaign && (
        <CampaignsList campaigns={campaigns} onSelect={setSelectedCampaign} />
      )}
      {subView === 'campaigns' && selectedCampaign && (
        <CampaignDetail campaign={selectedCampaign} orgs={orgs} onBack={() => setSelectedCampaign(null)} onRefresh={onRefresh} />
      )}
      {subView === 'create' && (
        <CampaignCreatorModal org={null} orgs={orgs} onClose={() => { setSubView('campaigns'); onRefresh() }} inline />
      )}
    </div>
  )
}

function CampaignsList({ campaigns, onSelect }) {
  if (campaigns.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>No enrollment campaigns yet. Create one to get started.</div>
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {campaigns.map(c => (
        <div key={c.id} onClick={() => onSelect(c)} style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `4px solid ${CAMPAIGN_STATUS_COLORS[c.status] || '#94a3b8'}` }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1A395C' }}>{c.campaign_name || 'Unnamed Campaign'}{c.is_test && <TestBadge />}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{c.organizations?.company_name || '—'}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{formatDate(c.start_date)} - {formatDate(c.end_date)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 12, fontWeight: 600, background: `${CAMPAIGN_STATUS_COLORS[c.status] || '#94a3b8'}18`, color: CAMPAIGN_STATUS_COLORS[c.status] || '#94a3b8' }}>
              {c.status || 'Draft'}
            </span>
            {c.total_emails_sent != null && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{c.total_emails_sent} emails sent</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CAMPAIGN DETAIL (Management / Finalization)
// ═══════════════════════════════════════════════════════════════════════════
function CampaignDetail({ campaign: initialCampaign, orgs, onBack, onRefresh }) {
  const [campaign, setCampaign] = useState(initialCampaign)
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmText, setConfirmText] = useState('')
  const [showFinalize, setShowFinalize] = useState(false)

  const org = orgs.find(o => o.id === campaign.organization_id)

  useEffect(() => {
    fetchEmployees(campaign.organization_id).then(emps => { setEmployees(emps); setLoading(false) })
  }, [campaign.organization_id])

  // Check if campaign end date has passed
  const endDatePassed = campaign.end_date && new Date(campaign.end_date) < new Date()
  const isPendingFinalization = campaign.status === 'In Progress' && endDatePassed

  useEffect(() => {
    if (isPendingFinalization && campaign.status !== 'Pending Finalization') {
      // Auto-update to Pending Finalization
      fetch(`${SUPABASE_URL}/rest/v1/enrollment_campaigns?id=eq.${campaign.id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ status: 'Pending Finalization' })
      }).then(() => setCampaign(prev => ({ ...prev, status: 'Pending Finalization' })))
    }
  }, [isPendingFinalization])

  const enrolledEmps = employees.filter(e => e.enrollment_status === 'Enrolled')
  const optedOutEmps = employees.filter(e => e.enrollment_status === 'Opted Out')
  const emailSentEmps = employees.filter(e => e.enrollment_status === 'Email Sent')
  const neverViewedEmps = employees.filter(e => e.enrollment_status === 'Email Sent' && !e.enrollment_page_viewed_at)
  const viewedEmps = employees.filter(e => e.enrollment_page_viewed_at && e.enrollment_status !== 'Opted Out')
  const openedEmps = employees.filter(e => e.email_opened_at)
  const clickedEmps = employees.filter(e => e.email_clicked_at)
  const acknowledgedEmps = employees.filter(e => e.email_acknowledged_at)
  const totalSent = employees.filter(e => e.enrollment_email_sent_at).length
  const openRate = totalSent > 0 ? ((openedEmps.length / totalSent) * 100).toFixed(1) : '0.0'
  const clickRate = totalSent > 0 ? ((clickedEmps.length / totalSent) * 100).toFixed(1) : '0.0'

  const handleFinalize = async () => {
    if (confirmText !== 'CONFIRM ENROLLMENT') return
    // Set eligible, non-opted-out employees to Enrolled
    const toEnroll = employees.filter(e => e.is_eligible && e.enrollment_status !== 'Opted Out')
    for (const emp of toEnroll) {
      await fetch(`${SUPABASE_URL}/rest/v1/employees?id=eq.${emp.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ enrollment_status: 'Enrolled', enrolled_at: new Date().toISOString() })
      })
    }
    await fetch(`${SUPABASE_URL}/rest/v1/enrollment_campaigns?id=eq.${campaign.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ status: 'Completed', completed_at: new Date().toISOString() })
    })
    await createAuditEntry({
      action: `Enrollment finalized: ${toEnroll.length} employees enrolled`,
      action_category: 'enrollment',
      organization_id: campaign.organization_id,
      campaign_id: campaign.id,
      details: { enrolled: toEnroll.length, opted_out: optedOutEmps.length }
    })
    setCampaign(prev => ({ ...prev, status: 'Completed' }))
    setShowFinalize(false)
    setConfirmText('')
    onRefresh()
    alert(`Enrollment finalized. ${toEnroll.length} employees enrolled.`)
  }

  const generatePayrollPacket = () => {
    const freq = org?.pay_frequency || 'Semi-Monthly'
    const premPP = LW_PREM[freq] || LW_PREM['Semi-Monthly']
    const feePP = LW_EE_FEE[freq] || LW_EE_FEE['Semi-Monthly']
    const reimbPP = premPP

    const cols = ['Name', 'Employee ID', 'Effective Date', 'Pay Frequency', 'LW PREM/pp', 'LW EE FEE/pp', 'LW REIMB/pp', 'Net Benefit/mo']
    const rows = enrolledEmps.map(e => [
      `${e.first_name || ''} ${e.last_name || ''}`.trim(),
      e.employee_id || e.id,
      e.enrolled_at ? new Date(e.enrolled_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      freq,
      premPP.toFixed(2),
      feePP.toFixed(2),
      reimbPP.toFixed(2),
      (e.net_benefit_monthly || 0).toFixed(2)
    ])
    const csv = [cols.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n')
    downloadBlob(csv, `payroll-packet-${org?.company_name || 'org'}-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv')
  }

  const generateSummaryReport = () => {
    const totalSavings = enrolledEmps.reduce((s, e) => s + (e.net_benefit_monthly || 0), 0)
    const avgSavings = enrolledEmps.length > 0 ? totalSavings / enrolledEmps.length : 0
    const ficaSavingsTotal = enrolledEmps.reduce((s, e) => s + ((e.fica_savings_monthly || 0)), 0)
    const feeTotal = enrolledEmps.length * (LW_EE_FEE[org?.pay_frequency || 'Semi-Monthly'] || 44.87) * (org?.pay_frequency === 'Monthly' ? 1 : org?.pay_frequency === 'Semi-Monthly' ? 2 : org?.pay_frequency === 'Biweekly' ? 26/12 : 52/12)

    let report = `EMPLOYER ENROLLMENT SUMMARY REPORT\n`
    report += `Organization: ${org?.company_name || '—'}\n`
    report += `Report Date: ${new Date().toISOString().slice(0, 10)}\n\n`
    report += `ENROLLMENT SUMMARY\n`
    report += `Total Employees: ${employees.length}\n`
    report += `Eligible: ${employees.filter(e => e.is_eligible).length}\n`
    report += `Enrolled: ${enrolledEmps.length}\n`
    report += `Opted Out: ${optedOutEmps.length}\n`
    report += `Ineligible: ${employees.filter(e => e.is_eligible === false).length}\n\n`
    report += `SAVINGS ANALYSIS\n`
    report += `Average Monthly Savings: ${formatCurrency(avgSavings)}\n`
    report += `Total Monthly Savings: ${formatCurrency(totalSavings)}\n`
    report += `Range: ${formatCurrency(Math.min(...enrolledEmps.map(e => e.net_benefit_monthly || 0)))} - ${formatCurrency(Math.max(...enrolledEmps.map(e => e.net_benefit_monthly || 0)))}\n\n`
    report += `EMPLOYER IMPACT\n`
    report += `Monthly FICA Savings: ${formatCurrency(ficaSavingsTotal)}\n\n`
    report += `ENROLLED ROSTER\nName,Department,Enrollment Date,Monthly Benefit\n`
    enrolledEmps.forEach(e => {
      report += `"${e.first_name} ${e.last_name}","${e.department || ''}","${e.enrolled_at ? new Date(e.enrolled_at).toISOString().slice(0, 10) : ''}","${(e.net_benefit_monthly || 0).toFixed(2)}"\n`
    })
    report += `\nOPTED-OUT LIST\n`
    optedOutEmps.forEach(e => { report += `${e.first_name} ${e.last_name}\n` })

    downloadBlob(report, `summary-report-${org?.company_name || 'org'}-${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain')
  }

  return (
    <div>
      <button onClick={onBack} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        {'\u2190'} Back to Campaigns
      </button>

      <div style={{ background: 'white', borderRadius: 8, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1A395C' }}>{campaign.campaign_name || 'Unnamed Campaign'}</div>
            <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{org?.company_name || '—'}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>{formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}</div>
          </div>
          <span style={{ fontSize: 14, padding: '6px 16px', borderRadius: 12, fontWeight: 600, background: `${CAMPAIGN_STATUS_COLORS[campaign.status] || '#94a3b8'}18`, color: CAMPAIGN_STATUS_COLORS[campaign.status] || '#94a3b8' }}>
            {campaign.status || 'Draft'}
          </span>
        </div>

        {/* Enrollment Stats */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 80, padding: 12, background: '#f0f9ff', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#29ABE2' }}>{totalSent}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Sent</div>
          </div>
          <div style={{ flex: 1, minWidth: 80, padding: 12, background: '#eff6ff', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>{openedEmps.length}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Opened</div>
          </div>
          <div style={{ flex: 1, minWidth: 80, padding: 12, background: '#f0fdf4', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{clickedEmps.length}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Clicked</div>
          </div>
          <div style={{ flex: 1, minWidth: 80, padding: 12, background: '#f0fdf4', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#7AC143' }}>{acknowledgedEmps.length}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Acknowledged</div>
          </div>
          <div style={{ flex: 1, minWidth: 80, padding: 12, background: '#fef2f2', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#dc2626' }}>{optedOutEmps.length}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Opted Out</div>
          </div>
          <div style={{ flex: 1, minWidth: 80, padding: 12, background: '#fef3c7', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#d97706' }}>{neverViewedEmps.length}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Never Viewed</div>
          </div>
        </div>
        {/* Email Rates */}
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>{openRate}%</span>
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>Open Rate</span>
          </div>
          <div style={{ flex: 1, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>{clickRate}%</span>
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>Click Rate</span>
          </div>
          <div style={{ flex: 1, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#7AC143' }}>{enrolledEmps.length}</span>
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>Enrolled</span>
          </div>
        </div>
      </div>

      {/* Notification for pending finalization */}
      {(campaign.status === 'Pending Finalization' || isPendingFinalization) && (
        <div style={{ padding: 16, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, color: '#92400e', fontSize: 14 }}>Campaign ended — {viewedEmps.length} ready to enroll, {optedOutEmps.length} opted out, {neverViewedEmps.length} never viewed</div>
        </div>
      )}

      {/* Employee list color-coded */}
      {!loading && (
        <div style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A395C', marginBottom: 12 }}>Employee Status</div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {employees.map(emp => {
              let bg = 'white', border = '#e2e8f0'
              if (emp.enrollment_status === 'Opted Out') { bg = '#fef2f2'; border = '#fca5a5' }
              else if (emp.enrollment_status === 'Enrolled') { bg = '#f0fdf4'; border = '#86efac' }
              else if (emp.enrollment_page_viewed_at) { bg = '#f0fdf4'; border = '#86efac' }
              else if (emp.enrollment_status === 'Email Sent') { bg = '#fef3c7'; border = '#fcd34d' }
              return (
                <div key={emp.id} style={{ padding: '8px 12px', borderLeft: `3px solid ${border}`, background: bg, marginBottom: 4, borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                  <span style={{ color: '#1A395C', fontWeight: 500 }}>{emp.first_name} {emp.last_name}{emp.is_test && <TestBadge />}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {emp.email_acknowledged_at && <span title="Acknowledged" style={{ fontSize: 13 }}>✅</span>}
                    {!emp.email_acknowledged_at && emp.email_clicked_at && <span title="Clicked" style={{ fontSize: 13 }}>🖱️</span>}
                    {!emp.email_clicked_at && emp.email_opened_at && <span title="Opened" style={{ fontSize: 13 }}>👁️</span>}
                    {!emp.email_opened_at && emp.enrollment_email_sent_at && <span title="Sent" style={{ fontSize: 13 }}>✉️</span>}
                    {emp.enrollment_status === 'Opted Out' && <span title="Opted Out" style={{ fontSize: 13 }}>❌</span>}
                    <span style={{ fontSize: 11, color: '#64748b' }}>{emp.enrollment_status || 'Pending'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {(campaign.status === 'Pending Finalization') && (
          <button onClick={() => setShowFinalize(true)} style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#7AC143', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Finalize Enrollment
          </button>
        )}
        {campaign.status === 'Completed' && (
          <>
            <button onClick={generatePayrollPacket} style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#1A395C', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Download Payroll Packet
            </button>
            <button onClick={generateSummaryReport} style={{ padding: '10px 20px', borderRadius: 6, border: 'none', background: '#29ABE2', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Download Summary Report
            </button>
          </>
        )}
      </div>

      {/* Finalize Modal */}
      {showFinalize && (
        <Modal title="Finalize Enrollment" onClose={() => { setShowFinalize(false); setConfirmText('') }} width={500}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 14, color: '#1A395C', marginBottom: 8 }}>
              You are about to finalize enrollment for <strong>{org?.company_name}</strong>.
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {viewedEmps.length} employees will be marked as Enrolled. {optedOutEmps.length} opted out.
            </div>
          </div>
          <div style={{ padding: 12, background: '#fef3c7', borderRadius: 8, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>Type "CONFIRM ENROLLMENT" to proceed</div>
          </div>
          <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="CONFIRM ENROLLMENT"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 14, textAlign: 'center', boxSizing: 'border-box' }} />
          <button onClick={handleFinalize} disabled={confirmText !== 'CONFIRM ENROLLMENT'}
            style={{ width: '100%', marginTop: 12, padding: '12px', borderRadius: 6, border: 'none', background: confirmText === 'CONFIRM ENROLLMENT' ? '#7AC143' : '#e2e8f0', color: confirmText === 'CONFIRM ENROLLMENT' ? 'white' : '#94a3b8', fontSize: 14, fontWeight: 600, cursor: confirmText === 'CONFIRM ENROLLMENT' ? 'pointer' : 'not-allowed' }}>
            Finalize Enrollment
          </button>
        </Modal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CAMPAIGN CREATOR (5 Permission Gates)
// ═══════════════════════════════════════════════════════════════════════════
function CampaignCreatorModal({ org: preSelectedOrg, orgs, onClose, inline }) {
  const [gate, setGate] = useState(1)
  const [selectedOrgId, setSelectedOrgId] = useState(preSelectedOrg?.id || '')
  const [campaignId, setCampaignId] = useState(null)
  const [employees, setEmployees] = useState([])
  const [selectedEmps, setSelectedEmps] = useState(new Set())
  const [optOutIds, setOptOutIds] = useState({})
  const [previewIdx, setPreviewIdx] = useState(null)
  const [hasReviewedPreview, setHasReviewedPreview] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [sendEnabled, setSendEnabled] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 })
  const [stopSending, setStopSending] = useState(false)
  const [campaignStatus, setCampaignStatus] = useState('Draft')
  const [reminderGate, setReminderGate] = useState(false)
  const [reminderConfirmText, setReminderConfirmText] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const stopRef = useRef(false)

  const selectedOrg = orgs.find(o => o.id === selectedOrgId) || preSelectedOrg

  // Gate 1: Load employees when org selected, generate & save opt_out_ids
  useEffect(() => {
    if (selectedOrgId) {
      fetchEmployees(selectedOrgId).then(async (emps) => {
        const eligible = emps.filter(e => e.is_eligible !== false)
        setEmployees(eligible)
        setSelectedEmps(new Set(eligible.map(e => e.id)))
        const ids = {}
        for (const e of eligible) {
          const newId = e.opt_out_id || generateOptOutId()
          ids[e.id] = newId
          if (!e.opt_out_id) {
            await fetch(`${SUPABASE_URL}/rest/v1/employees?id=eq.${e.id}`, {
              method: 'PATCH', headers,
              body: JSON.stringify({ opt_out_id: newId })
            }).catch(err => console.error('Failed to save opt_out_id:', err))
          }
        }
        setOptOutIds(ids)
      })
    }
  }, [selectedOrgId])

  const toggleEmp = (id) => {
    setSelectedEmps(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectedEmployees = employees.filter(e => selectedEmps.has(e.id))
  const testEmployeeCount = selectedEmployees.filter(e => e.is_test).length

  // Gate 1: Create campaign
  const createCampaign = async () => {
    if (!selectedOrgId) { alert('Select an organization'); return }
    const today = new Date()
    const endDate = new Date(today); endDate.setDate(endDate.getDate() + 14)
    const body = {
      organization_id: selectedOrgId,
      name: `Enrollment — ${selectedOrg?.company_name || 'Org'} — ${today.toISOString().slice(0, 10)}`,
      status: 'Draft',
      start_date: today.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      total_employees: selectedEmployees.length,
      eligible_employees: selectedEmployees.length,
      effective_date: effectiveDate || null,
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/enrollment_campaigns`, {
      method: 'POST', headers: headersRepr, body: JSON.stringify(body)
    })
    if (res.ok) {
      const data = await res.json()
      const id = Array.isArray(data) ? data[0]?.id : data.id
      setCampaignId(id)
      await createAuditEntry({
        action: `Campaign created for ${selectedOrg?.company_name}`,
        action_category: 'campaign',
        organization_id: selectedOrgId,
        campaign_id: id,
        details: { employees: selectedEmployees.length }
      })
      await createNotification({
        recipient_id: '8fba22c5-1d5b-4549-8465-1f3627d616ea',
        recipient_type: 'internal',
        notification_type: 'campaign_created',
        title: `Campaign created for ${selectedOrg?.company_name}`,
        message: `${selectedEmployees.length} eligible employees included. Campaign ID: ${id}`,
        organization_id: selectedOrgId,
      })
    }
    setGate(2)
  }

  // Gate 3: Approve
  const approveCampaign = async () => {
    if (confirmText !== 'CONFIRM SEND') return
    if (campaignId) {
      await fetch(`${SUPABASE_URL}/rest/v1/enrollment_campaigns?id=eq.${campaignId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ status: 'Approved' })
      })
    }
    setCampaignStatus('Approved')
    await createAuditEntry({
      action: `Campaign approved for ${selectedOrg?.company_name}`,
      action_category: 'campaign',
      organization_id: selectedOrgId,
      campaign_id: campaignId,
      details: { email_count: selectedEmployees.length }
    })
    setGate(4)
    // 5-second delay before enabling send
    setSendEnabled(false)
    setTimeout(() => setSendEnabled(true), 5000)
  }

  // Gate 4: Send emails
  const sendEmails = async () => {
    setSending(true)
    stopRef.current = false
    const total = selectedEmployees.length
    setSendProgress({ current: 0, total })

    if (campaignId) {
      await fetch(`${SUPABASE_URL}/rest/v1/enrollment_campaigns?id=eq.${campaignId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ status: 'Sending' })
      })
    }
    setCampaignStatus('Sending')

    const freq = selectedOrg?.pay_frequency || 'Semi-Monthly'
    const endDate = new Date(); endDate.setDate(endDate.getDate() + 14)

    for (let i = 0; i < total; i += 10) {
      if (stopRef.current) break
      const batch = selectedEmployees.slice(i, i + 10)
      const promises = batch.map(async (emp) => {
        if (stopRef.current) return
        const periods = { Weekly: 52, Biweekly: 26, 'Semi-Monthly': 24, Monthly: 12 }
        const ppy = periods[freq] || 24
        const netPerCheck = emp.net_benefit_per_period || emp.net_benefit_monthly || 0
        const fitSavMonthly = (emp.fit_savings_per_period || 0) * ppy / 12
        const ssSavMonthly = (emp.ss_savings_per_period || 0) * ppy / 12
        const medicareSavMonthly = (emp.medicare_savings_per_period || 0) * ppy / 12
        const ficaSavMonthly = ssSavMonthly + medicareSavMonthly
        const feePP = emp.lw_fee_per_period || (LW_EE_FEE[freq] || 44.87)
        // Detailed paycheck data for email table
        const lwPrem = LW_PREM[freq] || 1173
        const grossPay = emp.gross_pay_per_period || 0
        const pretaxDed = (Number(emp.current_401k_per_period)||0)+(Number(emp.current_health_insurance_per_period)||0)+(Number(emp.current_hsa_per_period)||0)+(Number(emp.current_other_pretax_per_period)||0)
        const taxesBefore = (emp.current_fit_per_period||0)+(emp.current_ss_per_period||0)+(emp.current_medicare_per_period||0)
        const taxesAfter = (emp.new_fit_per_period||emp.current_fit_per_period||0)+(emp.new_ss_per_period||emp.current_ss_per_period||0)+(emp.new_medicare_per_period||emp.current_medicare_per_period||0)
        const takehomeBefore = grossPay - pretaxDed - taxesBefore
        const takehomeAfter = grossPay - pretaxDed - lwPrem - taxesAfter - feePP + lwPrem
        const taxSavings = taxesBefore - taxesAfter
        const effDateFormatted = effectiveDate ? new Date(effectiveDate + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : ''
        const body = {
          to: TEST_EMAIL_RECIPIENT,  // HARDCODED — always test
          to_name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
          subject: `${TEST_SUBJECT_PREFIX}Your LW360 Enrollment — ${selectedOrg?.company_name || ''}`,
          template: selectedOrg?.pay_type === 'trs' ? 'enrollment-trs' : 'enrollment',
          data: {
            employee_id: emp.id,
            campaign_id: campaignId,
            employee_name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
            first_name: emp.first_name || '',
            last_name: emp.last_name || '',
            company_name: selectedOrg?.company_name || '',
            pay_frequency: freq,
            net_increase_per_check: Number(netPerCheck).toFixed(2),
            fit_savings: fitSavMonthly.toFixed(2),
            fica_savings: ficaSavMonthly.toFixed(2),
            ee_fee: Number(feePP).toFixed(2),
            enrollment_link: `https://lw360-employee-enrollment.vercel.app/benefits?id=${optOutIds[emp.id] || ''}`,
            opt_out_link: `https://lw360-employee-enrollment.vercel.app/optout?id=${optOutIds[emp.id] || ''}`,
            days_remaining: 14,
            enrollment_deadline: endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            effective_date: effDateFormatted || '',
            original_recipient: `${emp.first_name || ''} ${emp.last_name || ''} (${emp.email || 'no email'})`,
            ...(grossPay > 0 ? {
              gross_pay: grossPay,
              pretax_deductions: pretaxDed,
              lw_premium: lwPrem,
              taxable_before: grossPay - pretaxDed,
              taxable_after: grossPay - pretaxDed - lwPrem,
              taxes_before: taxesBefore,
              taxes_after: taxesAfter,
              reimbursement: lwPrem,
              takehome_before: takehomeBefore,
              takehome_after: takehomeAfter,
              tax_savings: taxSavings,
            } : {}),
          }
        }
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-enrollment-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          })
          // Update employee
          await fetch(`${SUPABASE_URL}/rest/v1/employees?id=eq.${emp.id}`, {
            method: 'PATCH', headers,
            body: JSON.stringify({ enrollment_email_sent_at: new Date().toISOString(), enrollment_status: 'Email Sent' })
          })
          // Audit log
          await createAuditEntry({
            action: `Enrollment email sent (TEST) for ${emp.first_name} ${emp.last_name}`,
            action_category: 'email',
            organization_id: selectedOrgId,
            employee_id: emp.id,
            campaign_id: campaignId,
            details: { to: TEST_EMAIL_RECIPIENT, original_email: emp.email, subject: body.subject }
          })
        } catch (e) { console.error('Send error:', e) }
      })
      await Promise.all(promises)
      setSendProgress(prev => ({ ...prev, current: Math.min(i + 10, total) }))
      if (i + 10 < total && !stopRef.current) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    if (campaignId) {
      const sentCount = stopRef.current ? sendProgress.current : total
      await fetch(`${SUPABASE_URL}/rest/v1/enrollment_campaigns?id=eq.${campaignId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ status: 'In Progress', emails_sent: sentCount })
      })
      await createNotification({
        recipient_id: '8fba22c5-1d5b-4549-8465-1f3627d616ea',
        recipient_type: 'internal',
        notification_type: 'emails_sent',
        title: `Emails sent for ${selectedOrg?.company_name}`,
        message: `${sentCount} enrollment emails sent successfully.`,
        organization_id: selectedOrgId,
      })
    }
    setCampaignStatus('In Progress')
    setSending(false)
    if (!stopRef.current) setGate(5)
  }

  const handleStop = () => { stopRef.current = true; setStopSending(true) }

  // Gate 5: Reminder
  const sendReminders = async () => {
    if (reminderConfirmText !== 'CONFIRM SEND') return
    // Same send flow but only for non-viewed, non-opted-out employees
    const reminderEmps = selectedEmployees.filter(e => e.enrollment_status !== 'Opted Out' && !e.enrollment_page_viewed_at)
    await createNotification({
      recipient_id: '8fba22c5-1d5b-4549-8465-1f3627d616ea',
      recipient_type: 'internal',
      notification_type: 'reminder_ready',
      title: `Reminder ready for ${selectedOrg?.company_name}`,
      message: `${reminderEmps.length} employees haven't responded`,
      organization_id: selectedOrgId,
    })
    await createAuditEntry({
      action: `Reminder trigger approved for ${selectedOrg?.company_name} — ${reminderEmps.length} employees`,
      action_category: 'reminder',
      organization_id: selectedOrgId,
      campaign_id: campaignId,
    })
    alert(`Reminder notification created for ${reminderEmps.length} employees.`)
    setReminderGate(false)
    setReminderConfirmText('')
  }

  const buildEmailPreview = (emp) => {
    const freq = selectedOrg?.pay_frequency || 'Semi-Monthly'
    const periods = { Weekly: 52, Biweekly: 26, 'Semi-Monthly': 24, Monthly: 12 }
    const ppy = periods[freq] || 24
    const netPerCheck = emp.net_benefit_per_period || emp.net_benefit_monthly || 0
    const fitSav = (emp.fit_savings_per_period || 0) * ppy / 12
    const ficaSav = ((emp.ss_savings_per_period || 0) + (emp.medicare_savings_per_period || 0)) * ppy / 12
    const endDate = new Date(); endDate.setDate(endDate.getDate() + 14)
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <div style="background:#1A395C;padding:24px;text-align:center">
          <div style="color:#7AC143;font-size:24px;font-weight:bold">Live Well 360</div>
          <div style="color:white;font-size:12px;margin-top:4px">Health Strategy Advisors</div>
        </div>
        <div style="padding:24px">
          <p style="color:#1A395C;font-size:16px"><strong>Dear ${emp.first_name || 'Employee'},</strong></p>
          <p style="color:#64748b;font-size:14px">Great news! ${selectedOrg?.company_name || 'Your employer'} has partnered with Live Well 360 to offer you a new tax-advantaged benefit.</p>
          <div style="background:#f0fdf4;border-radius:8px;padding:20px;margin:16px 0;text-align:center">
            <div style="color:#64748b;font-size:12px">Your Estimated Net Increase Per Check (${freq})</div>
            <div style="color:#16a34a;font-size:36px;font-weight:bold">${formatCurrency(netPerCheck)}</div>
          </div>
          <div style="display:flex;gap:12px;margin:16px 0">
            <div style="flex:1;background:#f8fafc;border-radius:6px;padding:12px;text-align:center">
              <div style="font-size:11px;color:#94a3b8">FIT Savings/mo</div>
              <div style="font-size:18px;font-weight:bold;color:#1A395C">${formatCurrency(fitSav)}</div>
            </div>
            <div style="flex:1;background:#f8fafc;border-radius:6px;padding:12px;text-align:center">
              <div style="font-size:11px;color:#94a3b8">FICA Savings/mo</div>
              <div style="font-size:18px;font-weight:bold;color:#1A395C">${formatCurrency(ficaSav)}</div>
            </div>
          </div>
          <p style="color:#64748b;font-size:13px"><strong>Enrollment Deadline:</strong> ${endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          <p style="color:#64748b;font-size:13px">To opt out, use code: <strong>${optOutIds[emp.id] || 'N/A'}</strong></p>
          <p style="color:#94a3b8;font-size:11px;margin-top:16px;padding-top:12px;border-top:1px solid #e2e8f0">
            Original recipient: ${emp.first_name} ${emp.last_name} (${emp.email || 'no email'})<br/>
            TEST MODE — This email was sent to ${TEST_EMAIL_RECIPIENT}
          </p>
        </div>
      </div>
    `
  }

  const Wrapper = inline ? React.Fragment : Modal
  const wrapperProps = inline ? {} : { title: 'Create Enrollment Campaign', onClose, width: 900 }

  return (
    <Wrapper {...wrapperProps}>
      <div>
        {/* Gate Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {[
            { n: 1, l: 'Create' }, { n: 2, l: 'Preview' }, { n: 3, l: 'Approve' },
            { n: 4, l: 'Send' }, { n: 5, l: 'Reminders' }
          ].map(g => (
            <div key={g.n} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', margin: '0 auto 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, background: gate >= g.n ? '#7AC143' : '#e2e8f0', color: gate >= g.n ? 'white' : '#94a3b8' }}>{g.n}</div>
              <div style={{ fontSize: 11, color: gate >= g.n ? '#1A395C' : '#94a3b8', fontWeight: 600 }}>{g.l}</div>
            </div>
          ))}
        </div>

        {/* GATE 1: Campaign Creation */}
        {gate === 1 && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#1A395C', display: 'block', marginBottom: 6 }}>Select Organization</label>
              {preSelectedOrg ? (
                <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 6, fontSize: 14, color: '#1A395C', fontWeight: 600 }}>{preSelectedOrg.company_name}</div>
              ) : (
                <select value={selectedOrgId} onChange={e => setSelectedOrgId(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 14 }}>
                  <option value="">Choose organization...</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.company_name}{o.is_test ? ' [TEST]' : ''}</option>)}
                </select>
              )}
            </div>

            {testEmployeeCount > 0 && (
              <div style={{ padding: 12, background: '#fef3c7', borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>Warning: {testEmployeeCount} test employee(s) included in this campaign</div>
              </div>
            )}

            {employees.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A395C', marginBottom: 8 }}>Eligible Employees ({selectedEmps.size} of {employees.length} selected)</div>
                <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  {employees.map(emp => (
                    <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={selectedEmps.has(emp.id)} onChange={() => toggleEmp(emp.id)} />
                      <span style={{ color: '#1A395C', fontWeight: 500 }}>{emp.first_name} {emp.last_name}{emp.is_test && <TestBadge />}</span>
                      <span style={{ color: '#64748b', fontSize: 12 }}>{emp.email || 'no email'}</span>
                      <span style={{ marginLeft: 'auto', color: '#7AC143', fontWeight: 600, fontSize: 12 }}>{emp.net_benefit_monthly != null ? formatCurrency(emp.net_benefit_monthly) : '—'}/mo</span>
                      <span style={{ color: '#94a3b8', fontSize: 10 }}>ID: {optOutIds[emp.id] || '—'}</span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 16, marginBottom: 4 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#1A395C', display: 'block', marginBottom: 6 }}>
                    Effective Date (when benefits go live)
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={e => setEffectiveDate(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 14, color: '#1A395C', width: 200 }}
                  />
                </div>
                <button onClick={createCampaign} disabled={selectedEmps.size === 0}
                  style={{ marginTop: 12, padding: '10px 24px', borderRadius: 6, border: 'none', background: selectedEmps.size > 0 ? '#7AC143' : '#e2e8f0', color: selectedEmps.size > 0 ? 'white' : '#94a3b8', fontSize: 14, fontWeight: 600, cursor: selectedEmps.size > 0 ? 'pointer' : 'not-allowed' }}>
                  Create Campaign ({selectedEmps.size} employees)
                </button>
              </div>
            )}

            {selectedOrgId && employees.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No eligible employees found. Run eligibility analysis first.</div>
            )}
          </div>
        )}

        {/* GATE 2: Email Preview */}
        {gate === 2 && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1A395C', marginBottom: 4 }}>Preview Emails</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Review at least one email preview before proceeding.</div>

            <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 16 }}>
              {selectedEmployees.map((emp, i) => (
                <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#1A395C' }}>{emp.first_name} {emp.last_name}</span>
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{emp.email}</span>
                  </div>
                  <button onClick={() => { setPreviewIdx(i); setHasReviewedPreview(true) }}
                    style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, border: '1px solid #29ABE2', background: 'white', color: '#29ABE2', cursor: 'pointer', fontWeight: 600 }}>
                    Preview
                  </button>
                </div>
              ))}
            </div>

            {/* Email Preview Modal */}
            {previewIdx !== null && selectedEmployees[previewIdx] && (
              <Modal title={`Email Preview — ${selectedEmployees[previewIdx].first_name} ${selectedEmployees[previewIdx].last_name}`} onClose={() => setPreviewIdx(null)} width={650}>
                <div dangerouslySetInnerHTML={{ __html: buildEmailPreview(selectedEmployees[previewIdx]) }} />
              </Modal>
            )}

            <div style={{ padding: 12, background: '#f0f9ff', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#1A395C' }}>
              You are about to send <strong>{selectedEmployees.length}</strong> emails to employees of <strong>{selectedOrg?.company_name}</strong>
            </div>

            <button onClick={() => setGate(3)} disabled={!hasReviewedPreview}
              style={{ padding: '10px 24px', borderRadius: 6, border: 'none', background: hasReviewedPreview ? '#7AC143' : '#e2e8f0', color: hasReviewedPreview ? 'white' : '#94a3b8', fontSize: 14, fontWeight: 600, cursor: hasReviewedPreview ? 'pointer' : 'not-allowed' }}>
              Approve & Prepare to Send
            </button>
          </div>
        )}

        {/* GATE 3: Approval (CONFIRM SEND) */}
        {gate === 3 && (
          <div>
            <div style={{ padding: 16, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, marginBottom: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#92400e' }}>TEST MODE</div>
              <div style={{ fontSize: 13, color: '#92400e', marginTop: 4 }}>All emails will be sent to {TEST_EMAIL_RECIPIENT}</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A395C', marginBottom: 8 }}>Sending Summary</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>Organization: <strong>{selectedOrg?.company_name}</strong></div>
              <div style={{ fontSize: 13, color: '#64748b' }}>Total emails: <strong>{selectedEmployees.length}</strong></div>
            </div>

            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>ALL RECIPIENTS (test mode — sent to {TEST_EMAIL_RECIPIENT})</div>
              {selectedEmployees.map(emp => (
                <div key={emp.id} style={{ fontSize: 12, color: '#64748b', padding: '2px 0' }}>
                  {emp.first_name} {emp.last_name} — {emp.email || 'no email'}
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A395C', marginBottom: 6 }}>Type "CONFIRM SEND" to approve</div>
              <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="CONFIRM SEND"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 14, textAlign: 'center', boxSizing: 'border-box' }} />
            </div>

            <button onClick={approveCampaign} disabled={confirmText !== 'CONFIRM SEND'}
              style={{ padding: '10px 24px', borderRadius: 6, border: 'none', background: confirmText === 'CONFIRM SEND' ? '#f59e0b' : '#e2e8f0', color: confirmText === 'CONFIRM SEND' ? 'white' : '#94a3b8', fontSize: 14, fontWeight: 600, cursor: confirmText === 'CONFIRM SEND' ? 'pointer' : 'not-allowed' }}>
              Approve & Prepare to Send
            </button>
          </div>
        )}

        {/* GATE 4: Send Trigger */}
        {gate === 4 && (
          <div>
            {!sending ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1A395C', marginBottom: 8 }}>Ready to Send</div>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                  {selectedEmployees.length} emails will be sent to {TEST_EMAIL_RECIPIENT}
                </div>
                {!sendEnabled && (
                  <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 12 }}>Send button activating in 5 seconds...</div>
                )}
                <button onClick={sendEmails} disabled={!sendEnabled}
                  style={{ padding: '12px 32px', borderRadius: 8, border: 'none', background: sendEnabled ? '#7AC143' : '#e2e8f0', color: sendEnabled ? 'white' : '#94a3b8', fontSize: 16, fontWeight: 700, cursor: sendEnabled ? 'pointer' : 'not-allowed' }}>
                  Send Now
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1A395C', marginBottom: 16 }}>Sending emails...</div>
                <ProgressBar current={sendProgress.current} total={sendProgress.total} color="#7AC143" />
                <div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>Sent {sendProgress.current} of {sendProgress.total} emails...</div>
                <button onClick={handleStop} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 6, border: 'none', background: '#dc2626', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  STOP Sending
                </button>
              </div>
            )}
          </div>
        )}

        {/* GATE 5: Reminders */}
        {gate === 5 && (
          <div>
            <div style={{ textAlign: 'center', padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{'\u2705'}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1A395C' }}>Emails Sent Successfully</div>
              <div style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>Campaign is now In Progress. Reminders can be sent on Day 7, 11, or 13.</div>
            </div>

            <div style={{ background: 'white', borderRadius: 8, padding: 20, border: '1px solid #e2e8f0', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A395C', marginBottom: 8 }}>Reminder Scheduling</div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                Send reminders to employees who haven't opted out and haven't viewed their enrollment page.
              </div>
              <button onClick={() => setReminderGate(true)} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#f59e0b', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Prepare Reminder
              </button>
            </div>

            {reminderGate && (
              <div style={{ padding: 16, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>
                  TEST MODE — All reminder emails will be sent to {TEST_EMAIL_RECIPIENT}
                </div>
                <div style={{ fontSize: 13, color: '#92400e', marginBottom: 12 }}>
                  Type "CONFIRM SEND" to trigger reminders
                </div>
                <input type="text" value={reminderConfirmText} onChange={e => setReminderConfirmText(e.target.value)} placeholder="CONFIRM SEND"
                  style={{ width: '100%', padding: '8px 14px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, textAlign: 'center', marginBottom: 8, boxSizing: 'border-box' }} />
                <button onClick={sendReminders} disabled={reminderConfirmText !== 'CONFIRM SEND'}
                  style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: reminderConfirmText === 'CONFIRM SEND' ? '#f59e0b' : '#e2e8f0', color: reminderConfirmText === 'CONFIRM SEND' ? 'white' : '#94a3b8', fontSize: 13, fontWeight: 600, cursor: reminderConfirmText === 'CONFIRM SEND' ? 'pointer' : 'not-allowed' }}>
                  Send Reminders
                </button>
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 6, border: 'none', background: '#1A395C', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Wrapper>
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
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1A395C' }}>{b.name}{b.is_test && <TestBadge />}</div>
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

              {b.upline_broker_id && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                  Upline: {brokers.find(ub => ub.id === b.upline_broker_id)?.name || 'Unknown'}
                </div>
              )}

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

                  {brokers.filter(db => db.upline_broker_id === b.id).length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1A395C', marginBottom: 4 }}>Downline Brokers</div>
                      {brokers.filter(db => db.upline_broker_id === b.id).map(db => (
                        <div key={db.id} style={{ fontSize: 12, color: '#64748b', padding: '2px 0' }}>{db.name} — {db.agency_name || ''}</div>
                      ))}
                    </div>
                  )}

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
  const stageData = STAGES.map(s => ({ stage: s, count: orgs.filter(o => o.pipeline_stage === s).length }))
  const maxCount = Math.max(...stageData.map(d => d.count), 1)

  const monthlyData = {}
  orgs.forEach(o => {
    if (!o.created_at) return
    const key = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    monthlyData[key] = (monthlyData[key] || 0) + 1
  })
  const months = Object.entries(monthlyData).slice(-6)
  const maxMonthly = Math.max(...months.map(([, v]) => v), 1)

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
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A395C' }}>{b.name}{b.is_test && <TestBadge />}</div>
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
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A395C' }}>{c.campaign_name || 'Unnamed'}{c.is_test && <TestBadge />}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{c.organizations?.company_name || '—'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                  background: `${CAMPAIGN_STATUS_COLORS[c.status] || '#94a3b8'}18`,
                  color: CAMPAIGN_STATUS_COLORS[c.status] || '#94a3b8'
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
