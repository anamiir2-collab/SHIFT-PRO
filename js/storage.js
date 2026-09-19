/* ShiftPro - Storage & Migration Layer
   Wraps localStorage with versioned schemas and an automatic migration
   from the legacy v1 keys (shift_calendar_*) to the new v2 schema.

   Public API: window.SPStorage
   - getSettings(), saveSettings(partial)
   - getAttendance(), getEntry(dstr), setEntry(dstr, entry), deleteEntry(dstr)
   - getSchedule(), getScheduledCode(date), setSchedule(dstr, code)
   - getShifts(), getShiftById(id), getShiftByCode(code), saveShifts(arr)
   - getAdjustments(), addAdjustment(adj), deleteAdjustment(id), getAdjustmentsForDate(dstr)
   - getLeaveBalance(), saveLeaveBalance(bal)
   - getMeta(key), setMeta(key, val)
   - exportAll(), importAll(json), clearAll()
   - subscribe(cb)  // notify on any change
*/
(function (global) {
  'use strict';

  // ---------- Legacy keys (kept readable for backward compatibility) ----------
  const LEGACY = {
    settings: 'shift_calendar_settings_v1',
    attendance: 'shift_calendar_attendance_v1',
    schedule: 'shift_calendar_schedule_override_v1'
  };

  // ---------- New v2 keys ----------
  const K = {
    settings: 'shifpro_settings_v2',
    attendance: 'shifpro_attendance_v2',
    schedule: 'shifpro_schedule_v2',
    shifts: 'shifpro_shifts_v2',
    adjustments: 'shifpro_adjustments_v2',
    leaveBalance: 'shifpro_leave_balance_v2',
    meta: 'shifpro_meta_v2'
  };

  // ---------- Defaults ----------
  const DEFAULT_SETTINGS = {
    // Employee
    name: 'موظف',
    job: '',
    company: '',
    employeeId: '',
    // Salary
    salary: 6000,
    salaryMethod: 'monthly', // monthly | hourly | daily | shift
    monthlyHours: 208,
    shiftHours: 12,
    hourlyRate: 0,           // 0 = auto-compute from salary/monthlyHours
    overtimeEnabled: true,
    overtimeRate: 1.5,
    overtimeAfterHours: 0,   // 0 = use shiftHours as threshold
    // Deductions
    deductAbsence: true,
    deductLate: false,
    lateGraceMinutes: 0,
    // Pay cycle
    cycleDay: 26,
    // Theme & UI
    theme: 'auto',           // auto | dark | light
    fontSize: 'medium',      // small | medium | large
    // Notifications
    notifyCheckIn: false,
    notifyCheckOut: false,
    notifyShiftEnd: false,
    notifyCheckInTime: '07:00',
    notifyCheckOutTime: '19:00',
    // Misc
    currency: 'ج',
    schemaVersion: 2
  };

  // Built-in shift types (D/N/O for backward compat with v1 codes)
  const DEFAULT_SHIFTS = [
    {
      id: 'day',
      name: 'نهار',
      code: 'D',
      startTime: '07:00',
      endTime: '19:00',
      hours: 12,
      color: '#60a5fa',
      isWorkDay: true,
      isBuiltIn: true,
      icon: 'sun'
    },
    {
      id: 'night',
      name: 'ليل',
      code: 'N',
      startTime: '19:00',
      endTime: '07:00',
      hours: 12,
      color: '#2563eb',
      isWorkDay: true,
      isBuiltIn: true,
      icon: 'moon'
    },
    {
      id: 'off',
      name: 'إجازة دورية',
      code: 'O',
      startTime: '',
      endTime: '',
      hours: 0,
      color: '#38bdf8',
      isWorkDay: false,
      isBuiltIn: true,
      icon: 'rest'
    },
    {
      id: 'shift24',
      name: 'مطبق 24 ساعة',
      code: 'X',
      startTime: '07:00',
      endTime: '07:00',
      hours: 24,
      color: '#1e40af',
      isWorkDay: true,
      isBuiltIn: true,
      icon: 'double'
    }
  ];

  const DEFAULT_LEAVE_BALANCE = {
    annual: { total: 21, used: 0 },
    casual: { total: 7, used: 0 },
    sick: { total: 30, used: 0 },
    unpaid: { total: 0, used: 0 },
    periodic: { total: 0, used: 0 }
  };

  // ---------- Safe JSON localStorage ----------
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Storage] Failed to parse', key, e);
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[Storage] Failed to write', key, e);
      // Likely quota exceeded
      if (global.SPUtils && SPUtils.toast) {
        SPUtils.toast('تعذّر حفظ البيانات — مساحة التخزين ممتلئة', 'error');
      }
      return false;
    }
  }

  // ---------- Migration from v1 ----------
  function migrateFromV1() {
    const meta = readJSON(K.meta, null);
    if (meta && meta.migratedFromV1) return; // already migrated

    // Settings
    const legacySettings = readJSON(LEGACY.settings, null);
    const newSettingsExists = readJSON(K.settings, null) != null;
    if (legacySettings && !newSettingsExists) {
      const merged = Object.assign({}, DEFAULT_SETTINGS, legacySettings);
      merged.schemaVersion = 2;
      writeJSON(K.settings, merged);
    } else if (!newSettingsExists) {
      writeJSON(K.settings, Object.assign({}, DEFAULT_SETTINGS));
    }

    // Attendance — copy as-is (entries are backward compatible)
    const legacyAtt = readJSON(LEGACY.attendance, null);
    const newAttExists = readJSON(K.attendance, null) != null;
    if (legacyAtt && !newAttExists) {
      writeJSON(K.attendance, legacyAtt);
    } else if (!newAttExists) {
      writeJSON(K.attendance, {});
    }

    // Schedule — copy as-is
    const legacySched = readJSON(LEGACY.schedule, null);
    const newSchedExists = readJSON(K.schedule, null) != null;
    if (legacySched && !newSchedExists) {
      writeJSON(K.schedule, legacySched);
    } else if (!newSchedExists) {
      writeJSON(K.schedule, {});
    }

    // Shifts, adjustments, leave balance, meta — initialize defaults
    if (readJSON(K.shifts, null) == null) writeJSON(K.shifts, DEFAULT_SHIFTS.slice());
    if (readJSON(K.adjustments, null) == null) writeJSON(K.adjustments, []);
    if (readJSON(K.leaveBalance, null) == null) writeJSON(K.leaveBalance, Object.assign({}, DEFAULT_LEAVE_BALANCE));

    writeJSON(K.meta, {
      migratedFromV1: true,
      schemaVersion: 2,
      installedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      appVersion: '2.0.0'
    });
  }

  // ---------- Pub/Sub for change notifications ----------
  const subscribers = [];
  function subscribe(cb) {
    subscribers.push(cb);
    return () => {
      const i = subscribers.indexOf(cb);
      if (i >= 0) subscribers.splice(i, 1);
    };
  }
  function notify() {
    subscribers.forEach((cb) => {
      try { cb(); } catch (e) { console.error(e); }
    });
  }

  // ---------- Settings ----------
  function getSettings() {
    const s = readJSON(K.settings, null);
    if (!s) return Object.assign({}, DEFAULT_SETTINGS);
    // Backfill any missing keys (forward-compatible)
    return Object.assign({}, DEFAULT_SETTINGS, s);
  }
  function saveSettings(partial) {
    const merged = Object.assign({}, getSettings(), partial || {});
    merged.schemaVersion = 2;
    writeJSON(K.settings, merged);
    notify();
    return merged;
  }

  // ---------- Attendance ----------
  function getAttendance() {
    return readJSON(K.attendance, {});
  }
  function getEntry(dstr) {
    const att = getAttendance();
    const v = att[dstr];
    if (!v) return null;
    if (typeof v === 'string') return { status: v }; // legacy
    return v;
  }
  function setEntry(dstr, entry) {
    const att = getAttendance();
    att[dstr] = entry;
    writeJSON(K.attendance, att);
    notify();
  }
  function deleteEntry(dstr) {
    const att = getAttendance();
    delete att[dstr];
    writeJSON(K.attendance, att);
    notify();
  }

  // ---------- Schedule ----------
  function getSchedule() {
    return readJSON(K.schedule, {});
  }
  function getScheduledCode(date) {
    const dstr = (typeof date === 'string') ? date : SPUtils.fmtDate(date);
    return getSchedule()[dstr] || null;
  }
  function setSchedule(dstr, code) {
    const sch = getSchedule();
    if (code) sch[dstr] = code;
    else delete sch[dstr];
    writeJSON(K.schedule, sch);
    notify();
  }
  function setScheduleMany(entries) {
    // entries: { dstr: code, ... } — null/undefined code deletes
    const sch = getSchedule();
    Object.keys(entries).forEach((dstr) => {
      const code = entries[dstr];
      if (code) sch[dstr] = code;
      else delete sch[dstr];
    });
    writeJSON(K.schedule, sch);
    notify();
  }

  // ---------- Shift types ----------
  function getShifts() {
    const arr = readJSON(K.shifts, null);
    if (!arr || !Array.isArray(arr) || arr.length === 0) {
      writeJSON(K.shifts, DEFAULT_SHIFTS.slice());
      return DEFAULT_SHIFTS.slice();
    }
    return arr;
  }
  function getShiftById(id) {
    return getShifts().find((s) => s.id === id) || null;
  }
  function getShiftByCode(code) {
    if (!code) return null;
    return getShifts().find((s) => s.code === code) || null;
  }
  function saveShifts(arr) {
    writeJSON(K.shifts, arr);
    notify();
  }
  function upsertShift(shift) {
    const arr = getShifts();
    const i = arr.findIndex((s) => s.id === shift.id);
    if (i >= 0) arr[i] = shift;
    else arr.push(shift);
    saveShifts(arr);
  }
  function deleteShift(id) {
    const arr = getShifts().filter((s) => s.id !== id);
    saveShifts(arr);
  }

  // ---------- Adjustments (bonus / allowance / deduction / advance) ----------
  function getAdjustments() {
    return readJSON(K.adjustments, []);
  }
  function getAdjustmentsForDate(dstr) {
    return getAdjustments().filter((a) => a.date === dstr);
  }
  function addAdjustment(adj) {
    const arr = getAdjustments();
    if (!adj.id) adj.id = SPUtils.uuid();
    if (!adj.createdAt) adj.createdAt = new Date().toISOString();
    arr.push(adj);
    writeJSON(K.adjustments, arr);
    notify();
    return adj;
  }
  function deleteAdjustment(id) {
    const arr = getAdjustments().filter((a) => a.id !== id);
    writeJSON(K.adjustments, arr);
    notify();
  }

  // ---------- Leave balance ----------
  function getLeaveBalance() {
    return Object.assign({}, DEFAULT_LEAVE_BALANCE, readJSON(K.leaveBalance, {}));
  }
  function saveLeaveBalance(bal) {
    writeJSON(K.leaveBalance, bal);
    notify();
  }

  // ---------- Meta ----------
  function getMeta(key) {
    const m = readJSON(K.meta, {});
    return key ? m[key] : m;
  }
  function setMeta(key, val) {
    const m = readJSON(K.meta, {});
    m[key] = val;
    writeJSON(K.meta, m);
    // Meta changes don't notify subscribers (internal state)
  }

  // ---------- Backup / Restore / Clear ----------
  function exportAll() {
    return {
      app: 'ShiftPro',
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      data: {
        settings: getSettings(),
        attendance: getAttendance(),
        schedule: getSchedule(),
        shifts: getShifts(),
        adjustments: getAdjustments(),
        leaveBalance: getLeaveBalance(),
        meta: getMeta()
      }
    };
  }

  function importAll(json) {
    if (!json || !json.data) throw new Error('ملف النسخة الاحتياطية غير صالح');
    const d = json.data;
    if (d.settings) writeJSON(K.settings, Object.assign({}, DEFAULT_SETTINGS, d.settings));
    if (d.attendance && typeof d.attendance === 'object') writeJSON(K.attendance, d.attendance);
    if (d.schedule && typeof d.schedule === 'object') writeJSON(K.schedule, d.schedule);
    if (Array.isArray(d.shifts)) writeJSON(K.shifts, d.shifts);
    if (Array.isArray(d.adjustments)) writeJSON(K.adjustments, d.adjustments);
    if (d.leaveBalance) writeJSON(K.leaveBalance, d.leaveBalance);
    if (d.meta) writeJSON(K.meta, d.meta);
    notify();
    return true;
  }

  function clearAll() {
    Object.keys(K).forEach((k) => localStorage.removeItem(K[k]));
    // Re-init defaults
    migrateFromV1();
    notify();
  }

  // ---------- Init ----------
  function init() {
    migrateFromV1();
    setMeta('lastOpenedAt', new Date().toISOString());
  }

  global.SPStorage = {
    KEYS: K,
    LEGACY_KEYS: LEGACY,
    DEFAULT_SETTINGS,
    DEFAULT_SHIFTS,
    DEFAULT_LEAVE_BALANCE,
    init,
    subscribe,
    // Settings
    getSettings, saveSettings,
    // Attendance
    getAttendance, getEntry, setEntry, deleteEntry,
    // Schedule
    getSchedule, getScheduledCode, setSchedule, setScheduleMany,
    // Shifts
    getShifts, getShiftById, getShiftByCode, saveShifts, upsertShift, deleteShift,
    // Adjustments
    getAdjustments, getAdjustmentsForDate, addAdjustment, deleteAdjustment,
    // Leave balance
    getLeaveBalance, saveLeaveBalance,
    // Meta
    getMeta, setMeta,
    // Backup
    exportAll, importAll, clearAll
  };
})(window);
