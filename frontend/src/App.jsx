import { useCallback, useEffect, useMemo, useState } from 'react';
import Activity from 'lucide-react/dist/esm/icons/activity.js';
import ArrowDownToLine from 'lucide-react/dist/esm/icons/arrow-down-to-line.js';
import ArrowLeftRight from 'lucide-react/dist/esm/icons/arrow-left-right.js';
import BedDouble from 'lucide-react/dist/esm/icons/bed-double.js';
import Building2 from 'lucide-react/dist/esm/icons/building-2.js';
import Check from 'lucide-react/dist/esm/icons/check.js';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down.js';
import CircleDollarSign from 'lucide-react/dist/esm/icons/circle-dollar-sign.js';
import DoorOpen from 'lucide-react/dist/esm/icons/door-open.js';
import GraduationCap from 'lucide-react/dist/esm/icons/graduation-cap.js';
import LayoutDashboard from 'lucide-react/dist/esm/icons/layout-dashboard.js';
import LogOut from 'lucide-react/dist/esm/icons/log-out.js';
import Menu from 'lucide-react/dist/esm/icons/menu.js';
import Plus from 'lucide-react/dist/esm/icons/plus.js';
import Search from 'lucide-react/dist/esm/icons/search.js';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check.js';
import Users from 'lucide-react/dist/esm/icons/users.js';
import Wallet from 'lucide-react/dist/esm/icons/wallet.js';
import X from 'lucide-react/dist/esm/icons/x.js';
import api, { getErrorMessage } from './api';

const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Students', icon: GraduationCap },
  { id: 'rooms', label: 'Rooms', icon: BedDouble },
  { id: 'allocations', label: 'Allocations', icon: Building2 },
  { id: 'payments', label: 'Payments', icon: Wallet }
];

const titleByPage = {
  dashboard: ['Overview', 'Here is what is happening at your hostel today.'],
  students: ['Students', 'Manage student records and contact information.'],
  rooms: ['Rooms', 'Keep track of room capacity, pricing, and availability.'],
  allocations: ['Room allocations', 'Assign students to rooms and manage room changes.'],
  payments: ['Payments', 'Record and review hostel payment history.']
};

const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => new Intl.NumberFormat(undefined, {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2
}).format(Number(value || 0));
const displayDate = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString() : '—';

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('hostel_admin_token'));
  const [adminEmail, setAdminEmail] = useState('');
  const [activePage, setActivePage] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [data, setData] = useState({ dashboard: null, students: [], rooms: [], allocations: [], payments: [] });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState(null);

  const notify = useCallback((message, kind = 'success') => {
    setNotice({ message, kind });
    window.setTimeout(() => setNotice(null), 3600);
  }, []);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [dashboard, students, rooms, allocations, payments] = await Promise.all([
        api.get('/dashboard'), api.get('/students'), api.get('/rooms'),
        api.get('/allocations'), api.get('/payments')
      ]);
      setData({
        dashboard: dashboard.data,
        students: students.data,
        rooms: rooms.data,
        allocations: allocations.data,
        payments: payments.data
      });
    } catch (error) {
      if (error.response?.status === 401) signOut();
      else notify(getErrorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [token, notify]);

  useEffect(() => { loadData(); }, [loadData]);

  function signOut() {
    localStorage.removeItem('hostel_admin_token');
    setToken(null);
    setAdminEmail('');
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const response = await api.post('/auth/login', {
        email: form.get('email'),
        password: form.get('password')
      });
      localStorage.setItem('hostel_admin_token', response.data.token);
      setAdminEmail(response.data.admin.email);
      setToken(response.data.token);
    } catch (error) {
      notify(getErrorMessage(error), 'error');
    }
  }

  async function saveRecord(values) {
    const { type, id } = modal;
    try {
      if (type === 'student') {
        if (id) await api.put(`/students/${id}`, values);
        else await api.post('/students', values);
      } else if (type === 'room') {
        const payload = { ...values, capacity: Number(values.capacity), price: Number(values.price) };
        if (id) await api.put(`/rooms/${id}`, payload);
        else await api.post('/rooms', payload);
      } else if (type === 'allocation') {
        await api.post('/allocations', { ...values, student_id: Number(values.student_id), room_id: Number(values.room_id) });
      } else if (type === 'move') {
        await api.put(`/allocations/${id}/move`, { room_id: Number(values.room_id), allocated_at: values.allocated_at });
      } else if (type === 'payment') {
        const payload = { ...values, student_id: Number(values.student_id), amount: Number(values.amount) };
        if (id) await api.put(`/payments/${id}`, payload);
        else await api.post('/payments', payload);
      }
      setModal(null);
      notify('Changes saved successfully.');
      await loadData();
    } catch (error) {
      notify(getErrorMessage(error), 'error');
    }
  }

  async function deleteRecord(type, id, label) {
    if (!window.confirm(`Delete ${label}? This action cannot be undone.`)) return;
    try {
      await api.delete(`/${type}/${id}`);
      notify(`${label} deleted.`);
      await loadData();
    } catch (error) {
      notify(getErrorMessage(error), 'error');
    }
  }

  async function vacateAllocation(allocation) {
    if (!window.confirm(`End ${allocation.full_name}'s allocation in room ${allocation.room_number}?`)) return;
    try {
      await api.put(`/allocations/${allocation.id}/vacate`);
      notify('Allocation ended.');
      await loadData();
    } catch (error) {
      notify(getErrorMessage(error), 'error');
    }
  }

  if (!token) return <Login onSubmit={handleLogin} notice={notice} />;

  const pageInfo = titleByPage[activePage];
  return (
    <div className="app-shell">
      {mobileMenuOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Building2 size={21} /></div>
          <div><strong>HostelHub</strong><span>ADMIN PORTAL</span></div>
          <button className="icon-button mobile-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"><X size={19} /></button>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="side-nav">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${activePage === id ? 'active' : ''}`} onClick={() => { setActivePage(id); setSearch(''); setMobileMenuOpen(false); }}>
              <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
              {id === 'dashboard' && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-card"><ShieldCheck size={18} /><div><strong>Secure workspace</strong><span>Administrator access</span></div></div>
          <button className="profile" onClick={signOut}>
            <div className="avatar">{(adminEmail || 'A').slice(0, 1).toUpperCase()}</div>
            <div className="profile-info"><strong>{adminEmail || 'Administrator'}</strong><span>Administrator</span></div>
            <LogOut size={17} className="profile-logout" />
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button className="icon-button mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{pageInfo[0]}</strong></div>
          <div className="topbar-right">
            <span className="today-label">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <div className="top-avatar">{(adminEmail || 'A').slice(0, 1).toUpperCase()}</div>
          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div><div className="eyebrow">HOSTEL MANAGEMENT</div><h1>{pageInfo[0]}</h1><p>{pageInfo[1]}</p></div>
            {activePage !== 'dashboard' && activePage !== 'allocations' && (
              <button className="primary-button" onClick={() => setModal({ type: activePage === 'students' ? 'student' : activePage === 'rooms' ? 'room' : 'payment' })}>
                <Plus size={18} /> Add {activePage === 'students' ? 'student' : activePage === 'rooms' ? 'room' : 'payment'}
              </button>
            )}
            {activePage === 'allocations' && (
              <button className="primary-button" onClick={() => setModal({ type: 'allocation' })}><Plus size={18} /> Allocate room</button>
            )}
          </div>

          {activePage === 'dashboard' ? (
            <Dashboard dashboard={data.dashboard} rooms={data.rooms} loading={loading} onNavigate={setActivePage} />
          ) : (
            <RecordPage
              page={activePage}
              data={data}
              search={search}
              onSearch={setSearch}
              onEdit={(type, record) => setModal({ type, id: record.id, record })}
              onDelete={deleteRecord}
              onMove={(record) => setModal({ type: 'move', id: record.id, record })}
              onVacate={vacateAllocation}
            />
          )}
          <footer className="footer"><span>HostelHub Management System</span><span>Data is securely managed in your hostel database</span></footer>
        </section>
      </main>

      {modal && (
        <RecordModal
          modal={modal}
          students={data.students}
          rooms={data.rooms}
          onClose={() => setModal(null)}
          onSave={saveRecord}
        />
      )}
      {notice && <div className={`toast toast-${notice.kind}`}><span className="toast-icon">{notice.kind === 'success' ? <Check size={17} /> : <X size={17} />}</span>{notice.message}</div>}
    </div>
  );
}

function Login({ onSubmit, notice }) {
  return (
    <main className="login-page">
      <div className="login-art">
        <div className="login-brand"><span className="brand-mark"><Building2 size={21} /></span><strong>HostelHub</strong></div>
        <div className="login-art-content">
          <div className="eyebrow light-eyebrow">HOSTEL MANAGEMENT, MADE SIMPLE</div>
          <h1>Everything your hostel needs, all in one place.</h1>
          <p>Manage students, rooms, allocations, and payments through one secure workspace.</p>
          <div className="login-art-stats"><span><Users size={18} /> Student records</span><span><DoorOpen size={18} /> Room tracking</span><span><CircleDollarSign size={18} /> Payment history</span></div>
        </div>
        <div className="login-art-footer">HOSTEL ADMINISTRATION PORTAL</div>
      </div>
      <div className="login-form-side">
        <form className="login-card" onSubmit={onSubmit}>
          <div className="login-icon"><ShieldCheck size={24} /></div>
          <div className="eyebrow">ADMINISTRATOR ACCESS</div>
          <h2>Welcome back</h2>
          <p>Sign in with your administrator account to continue.</p>
          {notice && <div className={`inline-notice ${notice.kind}`}>{notice.message}</div>}
          <label>Email address<input name="email" type="email" placeholder="admin@hostel.local" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" placeholder="Enter your password" autoComplete="current-password" required /></label>
          <button className="primary-button login-submit" type="submit">Sign in <ArrowDownToLine size={17} /></button>
          <div className="login-footnote"><ShieldCheck size={15} /> Protected administrator sign-in</div>
        </form>
      </div>
    </main>
  );
}

function Dashboard({ dashboard, rooms, loading, onNavigate }) {
  const cards = [
    { title: 'Total students', value: dashboard?.totalStudents ?? '—', note: 'Registered in the system', icon: Users, tone: 'blue' },
    { title: 'Total rooms', value: dashboard?.totalRooms ?? '—', note: 'Rooms under management', icon: Building2, tone: 'violet' },
    { title: 'Available rooms', value: dashboard?.availableRooms ?? '—', note: 'Ready for allocation', icon: DoorOpen, tone: 'green' },
    { title: 'Occupied rooms', value: dashboard?.occupiedRooms ?? '—', note: 'Currently in use', icon: BedDouble, tone: 'amber' },
    { title: 'Total payments', value: dashboard ? money(dashboard.totalPayments) : '—', note: 'All recorded payments', icon: CircleDollarSign, tone: 'teal' }
  ];
  return (
    <>
      <div className="stats-grid">
        {cards.map(({ title, value, note, icon: Icon, tone }) => (
          <article className="stat-card" key={title}>
            <div className={`stat-icon ${tone}`}><Icon size={20} /></div>
            <span className="stat-title">{title}</span>
            <strong className="stat-value">{loading ? <span className="skeleton" /> : value}</strong>
            <span className="stat-note">{note}</span>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <div className="panel-heading"><div><h2>Recent activity</h2><p>Latest updates across your hostel</p></div><span className="panel-heading-icon"><Activity size={18} /></span></div>
          {loading ? <div className="empty-state">Loading activity…</div> : dashboard?.recentActivities?.length ? (
            <div className="activity-list">
              {dashboard.recentActivities.map((item, index) => (
                <div className="activity-row" key={`${item.activity}-${item.created_at}-${index}`}>
                  <span className={`activity-dot dot-${item.activity.toLowerCase()}`} />
                  <div className="activity-copy"><strong>{item.details}</strong><span>{item.activity}</span></div>
                  <time>{displayDate(item.created_at)}</time>
                </div>
              ))}
            </div>
          ) : <div className="empty-state">No recent activity to show.</div>}
        </section>
        <section className="panel room-summary">
          <div className="panel-heading"><div><h2>Room availability</h2><p>Capacity and occupancy overview</p></div><span className="panel-heading-icon"><BedDouble size={18} /></span></div>
          <div className="room-summary-count"><strong>{dashboard?.availableRooms ?? '—'}</strong><span>rooms available</span></div>
          {rooms.slice(0, 4).map((room) => (
            <div className="mini-room" key={room.id}>
              <div><strong>Room {room.room_number}</strong><span>{room.occupied_beds}/{room.capacity} beds occupied</span></div>
              <StatusBadge value={room.status} />
            </div>
          ))}
          {!rooms.length && <div className="empty-state">No rooms have been added.</div>}
          <button className="text-button" onClick={() => onNavigate('rooms')}>View all rooms <ChevronDown size={15} /></button>
        </section>
      </div>
      <div className="quick-actions">
        <button onClick={() => onNavigate('students')}><span className="quick-icon blue"><Users size={18} /></span><span><strong>Manage students</strong><small>View student records</small></span><ChevronDown size={16} className="quick-arrow" /></button>
        <button onClick={() => onNavigate('allocations')}><span className="quick-icon green"><ArrowLeftRight size={18} /></span><span><strong>Room allocations</strong><small>Assign or move students</small></span><ChevronDown size={16} className="quick-arrow" /></button>
        <button onClick={() => onNavigate('payments')}><span className="quick-icon amber"><Wallet size={18} /></span><span><strong>Record a payment</strong><small>Review payment history</small></span><ChevronDown size={16} className="quick-arrow" /></button>
      </div>
    </>
  );
}

function RecordPage({ page, data, search, onSearch, onEdit, onDelete, onMove, onVacate }) {
  const rows = data[page] || [];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query)));
  }, [rows, search]);

  const config = {
    students: {
      type: 'student', deleteType: 'students', label: 'student',
      columns: [['Registration no.', (row) => row.reg_no], ['Student', (row) => <div className="cell-primary"><strong>{row.full_name}</strong><span>{row.email || 'No email provided'}</span></div>], ['Gender', (row) => row.gender], ['Phone', (row) => row.phone], ['Room', (row) => row.room_number ? <span className="room-chip">{row.room_number}</span> : <span className="muted">Not allocated</span>]]
    },
    rooms: {
      type: 'room', deleteType: 'rooms', label: 'room',
      columns: [['Room', (row) => <strong className="table-strong">{row.room_number}</strong>], ['Capacity', (row) => `${row.occupied_beds} / ${row.capacity} beds`], ['Monthly price', (row) => money(row.price)], ['Status', (row) => <StatusBadge value={row.status} />], ['Description', (row) => <span className="truncate">{row.description || '—'}</span>]]
    },
    allocations: {
      label: 'allocation',
      columns: [['Student', (row) => <div className="cell-primary"><strong>{row.full_name}</strong><span>{row.reg_no}</span></div>], ['Room', (row) => <span className="room-chip">{row.room_number}</span>], ['Allocated', (row) => displayDate(row.allocated_at)], ['Vacated', (row) => row.vacated_at ? displayDate(row.vacated_at) : '—'], ['Status', (row) => <StatusBadge value={row.status} />]]
    },
    payments: {
      type: 'payment', deleteType: 'payments', label: 'payment',
      columns: [['Student', (row) => <div className="cell-primary"><strong>{row.full_name}</strong><span>{row.reg_no}</span></div>], ['Amount', (row) => <strong className="table-strong">{money(row.amount)}</strong>], ['Method', (row) => row.payment_method], ['Date', (row) => displayDate(row.paid_at)], ['Status', (row) => <StatusBadge value={row.status} />]]
    }
  }[page];

  return (
    <section className="panel records-panel">
      <div className="records-toolbar">
        <div><h2>{page === 'allocations' ? 'Allocation records' : `${page[0].toUpperCase()}${page.slice(1)} list`}</h2><p>{filtered.length} {filtered.length === 1 ? config.label : `${config.label}s`} found</p></div>
        <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={`Search ${page}…`} aria-label={`Search ${page}`} />{search && <button onClick={() => onSearch('')} aria-label="Clear search"><X size={15} /></button>}</label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>{config.columns.map(([heading]) => <th key={heading}>{heading}</th>)}<th className="actions-heading">Actions</th></tr></thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                {config.columns.map(([heading, render]) => <td key={heading}>{render(row)}</td>)}
                <td className="row-actions">
                  {page === 'allocations' ? row.status === 'Active' ? <>
                    <button className="action-button" onClick={() => onMove(row)} aria-label="Move student"><ArrowLeftRight size={16} /><span>Move</span></button>
                    <button className="action-button danger-action" onClick={() => onVacate(row)} aria-label="End allocation"><LogOut size={16} /><span>Vacate</span></button>
                  </> : <span className="muted">—</span> : <>
                    <button className="action-button" onClick={() => onEdit(config.type, row)} aria-label={`Edit ${config.label}`}><span>Edit</span></button>
                    <button className="action-button danger-action" onClick={() => onDelete(config.deleteType, row.id, `${config.label} ${row.full_name || row.room_number || `#${row.id}`}`)} aria-label={`Delete ${config.label}`}><span>Delete</span></button>
                  </>}
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td className="table-empty" colSpan={config.columns.length + 1}>{search ? 'No records match your search.' : `No ${config.label} records yet.`}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-footer"><span>Showing {filtered.length} of {rows.length} records</span><span className="live-indicator"><i /> Live database records</span></div>
    </section>
  );
}

function StatusBadge({ value }) {
  const className = String(value || '').toLowerCase().replace(/\s+/g, '-');
  return <span className={`status-badge status-${className}`}><i />{value}</span>;
}

function RecordModal({ modal, students, rooms, onClose, onSave }) {
  const { type, record } = modal;
  const [saving, setSaving] = useState(false);
  const config = {
    student: {
      title: record ? 'Edit student' : 'Add student', submit: 'Save student',
      fields: [
        { name: 'reg_no', label: 'Registration number', required: true, value: record?.reg_no },
        { name: 'full_name', label: 'Full name', required: true, value: record?.full_name },
        { name: 'gender', label: 'Gender', type: 'select', required: true, value: record?.gender, options: ['Female', 'Male', 'Other'] },
        { name: 'phone', label: 'Phone number', required: true, value: record?.phone },
        { name: 'email', label: 'Email address', type: 'email', value: record?.email },
        { name: 'address', label: 'Address', type: 'textarea', required: true, value: record?.address, wide: true }
      ]
    },
    room: {
      title: record ? 'Edit room' : 'Add room', submit: 'Save room',
      fields: [
        { name: 'room_number', label: 'Room number', required: true, value: record?.room_number },
        { name: 'capacity', label: 'Bed capacity', type: 'number', min: '1', required: true, value: record?.capacity },
        { name: 'price', label: 'Monthly price (USD)', type: 'number', min: '0', step: '0.01', required: true, value: record?.price ?? '0' },
        { name: 'description', label: 'Description', type: 'textarea', value: record?.description, wide: true }
      ]
    },
    allocation: {
      title: 'Allocate a room', submit: 'Allocate student',
      fields: [
        { name: 'student_id', label: 'Student', type: 'select', required: true, options: students.filter((student) => !student.room_id).map((student) => ({ value: student.id, label: `${student.full_name} (${student.reg_no})` })) },
        { name: 'room_id', label: 'Available room', type: 'select', required: true, options: rooms.filter((room) => Number(room.occupied_beds) < Number(room.capacity)).map((room) => ({ value: room.id, label: `${room.room_number} · ${room.occupied_beds}/${room.capacity} beds` })) },
        { name: 'allocated_at', label: 'Allocation date', type: 'date', value: today() }
      ]
    },
    move: {
      title: `Move ${record?.full_name}`, submit: 'Move student',
      fields: [
        { name: 'room_id', label: 'Destination room', type: 'select', required: true, options: rooms.filter((room) => Number(room.occupied_beds) < Number(room.capacity) && Number(room.id) !== Number(record?.room_id)).map((room) => ({ value: room.id, label: `${room.room_number} · ${room.occupied_beds}/${room.capacity} beds` })) },
        { name: 'allocated_at', label: 'Move date', type: 'date', value: today() }
      ]
    },
    payment: {
      title: record ? 'Edit payment' : 'Record a payment', submit: 'Save payment',
      fields: [
        { name: 'student_id', label: 'Student', type: 'select', required: true, value: record?.student_id, options: students.map((student) => ({ value: student.id, label: `${student.full_name} (${student.reg_no})` })) },
        { name: 'amount', label: 'Amount (USD)', type: 'number', min: '0.01', step: '0.01', required: true, value: record?.amount },
        { name: 'payment_method', label: 'Payment method', type: 'select', required: true, value: record?.payment_method, options: ['Cash', 'Bank transfer', 'Mobile money', 'Card'] },
        { name: 'paid_at', label: 'Payment date', type: 'date', required: true, value: record?.paid_at?.slice(0, 10) || today() }
      ]
    }
  }[type];

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await onSave(values);
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="record-modal" onSubmit={submit}>
        <div className="modal-heading"><div><span className="eyebrow">HOSTEL RECORD</span><h2>{config.title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        {type === 'allocation' && !students.some((student) => !student.room_id) && <div className="inline-notice error">Every student already has an active room allocation.</div>}
        {type === 'allocation' && !rooms.some((room) => Number(room.occupied_beds) < Number(room.capacity)) && <div className="inline-notice error">No rooms currently have available capacity.</div>}
        {type === 'move' && !rooms.some((room) => Number(room.occupied_beds) < Number(room.capacity) && Number(room.id) !== Number(record?.room_id)) && <div className="inline-notice error">No other room currently has available capacity.</div>}
        {type === 'payment' && !students.length && <div className="inline-notice error">Add a student before recording a payment.</div>}
        <div className="form-grid">
          {config.fields.map((field) => <FormField key={field.name} field={field} />)}
        </div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : config.submit}</button></div>
      </form>
    </div>
  );
}

function FormField({ field }) {
  const common = { id: field.name, name: field.name, required: field.required, defaultValue: field.value ?? '', min: field.min, step: field.step };
  return (
    <label className={`form-field ${field.wide ? 'field-wide' : ''}`} htmlFor={field.name}>
      <span>{field.label}{field.required && <i> *</i>}</span>
      {field.type === 'select' ? (
        <select {...common}>
          <option value="">Select…</option>
          {field.options.map((option) => {
            const value = typeof option === 'string' ? option : option.value;
            const label = typeof option === 'string' ? option : option.label;
            return <option key={value} value={value}>{label}</option>;
          })}
        </select>
      ) : field.type === 'textarea' ? <textarea {...common} rows="3" /> : <input {...common} type={field.type || 'text'} />}
    </label>
  );
}

export default App;
