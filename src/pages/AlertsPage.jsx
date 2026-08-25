import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  Edit3,
  Filter,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Wifi,
  WifiOff,
  X,
  Zap,
  Calendar
} from 'lucide-react';
import { api } from '../services/api';
import wsService from '../services/websocket';
import { useAuth } from '../hooks/useAuth';

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'];
const ACTIONS = ['EMAIL', 'SMS', 'WHATSAPP'];
const OPERATORS = ['>', '<', '>=', '<=', '==', '!='];
const TIME_RANGES = [
  { label: '24 Hours', value: '24h' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: 'All Recorded', value: 'all' },
  { label: 'Custom Range', value: 'custom' }
];

const FIELD_OPTIONS = [
  { value: 'peak_g', label: 'Peak acceleration (G)' },
  { value: 'duration_ms', label: 'Impact duration (ms)' },
  { value: 'peaks', label: 'Detected peaks' },
  { value: 'energy_g2', label: 'Impact energy (G²)' },
  { value: 'mean_g', label: 'Mean acceleration (G)' },
  { value: 'battery', label: 'Battery voltage (V)' },
  { value: 'csq', label: 'Signal quality (CSQ)' },
  { value: 'load_kn', label: 'Measured load (kN)' },
  { value: 'loadCapacityPct', label: 'Rated load utilization (%)' },
];
const EVENT_TYPES = [
  'ROCKFALL',
  'IMPACT',
  'IMPACT_DETECTED',
  'TAMPER_DETECTED',
  'COMMUNICATION_LOSS',
  'SENSOR_FAILURE',
  'HEARTBEAT',
];
const RULE_TEMPLATES = [
  {
    label: 'Critical impact',
    values: {
      name: 'Critical impact threshold',
      severity: 'CRITICAL',
      conditions: [{ field: 'peak_g', operator: '>=', value: '6' }],
      actions: ['EMAIL', 'SMS'],
    },
  },
  {
    label: 'Low battery voltage',
    values: {
      name: 'Low battery voltage',
      severity: 'MEDIUM',
      conditions: [{ field: 'battery', operator: '<', value: '10.8' }],
      actions: ['EMAIL'],
    },
  },
  {
    label: 'Barrier overload',
    values: {
      name: 'Barrier rated load warning',
      severity: 'CRITICAL',
      conditions: [{ field: 'loadCapacityPct', operator: '>=', value: '80' }],
      actions: ['EMAIL', 'SMS'],
    },
  },
];

const blankRuleForm = (organizationId = '') => ({
  name: '',
  organizationId,
  deviceId: '',
  eventType: '',
  severity: 'HIGH',
  isActive: true,
  conditions: [{ field: 'peak_g', operator: '>', value: '' }],
  actions: ['EMAIL'],
});

const finiteNumber = value => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatDate = value => {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
};

const formatEventType = value => String(value || 'UNCLASSIFIED').replaceAll('_', ' ');

const severityTone = severity => ({
  LOW: 'border-sky-500/30 bg-sky-500/10 text-info',
  MEDIUM: 'border-amber-500/30 bg-amber-500/10 text-warning',
  HIGH: 'border-orange-500/30 bg-orange-500/10 text-warning',
  CRITICAL: 'border-rose-500/30 bg-rose-500/10 text-danger',
}[severity] || 'border-border bg-surface-2 text-text-muted');

const statusTone = status => ({
  ACTIVE: 'border-rose-500/30 bg-rose-500/10 text-danger',
  ACKNOWLEDGED: 'border-amber-500/30 bg-amber-500/10 text-warning',
  RESOLVED: 'border-emerald-500/30 bg-emerald-500/10 text-success',
}[status] || 'border-border bg-surface-2 text-text-muted');

const inputClass = 'w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text outline-none transition placeholder:text-text-dim focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-60';

function MetricCard({ icon: Icon, label, value, detail, tone }) {
  const MetricIcon = Icon;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs text-text-muted">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>
        <span className={`rounded-xl bg-surface-2 p-2.5 ${tone}`}><MetricIcon className="h-5 w-5" /></span>
      </div>
      <p className="mt-2 text-[11px] text-text-dim">{detail}</p>
    </div>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <ShieldCheck className="mx-auto h-10 w-10 text-text-dim" />
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-lg text-sm text-text-muted">{detail}</p>
    </div>
  );
}

function ErrorBanner({ title, message, onRetry }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-danger">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs opacity-85">{message}</p></div>
      {onRetry && <button type="button" onClick={onRetry} className="rounded-lg border border-current/25 px-2.5 py-1 text-xs font-semibold">Retry</button>}
    </div>
  );
}

export default function AlertsPage() {
  const { user, isAdmin, isOrgAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('alerts');
  const [alerts, setAlerts] = useState([]);
  const [alertSummary, setAlertSummary] = useState({ total: 0, active: 0, acknowledged: 0, resolved: 0, criticalOpen: 0 });
  const [rules, setRules] = useState([]);
  const [devices, setDevices] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(isOrgAdmin);
  const [refreshing, setRefreshing] = useState(false);
  const [alertsError, setAlertsError] = useState('');
  const [rulesError, setRulesError] = useState('');
  const [referenceError, setReferenceError] = useState('');
  const [notice, setNotice] = useState('');
  const [wsConnected, setWsConnected] = useState(false);

  // Filters & Custom Date Range state
  const [timeRange, setTimeRange] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedCustomDates, setAppliedCustomDates] = useState({ from: '', to: '' });
  const [filters, setFilters] = useState({ search: '', status: '', severity: '', eventType: '' });

  const [mutatingAlert, setMutatingAlert] = useState('');
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState('');
  const [ruleForm, setRuleForm] = useState(() => blankRuleForm(isAdmin ? '' : String(user?.organizationId || '')));
  const [ruleFormError, setRuleFormError] = useState('');
  const [savingRule, setSavingRule] = useState(false);
  const [mutatingRule, setMutatingRule] = useState('');
  const alertRequest = useRef(0);
  const ruleRequest = useRef(0);

  const loadAlerts = useCallback(async ({ quiet = false, range = timeRange, customFrom = appliedCustomDates.from, customTo = appliedCustomDates.to } = {}) => {
    const requestId = ++alertRequest.current;
    if (!quiet) setAlertsLoading(true);
    setAlertsError('');
    try {
      const params = { limit: '200' };
      if (range === 'custom' || customFrom || customTo) {
        if (customFrom) params.fromDate = customFrom;
        if (customTo) params.toDate = customTo;
        params.range = 'custom';
      } else if (range) {
        params.range = range;
      }

      const response = await api.alerts.getLogs(params);
      if (requestId !== alertRequest.current) return;
      setAlerts(Array.isArray(response.alerts) ? response.alerts : []);
      setAlertSummary(response.summary || {
        total: Number(response.count) || Number(response.total) || 0,
        active: 0,
        acknowledged: 0,
        resolved: 0,
        criticalOpen: 0,
      });
    } catch (error) {
      if (requestId === alertRequest.current) setAlertsError(error.message || 'Unable to load alert records.');
    } finally {
      if (requestId === alertRequest.current) setAlertsLoading(false);
    }
  }, [timeRange, appliedCustomDates]);

  const loadRules = useCallback(async ({ quiet = false } = {}) => {
    if (!isOrgAdmin) return;
    const requestId = ++ruleRequest.current;
    if (!quiet) setRulesLoading(true);
    setRulesError('');
    try {
      const response = await api.alerts.getRules();
      if (requestId === ruleRequest.current) setRules(Array.isArray(response.rules) ? response.rules : []);
    } catch (error) {
      if (requestId === ruleRequest.current) setRulesError(error.message || 'Unable to load safety rules.');
    } finally {
      if (requestId === ruleRequest.current) setRulesLoading(false);
    }
  }, [isOrgAdmin]);

  const loadReferences = useCallback(async () => {
    setReferenceError('');
    const organizationRequest = isAdmin
      ? api.organizations.getAll()
      : isOrgAdmin && user?.organizationId
        ? api.organizations.getById(user.organizationId)
        : Promise.resolve({ organizations: [] });
    const [deviceResult, organizationResult] = await Promise.allSettled([
      api.devices.getAll(),
      organizationRequest,
    ]);
    if (deviceResult.status === 'fulfilled') {
      setDevices(Array.isArray(deviceResult.value.devices) ? deviceResult.value.devices : []);
    } else {
      setReferenceError(deviceResult.reason?.message || 'Device names could not be loaded.');
    }
    if (organizationResult.status === 'fulfilled') {
      const response = organizationResult.value;
      setOrganizations(Array.isArray(response.organizations)
        ? response.organizations
        : response.organization ? [response.organization] : []);
    } else if (isOrgAdmin) {
      setReferenceError(organizationResult.reason?.message || 'Organizations could not be loaded.');
    }
  }, [isAdmin, isOrgAdmin, user?.organizationId]);

  useEffect(() => {
    loadAlerts();
    loadRules();
    loadReferences();
    const pollTimer = window.setInterval(() => loadAlerts({ quiet: true }), 30000);
    let eventTimer = null;
    const unsubscribeAlert = wsService.on('alert', () => {
      window.clearTimeout(eventTimer);
      eventTimer = window.setTimeout(() => loadAlerts({ quiet: true }), 400);
    });
    const unsubscribeStatus = wsService.on('ws_status', status => setWsConnected(Boolean(status.connected)));
    setWsConnected(wsService.connected);
    wsService.connect('/ws/dashboard');
    return () => {
      window.clearInterval(pollTimer);
      window.clearTimeout(eventTimer);
      unsubscribeAlert();
      unsubscribeStatus();
      wsService.disconnect();
      alertRequest.current += 1;
      ruleRequest.current += 1;
    };
  }, [loadAlerts, loadReferences, loadRules]);

  const handleRangeChange = (range) => {
    setTimeRange(range);
    if (range !== 'custom') {
      setAppliedCustomDates({ from: '', to: '' });
      loadAlerts({ range, customFrom: '', customTo: '' });
    }
  };

  const handleApplyCustomDates = (e) => {
    if (e) e.preventDefault();
    if (!fromDate && !toDate) return;
    setTimeRange('custom');
    setAppliedCustomDates({ from: fromDate, to: toDate });
    loadAlerts({ range: 'custom', customFrom: fromDate, customTo: toDate });
  };

  const handleResetCustomDates = () => {
    setFromDate('');
    setToDate('');
    setAppliedCustomDates({ from: '', to: '' });
    setTimeRange('all');
    loadAlerts({ range: 'all', customFrom: '', customTo: '' });
  };

  const organizationOptions = useMemo(() => {
    const values = [...organizations];
    const currentId = String(user?.organizationId || '');
    if (currentId && !values.some(organization => String(organization._id) === currentId)) {
      values.push({ _id: currentId, name: user?.organizationName || currentId });
    }
    return values;
  }, [organizations, user]);

  const organizationIndex = useMemo(
    () => new Map(organizationOptions.map(organization => [String(organization._id), organization])),
    [organizationOptions]
  );
  const deviceIndex = useMemo(
    () => new Map(devices.map(device => [String(device._id || device.id), device])),
    [devices]
  );
  const ruleDeviceOptions = useMemo(() => devices.filter(device => (
    !ruleForm.organizationId || String(device.organizationId) === String(ruleForm.organizationId)
  )), [devices, ruleForm.organizationId]);

  const eventTypes = useMemo(() => [...new Set(alerts.map(alert => alert.eventType || alert.event_type).filter(Boolean))].sort(), [alerts]);
  const filteredAlerts = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return alerts.filter(alert => {
      const alertStatus = alert.status;
      const alertSeverity = alert.severity;
      const alertType = alert.eventType || alert.event_type;
      const devId = alert.deviceId || alert.device_id;

      if (filters.status && alertStatus !== filters.status) return false;
      if (filters.severity && alertSeverity !== filters.severity) return false;
      if (filters.eventType && alertType !== filters.eventType) return false;
      if (!search) return true;
      const device = deviceIndex.get(String(devId));
      return [alert._id, alert.id, devId, device?.name, alert.ruleName, alert.rule_id, alertType, alert.message]
        .some(value => String(value || '').toLowerCase().includes(search));
    });
  }, [alerts, deviceIndex, filters]);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadAlerts({ quiet: true }), loadRules({ quiet: true }), loadReferences()]);
    setRefreshing(false);
  };

  const updateAlertStatus = async (alertId, action) => {
    setMutatingAlert(`${action}:${alertId}`);
    setAlertsError('');
    try {
      const response = action === 'acknowledge'
        ? await api.alerts.acknowledge(alertId)
        : await api.alerts.resolve(alertId);
      const updated = response.alert;
      setAlerts(current => current.map(alert => ((alert._id === updated?._id || alert.id === updated?.id) ? updated : alert)));
      setNotice(action === 'acknowledge' ? 'Alert acknowledged.' : 'Alert resolved.');
      await loadAlerts({ quiet: true });
    } catch (error) {
      setAlertsError(error.message || `Unable to ${action} this alert.`);
    } finally {
      setMutatingAlert('');
    }
  };

  const resetRuleEditor = () => {
    setShowRuleForm(false);
    setEditingRuleId('');
    setRuleForm(blankRuleForm(isAdmin ? '' : String(user?.organizationId || '')));
    setRuleFormError('');
  };

  const openNewRule = () => {
    setActiveTab('rules');
    setEditingRuleId('');
    setRuleForm(blankRuleForm(isAdmin ? '' : String(user?.organizationId || '')));
    setRuleFormError('');
    setShowRuleForm(true);
  };

  const editRule = rule => {
    setEditingRuleId(String(rule._id || rule.id));
    setRuleForm({
      name: rule.name || '',
      organizationId: String(rule.organizationId || rule.org_id || (isAdmin ? '' : user?.organizationId || '')),
      deviceId: String(rule.deviceId || rule.device_id || ''),
      eventType: rule.eventType || rule.event_type || '',
      severity: rule.severity || 'HIGH',
      isActive: rule.isActive !== false && rule.enabled !== false,
      conditions: Array.isArray(rule.conditions) && rule.conditions.length
        ? rule.conditions.map(condition => ({ ...condition, value: String(condition.value ?? '') }))
        : [{ field: 'peak_g', operator: '>', value: '' }],
      actions: Array.isArray(rule.actions) ? rule.actions.filter(action => ACTIONS.includes(action)) : [],
    });
    setRuleFormError('');
    setShowRuleForm(true);
  };

  const setRuleField = (field, value) => {
    setRuleForm(current => ({ ...current, [field]: value }));
    setRuleFormError('');
  };

  const updateCondition = (index, field, value) => {
    setRuleForm(current => ({
      ...current,
      conditions: current.conditions.map((condition, conditionIndex) => (
        conditionIndex === index ? { ...condition, [field]: value } : condition
      )),
    }));
    setRuleFormError('');
  };

  const toggleAction = action => {
    setRuleForm(current => ({
      ...current,
      actions: current.actions.includes(action)
        ? current.actions.filter(value => value !== action)
        : [...current.actions, action],
    }));
  };

  const applyTemplate = template => {
    setRuleForm(current => ({
      ...current,
      ...template.values,
      organizationId: current.organizationId,
      deviceId: current.deviceId,
      eventType: '',
      isActive: true,
    }));
    setRuleFormError('');
  };

  const saveRule = async event => {
    event.preventDefault();
    setRuleFormError('');
    const name = ruleForm.name.trim();
    if (name.length < 2) {
      setRuleFormError('Rule name must contain at least 2 characters.');
      return;
    }
    if (!ruleForm.organizationId) {
      setRuleFormError('Select the organization that owns this rule.');
      return;
    }
    const conditions = ruleForm.conditions.map(condition => ({
      field: condition.field,
      operator: condition.operator,
      value: finiteNumber(condition.value),
    }));
    if (conditions.some(condition => !FIELD_OPTIONS.some(field => field.value === condition.field)
      || !OPERATORS.includes(condition.operator) || condition.value === null)) {
      setRuleFormError('Every condition requires a supported signal, operator, and numeric value.');
      return;
    }
    const payload = {
      name,
      organizationId: ruleForm.organizationId,
      deviceId: ruleForm.deviceId || null,
      eventType: ruleForm.eventType || null,
      severity: ruleForm.severity,
      isActive: ruleForm.isActive,
      conditions,
      actions: ruleForm.actions,
    };

    setSavingRule(true);
    try {
      if (editingRuleId) {
        const response = await api.alerts.updateRule(editingRuleId, payload);
        const updated = response.rule;
        setRules(current => current.map(item => ((String(item._id) === editingRuleId || String(item.id) === editingRuleId) ? updated : item)));
        setNotice('Safety rule updated.');
      } else {
        const response = await api.alerts.createRule(payload);
        setRules(current => [response.rule, ...current]);
        setNotice('Safety rule created.');
      }
      resetRuleEditor();
    } catch (error) {
      setRuleFormError(error.message || 'Unable to save this safety rule.');
    } finally {
      setSavingRule(false);
    }
  };

  const toggleRuleState = async rule => {
    const id = String(rule._id || rule.id);
    setMutatingRule(`toggle:${id}`);
    setRulesError('');
    try {
      const response = await api.alerts.updateRule(id, { isActive: !(rule.isActive !== false && rule.enabled !== false) });
      setRules(current => current.map(item => ((String(item._id) === id || String(item.id) === id) ? response.rule : item)));
      setNotice(response.rule.isActive ? 'Safety rule enabled.' : 'Safety rule paused.');
    } catch (error) {
      setRulesError(error.message || 'Unable to change rule status.');
    } finally {
      setMutatingRule('');
    }
  };

  const deleteRule = async rule => {
    if (!window.confirm(`Delete safety rule “${rule.name}”? This cannot be undone.`)) return;
    const id = String(rule._id || rule.id);
    setMutatingRule(`delete:${id}`);
    setRulesError('');
    try {
      await api.alerts.deleteRule(id);
      setRules(current => current.filter(item => (String(item._id) !== id && String(item.id) !== id)));
      if (editingRuleId === id) resetRuleEditor();
      setNotice('Safety rule deleted.');
    } catch (error) {
      setRulesError(error.message || 'Unable to delete this safety rule.');
    } finally {
      setMutatingRule('');
    }
  };

  const activeRuleCount = rules.filter(rule => rule.isActive !== false && rule.enabled !== false).length;

  return (
    <div className="space-y-6 text-text">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-danger"><ShieldCheck className="h-4 w-4" /> Operational safety</div>
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl"><BellRing className="h-7 w-7 text-danger" /> Alerts & Safety Engine</h1>
          <p className="mt-2 max-w-3xl text-sm text-text-muted">Review persisted alerts, respond to active incidents, and manage safety rules evaluated against incoming device telemetry.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${wsConnected ? 'border-emerald-500/30 bg-emerald-500/10 text-success' : 'border-amber-500/30 bg-amber-500/10 text-warning'}`}>
            {wsConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}{wsConnected ? 'Live alert stream' : 'Polling every 30 seconds'}
          </span>
          <button type="button" onClick={refreshAll} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold transition hover:bg-surface-2 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {isOrgAdmin && <button type="button" onClick={openNewRule} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500"><Plus className="h-4 w-4" /> New safety rule</button>}
        </div>
      </header>

      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-success">
          <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><X className="h-4 w-4" /></button>
        </div>
      )}
      {referenceError && <ErrorBanner title="Some reference data is unavailable" message={referenceError} onRetry={loadReferences} />}

      {/* Metric Summary Cards */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={AlertCircle} label="Active incidents" value={alertSummary.active || 0} detail="Awaiting acknowledgement" tone="text-danger" />
        <MetricCard icon={Clock3} label="Acknowledged" value={alertSummary.acknowledged || 0} detail="Open and under review" tone="text-warning" />
        <MetricCard icon={Zap} label="High-priority open" value={alertSummary.criticalOpen || 0} detail="High or critical severity" tone="text-danger" />
        <MetricCard icon={isOrgAdmin ? ShieldCheck : CheckCircle2} label={isOrgAdmin ? 'Active safety rules' : 'Resolved incidents'} value={isOrgAdmin ? activeRuleCount : alertSummary.resolved || 0} detail={isOrgAdmin ? `${rules.length} rules configured` : `${alertSummary.total || 0} total alert records`} tone="text-success" />
      </section>

      {/* Tabs & Date Range Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1 rounded-2xl border border-border bg-surface p-1.5">
          <button type="button" onClick={() => setActiveTab('alerts')} className={`flex-1 sm:flex-none rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'alerts' ? 'bg-indigo-600 text-white shadow' : 'text-text-muted hover:bg-surface-2 hover:text-text'}`}>Alert feed ({filteredAlerts.length})</button>
          {isOrgAdmin && <button type="button" onClick={() => setActiveTab('rules')} className={`flex-1 sm:flex-none rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'rules' ? 'bg-indigo-600 text-white shadow' : 'text-text-muted hover:bg-surface-2 hover:text-text'}`}>Safety rules ({rules.length})</button>}
        </div>

        {activeTab === 'alerts' && (
          <div className="flex flex-wrap items-center gap-1 bg-surface border border-border p-1 rounded-xl">
            <Calendar className="w-4 h-4 ml-2 mr-1 text-text-dim" />
            {TIME_RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => handleRangeChange(r.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${timeRange === r.value ? 'bg-indigo-600 text-white shadow-sm' : 'text-text-muted hover:text-text'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Custom Date Range Picker Form */}
      {activeTab === 'alerts' && timeRange === 'custom' && (
        <form onSubmit={handleApplyCustomDates} className="flex flex-wrap items-center gap-3 bg-surface border border-border rounded-2xl p-4 transition-all duration-300">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-warning" />
            <span className="text-xs font-semibold text-text-muted">Custom Date Filter:</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">From:</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="px-3 py-1.5 bg-surface-2 border border-border rounded-xl text-xs text-text focus:outline-none focus:border-indigo-500"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">To:</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="px-3 py-1.5 bg-surface-2 border border-border rounded-xl text-xs text-text focus:outline-none focus:border-indigo-500"
              required
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 bg-warning text-black rounded-xl text-xs font-semibold hover:bg-warning/90 transition shadow-sm"
          >
            Apply Range
          </button>
          {(appliedCustomDates.from || appliedCustomDates.to) && (
            <button
              type="button"
              onClick={handleResetCustomDates}
              className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-xl text-xs text-text-muted hover:text-text transition"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
          {appliedCustomDates.from && appliedCustomDates.to && (
            <span className="text-xs text-text-dim ml-auto">
              Showing alerts between <strong className="text-text">{appliedCustomDates.from}</strong> and <strong className="text-text">{appliedCustomDates.to}</strong> ({alerts.length} records found)
            </span>
          )}
        </form>
      )}

      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {alertsError && <ErrorBanner title="Alert records could not be loaded" message={alertsError} onRetry={() => loadAlerts()} />}
          <section className="rounded-2xl border border-border bg-surface p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_220px]">
              <label className="relative"><span className="sr-only">Search alerts</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-text-dim" /><input value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} className={`${inputClass} pl-9`} placeholder="Search device, rule, message, or ID" /></label>
              <label><span className="sr-only">Filter by status</span><select value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))} className={inputClass}><option value="">All statuses</option>{STATUSES.map(status => <option key={status} value={status}>{formatEventType(status)}</option>)}</select></label>
              <label><span className="sr-only">Filter by severity</span><select value={filters.severity} onChange={event => setFilters(current => ({ ...current, severity: event.target.value }))} className={inputClass}><option value="">All severities</option>{SEVERITIES.map(severity => <option key={severity}>{severity}</option>)}</select></label>
              <label><span className="sr-only">Filter by event type</span><select value={filters.eventType} onChange={event => setFilters(current => ({ ...current, eventType: event.target.value }))} className={inputClass}><option value="">All event types</option>{eventTypes.map(type => <option key={type} value={type}>{formatEventType(type)}</option>)}</select></label>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-text-muted"><span className="inline-flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" />Showing {filteredAlerts.length} of {alerts.length} loaded records</span>{Object.values(filters).some(Boolean) && <button type="button" onClick={() => setFilters({ search: '', status: '', severity: '', eventType: '' })} className="font-semibold text-info">Clear filters</button>}</div>
          </section>

          {alertsLoading && !alerts.length ? (
            <div className="flex min-h-64 items-center justify-center gap-3 rounded-3xl border border-border bg-surface text-sm text-text-muted"><LoaderCircle className="h-5 w-5 animate-spin text-info" />Loading persisted alerts…</div>
          ) : !filteredAlerts.length ? (
            <EmptyState title={alerts.length ? 'No alerts match these filters' : 'No alerts have been generated'} detail={alerts.length ? 'Clear or change the filters to review other records.' : 'The safety engine will list real incidents here when incoming telemetry triggers a built-in or configured rule.'} />
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map(alert => {
                const devId = alert.deviceId || alert.device_id;
                const device = deviceIndex.get(String(devId));
                const isBusy = mutatingAlert.endsWith(`:${alert._id || alert.id}`);
                const alertType = alert.eventType || alert.event_type;
                const createdTime = alert.createdAt || alert.created_at;

                return (
                  <article key={alert._id || alert.id} className={`rounded-2xl border bg-surface p-4 shadow-sm transition sm:p-5 ${alert.status === 'ACTIVE' ? 'border-rose-500/35' : 'border-border'}`}>
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${severityTone(alert.severity)}`}>{alert.severity || 'UNKNOWN'}</span>
                          <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${statusTone(alert.status)}`}>{alert.status || 'UNKNOWN'}</span>
                          <span className="rounded-lg bg-surface-2 px-2 py-1 text-[10px] font-semibold text-text-muted">{formatEventType(alertType)}</span>
                        </div>
                        <h2 className="mt-3 text-base font-semibold">{alert.message || alert.ruleName || 'Safety alert'}</h2>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-muted">
                          <span>Device: <strong className="text-text">{device?.name || devId || 'Unknown device'}</strong>{device?.name && <span className="ml-1 font-mono">({devId})</span>}</span>
                          <span>Location: <strong className="text-text">{device?.location || 'Unassigned'}</strong></span>
                          <span>Time: <strong className="text-text">{formatDate(createdTime)}</strong></span>
                          {alert.ruleName && <span>Rule: <strong className="text-text">{alert.ruleName}</strong></span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {alert.status === 'ACTIVE' && (
                          <button type="button" onClick={() => updateAlertStatus(alert._id || alert.id, 'acknowledge')} disabled={isBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-text transition hover:bg-surface-3 disabled:opacity-60">
                            {isBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Clock3 className="h-3.5 w-3.5" />} Acknowledge
                          </button>
                        )}
                        {alert.status !== 'RESOLVED' && (
                          <button type="button" onClick={() => updateAlertStatus(alert._id || alert.id, 'resolve')} disabled={isBusy} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-emerald-500 disabled:opacity-60">
                            {isBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'rules' && isOrgAdmin && (
        <div className="space-y-4">
          {rulesError && <ErrorBanner title="Safety rules could not be loaded" message={rulesError} onRetry={() => loadRules()} />}

          {showRuleForm && (
            <form onSubmit={saveRule} className="rounded-3xl border border-border bg-surface p-5 sm:p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-bold">{editingRuleId ? 'Edit Safety Rule' : 'Create Safety Rule'}</h2>
                  <p className="text-xs text-text-muted mt-0.5">Define automated threshold triggers for real-time telemetry events.</p>
                </div>
                <button type="button" onClick={resetRuleEditor} className="p-2 rounded-xl border border-border hover:bg-surface-2"><X className="w-4 h-4" /></button>
              </div>

              {ruleFormError && <ErrorBanner title="Please check rule inputs" message={ruleFormError} />}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1.5">Rule Name *</label>
                  <input
                    value={ruleForm.name}
                    onChange={e => setRuleField('name', e.target.value)}
                    placeholder="e.g. Critical Impact Alert"
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1.5">Severity *</label>
                  <select
                    value={ruleForm.severity}
                    onChange={e => setRuleField('severity', e.target.value)}
                    className={inputClass}
                  >
                    {SEVERITIES.map(sev => <option key={sev} value={sev}>{sev}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1.5">Applies to Device</label>
                  <select
                    value={ruleForm.deviceId}
                    onChange={e => setRuleField('deviceId', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">All Organization Devices</option>
                    {ruleDeviceOptions.map(d => (
                      <option key={d._id || d.id} value={d._id || d.id}>{d.name || d._id || d.id}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1.5">Event Type Trigger</label>
                  <select
                    value={ruleForm.eventType}
                    onChange={e => setRuleField('eventType', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Any Event Type</option>
                    {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-6">
                  <button
                    type="button"
                    onClick={() => setRuleField('isActive', !ruleForm.isActive)}
                    className="flex items-center gap-2 text-sm font-medium"
                  >
                    {ruleForm.isActive ? <ToggleRight className="w-6 h-6 text-emerald-500" /> : <ToggleLeft className="w-6 h-6 text-text-dim" />}
                    <span>{ruleForm.isActive ? 'Active Rule' : 'Rule Paused'}</span>
                  </button>
                </div>
              </div>

              {/* Conditions Section */}
              <div className="space-y-3 pt-2">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider">Trigger Conditions</label>
                {ruleForm.conditions.map((cond, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 bg-surface-2 rounded-2xl border border-border">
                    <select
                      value={cond.field}
                      onChange={e => updateCondition(idx, 'field', e.target.value)}
                      className="px-3 py-2 bg-surface border border-border rounded-xl text-xs text-text focus:outline-none"
                    >
                      {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>

                    <select
                      value={cond.operator}
                      onChange={e => updateCondition(idx, 'operator', e.target.value)}
                      className="px-3 py-2 bg-surface border border-border rounded-xl text-xs text-text focus:outline-none font-mono"
                    >
                      {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>

                    <input
                      type="number"
                      step="any"
                      placeholder="Threshold Value"
                      value={cond.value}
                      onChange={e => updateCondition(idx, 'value', e.target.value)}
                      className="px-3 py-2 bg-surface border border-border rounded-xl text-xs text-text focus:outline-none flex-1 min-w-[120px]"
                      required
                    />

                    {ruleForm.conditions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setRuleForm(c => ({ ...c, conditions: c.conditions.filter((_, i) => i !== idx) }))}
                        className="p-2 text-danger hover:bg-surface rounded-xl"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Actions Section */}
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider">Notification Actions</label>
                <div className="flex flex-wrap gap-2">
                  {ACTIONS.map(action => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => toggleAction(action)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${ruleForm.actions.includes(action) ? 'border-indigo-600 bg-indigo-600/10 text-indigo-400' : 'border-border bg-surface-2 text-text-muted hover:text-text'}`}
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={resetRuleEditor}
                  className="px-4 py-2 border border-border rounded-xl text-xs text-text-muted hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRule}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-500 disabled:opacity-50"
                >
                  {savingRule ? 'Saving Rule...' : editingRuleId ? 'Update Safety Rule' : 'Save Safety Rule'}
                </button>
              </div>
            </form>
          )}

          {/* Existing Rules List */}
          <div className="space-y-3">
            {rulesLoading && !rules.length ? (
              <div className="flex min-h-48 items-center justify-center gap-3 rounded-3xl border border-border bg-surface text-sm text-text-muted"><LoaderCircle className="h-5 w-5 animate-spin text-info" />Loading safety rules…</div>
            ) : !rules.length ? (
              <EmptyState title="No safety rules configured" detail="Create safety rules to automatically evaluate incoming sensor packets and trigger incidents." />
            ) : (
              rules.map(rule => {
                const id = String(rule._id || rule.id);
                const isBusy = mutatingRule.endsWith(`:${id}`);
                const isEnabled = rule.isActive !== false && rule.enabled !== false;
                const dev = deviceIndex.get(String(rule.deviceId || rule.device_id));

                return (
                  <article key={id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${severityTone(rule.severity)}`}>{rule.severity || 'CRITICAL'}</span>
                        <h3 className="font-semibold text-base">{rule.name}</h3>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${isEnabled ? 'bg-emerald-500/10 text-success' : 'bg-surface-2 text-text-dim'}`}>{isEnabled ? 'ACTIVE' : 'PAUSED'}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted mt-1">
                        <span>Event: <strong className="text-text">{rule.eventType || rule.event_type || 'ANY'}</strong></span>
                        <span>Device: <strong className="text-text">{dev?.name || rule.deviceId || rule.device_id || 'All Devices'}</strong></span>
                        <span>Peak G: <strong className="text-text">&gt;= {rule.min_peak_g ?? '--'} G</strong></span>
                        <span>Duration: <strong className="text-text">&gt;= {rule.min_dur_ms ?? '--'} ms</strong></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => toggleRuleState(rule)}
                        disabled={isBusy}
                        title={isEnabled ? 'Pause rule' : 'Enable rule'}
                        className="p-2 border border-border rounded-xl hover:bg-surface-2 text-text-muted hover:text-text disabled:opacity-50"
                      >
                        {isEnabled ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => editRule(rule)}
                        disabled={isBusy}
                        title="Edit rule"
                        className="p-2 border border-border rounded-xl hover:bg-surface-2 text-text-muted hover:text-text disabled:opacity-50"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRule(rule)}
                        disabled={isBusy}
                        title="Delete rule"
                        className="p-2 border border-border rounded-xl hover:bg-danger/10 text-danger disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
