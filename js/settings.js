/* ShiftPro - Settings Module
   Handles: general settings sheet, shift manager, leave balance,
   stats, backup/restore, about, theme switching, font size.
   Exposes: window.SPSettings
*/
(function (global) {
  'use strict';

  const { $, el, fmtDate, parseDate, fmtNum, fmtCurrency, toast, confirmDialog,
    onClickOnce, haptic } = SPUtils;
  const storage = SPStorage;

  // ---------- Theme & font size ----------
  function applyTheme() {
    const s = storage.getSettings();
    document.documentElement.dataset.theme = s.theme || 'auto';
    document.documentElement.dataset.fontsize = s.fontSize || 'medium';
    // Update meta theme-color for status bar
    const meta = $('#metaTheme');
    if (meta) {
      const isDark = s.theme === 'dark' ||
        (s.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      meta.content = isDark ? '#071426' : '#2563eb';
    }
    // Update theme toggle icon
    const icon = $('#themeIcon');
    if (icon) {
      if (s.theme === 'light') {
        icon.innerHTML = '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>';
      } else {
        icon.innerHTML = '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"></path>';
      }
    }
  }

  function cycleTheme() {
    const s = storage.getSettings();
    const order = ['auto', 'dark', 'light'];
    const i = order.indexOf(s.theme || 'auto');
    const next = order[(i + 1) % 3];
    storage.saveSettings({ theme: next });
    applyTheme();
    haptic(10);
    toast('الوضع: ' + (next === 'auto' ? 'تلقائي' : next === 'dark' ? 'داكن' : 'نهاري'), 'info');
  }

  // ---------- General settings sheet ----------
  function openSettingsSheet() {
    const s = storage.getSettings();
    $('#inpName').value = s.name || '';
    $('#inpJob').value = s.job || '';
    $('#inpEmployeeId').value = s.employeeId || '';
    $('#inpCompany').value = s.company || '';
    $('#inpSalaryMethod').value = s.salaryMethod || 'monthly';
    $('#inpSalary').value = s.salary || '';
    $('#inpMonthlyHours').value = s.monthlyHours || '';
    $('#inpShiftHours').value = s.shiftHours || '';
    $('#inpHourlyRate').value = s.hourlyRate || '';
    $('#inpOvertimeEnabled').checked = !!s.overtimeEnabled;
    $('#inpOvertimeRate').value = s.overtimeRate || 1.5;
    $('#inpOvertimeAfterHours').value = s.overtimeAfterHours || '';
    $('#inpDeductAbsence').checked = !!s.deductAbsence;
    $('#inpDeductLate').checked = !!s.deductLate;
    $('#inpLateGrace').value = s.lateGraceMinutes || 0;
    $('#inpCycleDay').value = s.cycleDay || 26;
    $('#inpTheme').value = s.theme || 'auto';
    $('#inpFontSize').value = s.fontSize || 'medium';
    $('#inpNotifyCheckIn').checked = !!s.notifyCheckIn;
    $('#inpNotifyCheckInTime').value = s.notifyCheckInTime || '07:00';
    $('#inpNotifyCheckOut').checked = !!s.notifyCheckOut;
    $('#inpNotifyCheckOutTime').value = s.notifyCheckOutTime || '19:00';
    $('#inpNotifyShiftEnd').checked = !!s.notifyShiftEnd;

    $('#settingsOverlay').classList.add('show');
    $('#settingsSheet').classList.add('show');
  }
  function closeSettingsSheet() {
    $('#settingsOverlay').classList.remove('show');
    $('#settingsSheet').classList.remove('show');
  }
  function saveSettings() {
    let cycleDay = Number($('#inpCycleDay').value) || 26;
    if (cycleDay < 1) cycleDay = 1;
    if (cycleDay > 28) cycleDay = 28;
    const s = {
      name: $('#inpName').value.trim() || 'موظف',
      job: $('#inpJob').value.trim(),
      employeeId: $('#inpEmployeeId').value.trim(),
      company: $('#inpCompany').value.trim(),
      salaryMethod: $('#inpSalaryMethod').value,
      salary: Number($('#inpSalary').value) || 0,
      monthlyHours: Number($('#inpMonthlyHours').value) || 208,
      shiftHours: Number($('#inpShiftHours').value) || 12,
      hourlyRate: Number($('#inpHourlyRate').value) || 0,
      overtimeEnabled: $('#inpOvertimeEnabled').checked,
      overtimeRate: Number($('#inpOvertimeRate').value) || 1.5,
      overtimeAfterHours: Number($('#inpOvertimeAfterHours').value) || 0,
      deductAbsence: $('#inpDeductAbsence').checked,
      deductLate: $('#inpDeductLate').checked,
      lateGraceMinutes: Number($('#inpLateGrace').value) || 0,
      cycleDay,
      theme: $('#inpTheme').value,
      fontSize: $('#inpFontSize').value,
      notifyCheckIn: $('#inpNotifyCheckIn').checked,
      notifyCheckInTime: $('#inpNotifyCheckInTime').value || '07:00',
      notifyCheckOut: $('#inpNotifyCheckOut').checked,
      notifyCheckOutTime: $('#inpNotifyCheckOutTime').value || '19:00',
      notifyShiftEnd: $('#inpNotifyShiftEnd').checked
    };
    storage.saveSettings(s);
    applyTheme();
    closeSettingsSheet();
    toast('تم حفظ الإعدادات', 'success');
    SPApp.onDataChange();
  }

  // ---------- Shift Manager ----------
  function openShiftsSheet() {
    renderShiftsList();
    $('#shiftsOverlay').classList.add('show');
    $('#shiftsSheet').classList.add('show');
  }
  function closeShiftsSheet() {
    $('#shiftsOverlay').classList.remove('show');
    $('#shiftsSheet').classList.remove('show');
  }
  function renderShiftsList() {
    const list = $('#shiftsList');
    list.innerHTML = '';
    const shifts = storage.getShifts();
    shifts.forEach((s) => {
      const row = el('div', { class: 'setting-row', style: 'border:1px solid var(--line);border-radius:var(--r-md);padding:10px 12px;margin-bottom:8px;' });
      const meta = el('div', { class: 'meta' });
      meta.appendChild(el('div', { class: 'row gap-2' }, [
        el('span', { class: 'tag-dot', style: `background:${s.color}` }),
        el('div', { class: 't1' }, [s.name + ' (' + s.code + ')'])
      ]));
      meta.appendChild(el('div', { class: 't2' }, [
        s.startTime ? `${s.startTime} - ${s.endTime} (${s.hours} س)` : 'وردية إجازة',
        ' • ',
        s.isWorkDay ? 'يوم عمل' : 'إجازة'
      ]));
      row.appendChild(meta);
      // Edit button
      const editBtn = el('button', { class: 'icon-btn', style: 'width:36px;height:36px;', 'aria-label': 'تعديل' });
      editBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>';
      editBtn.addEventListener('click', () => openShiftEditor(s));
      row.appendChild(editBtn);
      // Delete button (disabled for built-in)
      if (!s.isBuiltIn) {
        const delBtn = el('button', { class: 'icon-btn', style: 'width:36px;height:36px;color:var(--danger);', 'aria-label': 'حذف' }, ['×']);
        delBtn.addEventListener('click', async () => {
          const ok = await confirmDialog(`حذف وردية "${s.name}"؟`, { okText: 'حذف', danger: true });
          if (ok) {
            storage.deleteShift(s.id);
            renderShiftsList();
            SPApp.onDataChange();
            toast('تم حذف الوردية', 'success');
          }
        });
        row.appendChild(delBtn);
      }
      list.appendChild(row);
    });
  }

  // ---------- Shift Editor ----------
  function openShiftEditor(shift) {
    const isNew = !shift;
    $('#shiftEditTitle').textContent = isNew ? 'وردية جديدة' : 'تعديل الوردية';
    $('#shiftName').value = shift ? shift.name : '';
    $('#shiftCode').value = shift ? shift.code : '';
    $('#shiftStart').value = shift ? shift.startTime : '';
    $('#shiftEnd').value = shift ? shift.endTime : '';
    $('#shiftHours').value = shift ? shift.hours : 0;
    $('#shiftColor').value = shift ? shift.color : '#3b82f6';
    $('#shiftIsWorkDay').checked = shift ? shift.isWorkDay : true;
    // Store id for save
    $('#shiftEditSheet').dataset.editId = shift ? shift.id : '';
    $('#shiftEditOverlay').classList.add('show');
    $('#shiftEditSheet').classList.add('show');
  }
  function closeShiftEditor() {
    $('#shiftEditOverlay').classList.remove('show');
    $('#shiftEditSheet').classList.remove('show');
  }
  function saveShift() {
    const name = $('#shiftName').value.trim();
    const code = $('#shiftCode').value.trim().toUpperCase();
    if (!name) { toast('أدخل اسم الوردية', 'warning'); return; }
    if (!code) { toast('أدخل رمز الوردية', 'warning'); return; }
    const start = $('#shiftStart').value;
    const end = $('#shiftEnd').value;
    let hours = Number($('#shiftHours').value) || 0;
    if (!hours && start && end) {
      hours = SPUtils.computeRangeHours(start, end);
    }
    const id = $('#shiftEditSheet').dataset.editId || ('s-' + Date.now().toString(36));
    const existing = storage.getShiftById(id);
    const shift = {
      id,
      name,
      code,
      startTime: start,
      endTime: end,
      hours,
      color: $('#shiftColor').value,
      isWorkDay: $('#shiftIsWorkDay').checked,
      isBuiltIn: existing ? existing.isBuiltIn : false
    };
    storage.upsertShift(shift);
    closeShiftEditor();
    renderShiftsList();
    SPApp.onDataChange();
    toast('تم حفظ الوردية', 'success');
  }

  // ---------- Pattern application ----------
  function applyPattern() {
    const startDate = $('#patternStart').value;
    const seqStr = $('#patternSeq').value.trim().toUpperCase();
    if (!startDate) { toast('حدد يوم البداية', 'warning'); return; }
    const codes = seqStr.split(',').map((s) => s.trim()).filter(Boolean);
    if (codes.length === 0) { toast('أدخل تسلسل الورديات (مثال: D,N,O)', 'warning'); return; }
    // Validate codes
    const allCodes = storage.getShifts().map((s) => s.code);
    const invalid = codes.find((c) => !allCodes.includes(c));
    if (invalid) { toast(`رمز غير معروف: ${invalid}`, 'error'); return; }
    const start = parseDate(startDate);
    const entries = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      entries[fmtDate(d)] = codes[i % codes.length];
    }
    storage.setScheduleMany(entries);
    toast('تم تطبيق النمط على 30 يوم', 'success');
    closeShiftsSheet();
    SPApp.onDataChange();
  }
  function clearPattern() {
    // Just clear the input fields
    $('#patternStart').value = '';
    $('#patternSeq').value = '';
    toast('تم مسح النمط (لإزالة التطبيق حدد الأيام يدويًا)', 'info');
  }

  // ---------- Leave Balance ----------
  function openLeaveSheet() {
    renderLeaveBalance();
    renderLeaveRecords();
    $('#leaveOverlay').classList.add('show');
    $('#leaveSheet').classList.add('show');
  }
  function closeLeaveSheet() {
    $('#leaveOverlay').classList.remove('show');
    $('#leaveSheet').classList.remove('show');
  }
  function renderLeaveBalance() {
    const list = $('#leaveBalanceList');
    list.innerHTML = '';
    const bal = storage.getLeaveBalance();
    const types = [
      { key: 'annual', label: 'إجازة سنوية' },
      { key: 'casual', label: 'إجازة عارضة' },
      { key: 'sick', label: 'إجازة مرضية' },
      { key: 'unpaid', label: 'إجازة بدون راتب' },
      { key: 'periodic', label: 'إجازة دورية' }
    ];
    types.forEach((t) => {
      const v = bal[t.key] || { total: 0, used: 0 };
      const remaining = (v.total || 0) - (v.used || 0);
      const row = el('div', { class: 'card compact mb-2' });
      row.appendChild(el('div', { class: 'row between mb-2' }, [
        el('strong', { class: 'fs-md' }, [t.label]),
        el('span', { class: 'chip' }, [`${v.used} / ${v.total}`])
      ]));
      // Inputs
      const inputs = el('div', { class: 'field-row' });
      const totalField = el('div', { class: 'field' });
      totalField.appendChild(el('label', {}, ['الرصيد الكلي']));
      const totalInput = el('input', { type: 'number', value: v.total || 0, 'data-leave-key': t.key, 'data-leave-field': 'total' });
      totalField.appendChild(totalInput);
      const usedField = el('div', { class: 'field' });
      usedField.appendChild(el('label', {}, ['المستخدم']));
      const usedInput = el('input', { type: 'number', value: v.used || 0, 'data-leave-key': t.key, 'data-leave-field': 'used' });
      usedField.appendChild(usedInput);
      inputs.appendChild(totalField);
      inputs.appendChild(usedField);
      row.appendChild(inputs);
      row.appendChild(el('div', { class: 'row between mt-2' }, [
        el('span', { class: 'fs-sm muted' }, ['المتبقي']),
        el('strong', { class: remaining > 0 ? 'success' : 'danger' }, [remaining + ' يوم'])
      ]));
      list.appendChild(row);
    });
    // Save button
    const saveBtn = el('button', { class: 'btn primary block sm mt-2' }, ['حفظ الأرصدة']);
    saveBtn.addEventListener('click', saveLeaveBalance);
    list.appendChild(saveBtn);

    // Attach listeners
    list.querySelectorAll('input[data-leave-key]').forEach((inp) => {
      inp.addEventListener('change', () => {
        // just update on save
      });
    });
  }
  function saveLeaveBalance() {
    const bal = storage.getLeaveBalance();
    document.querySelectorAll('[data-leave-key]').forEach((inp) => {
      const key = inp.dataset.leaveKey;
      const field = inp.dataset.leaveField;
      const val = Number(inp.value) || 0;
      if (!bal[key]) bal[key] = { total: 0, used: 0 };
      bal[key][field] = val;
    });
    storage.saveLeaveBalance(bal);
    toast('تم حفظ أرصدة الإجازات', 'success');
    renderLeaveBalance();
  }
  function renderLeaveRecords() {
    const list = $('#leaveRecordsList');
    list.innerHTML = '';
    const att = storage.getAttendance();
    const records = Object.entries(att)
      .filter(([_, e]) => e && e.status === 'L')
      .sort((a, b) => b[0].localeCompare(a[0]));
    if (records.length === 0) {
      list.appendChild(el('div', { class: 'muted fs-sm ta-c', style: 'padding:16px;' }, ['لا توجد إجازات مسجلة']));
      return;
    }
    records.forEach(([dstr, entry]) => {
      const typeNames = { annual: 'سنوية', casual: 'عارضة', sick: 'مرضية', unpaid: 'بدون راتب', periodic: 'دورية', other: 'أخرى' };
      const typeName = typeNames[entry.leaveType] || 'إجازة';
      const row = el('div', { class: 'row between', style: 'padding:8px 0;border-bottom:1px solid var(--line-soft);' }, [
        el('div', {}, [dstr + ' — ' + typeName]),
        el('span', { class: 'chip' }, [entry.note || ''])
      ]);
      list.appendChild(row);
    });
  }

  // ---------- Stats ----------
  function openStatsSheet() {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    $('#statsFrom').value = fmtDate(start);
    $('#statsTo').value = fmtDate(today);
    renderStats(start, today);
    $('#statsOverlay').classList.add('show');
    $('#statsSheet').classList.add('show');
  }
  function closeStatsSheet() {
    $('#statsOverlay').classList.remove('show');
    $('#statsSheet').classList.remove('show');
  }
  function renderStats(start, end) {
    const content = $('#statsContent');
    const result = SPSalary.computeSalary(start, end);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const avgHours = result.totalHours / totalDays;
    const compliancePct = (result.counts.A + result.counts.X) > 0
      ? Math.round(((result.counts.A + result.counts.X) / Math.max(1, result.counts.A + result.counts.X + result.counts.B)) * 100)
      : 0;

    content.innerHTML = '';
    // Stat grid
    const grid = el('div', { class: 'stat-grid', style: 'grid-template-columns:repeat(2,1fr);' });
    grid.appendChild(makeStatCard('إجمالي ساعات', fmtNum(result.totalHours, 1) + ' س', 'accent'));
    grid.appendChild(makeStatCard('متوسط ساعات/يوم', fmtNum(avgHours, 1) + ' س', 'accent'));
    grid.appendChild(makeStatCard('أيام حضور', String(result.counts.A), 'success'));
    grid.appendChild(makeStatCard('أيام مطبق', String(result.counts.X), 'accent'));
    grid.appendChild(makeStatCard('أيام إجازة', String(result.counts.L), 'warning'));
    grid.appendChild(makeStatCard('أيام غياب', String(result.counts.B), 'danger'));
    grid.appendChild(makeStatCard('ساعات إضافي', fmtNum(result.overtimeHours, 1) + ' س', 'success'));
    grid.appendChild(makeStatCard('نسبة الحضور', compliancePct + '%', compliancePct >= 80 ? 'success' : 'warning'));
    grid.appendChild(makeStatCard('إجمالي الراتب', fmtCurrency(result.grossSalary), 'accent'));
    grid.appendChild(makeStatCard('صافي المستحق', fmtCurrency(result.netSalary), 'success'));
    content.appendChild(grid);
  }
  function makeStatCard(label, value, cls) {
    const card = el('div', { class: 'stat-card ' + cls });
    card.appendChild(el('p', { class: 'label' }, [label]));
    card.appendChild(el('p', { class: 'value' }, [value]));
    card.appendChild(el('div', { class: 'ico-bg' }));
    return card;
  }

  // ---------- Backup & Restore ----------
  function openBackupSheet() {
    $('#backupOverlay').classList.add('show');
    $('#backupSheet').classList.add('show');
  }
  function closeBackupSheet() {
    $('#backupOverlay').classList.remove('show');
    $('#backupSheet').classList.remove('show');
  }
  function exportBackup() {
    const data = storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    SPUtils.downloadBlob(`ShiftPro-Backup-${SPUtils.todayStr()}.json`, blob);
    toast('تم تصدير النسخة الاحتياطية', 'success');
  }
  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const json = JSON.parse(reader.result);
        const ok = await confirmDialog(
          'سيتم استبدال جميع البيانات الحالية بالبيانات من الملف. متابعة؟',
          { okText: 'استبدال', danger: true, title: 'استيراد نسخة احتياطية' }
        );
        if (!ok) return;
        storage.importAll(json);
        toast('تم استيراد النسخة بنجاح', 'success');
        closeBackupSheet();
        applyTheme();
        SPApp.onDataChange();
      } catch (e) {
        toast('الملف غير صالح: ' + e.message, 'error');
      }
    };
    reader.readAsText(file);
  }
  async function resetSettings() {
    const ok = await confirmDialog(
      'سيتم إعادة الإعدادات إلى الوضع الافتراضي مع الاحتفاظ ببيانات الحضور. متابعة؟',
      { okText: 'استعادة', danger: true, title: 'استعادة الإعدادات الافتراضية' }
    );
    if (!ok) return;
    storage.saveSettings(Object.assign({}, storage.DEFAULT_SETTINGS));
    applyTheme();
    toast('تمت استعادة الإعدادات الافتراضية', 'success');
    SPApp.onDataChange();
  }
  async function deleteAll() {
    const ok = await confirmDialog(
      '⚠️ سيتم حذف جميع البيانات نهائيًا (الحضور، الورديات، الإعدادات، النسخ الاحتياطية المحلية). لا يمكن التراجع! متابعة؟',
      { okText: 'حذف الكل', danger: true, title: 'حذف جميع البيانات' }
    );
    if (!ok) return;
    const ok2 = await confirmDialog(
      'تأكيد أخير — اكتب "نعم" في رأسك واضغط تأكيد. كل البيانات ستُفقد.',
      { okText: 'أؤكد الحذف', danger: true }
    );
    if (!ok2) return;
    storage.clearAll();
    toast('تم حذف جميع البيانات', 'success');
    setTimeout(() => location.reload(), 600);
  }

  // ---------- About ----------
  function openAboutSheet() {
    $('#aboutOverlay').classList.add('show');
    $('#aboutSheet').classList.add('show');
  }
  function closeAboutSheet() {
    $('#aboutOverlay').classList.remove('show');
    $('#aboutSheet').classList.remove('show');
  }

  // ---------- Generic sheet openers (for "more" page) ----------
  function openSheetByName(name) {
    switch (name) {
      case 'settings': openSettingsSheet(); break;
      case 'shifts': openShiftsSheet(); break;
      case 'leave': openLeaveSheet(); break;
      case 'stats': openStatsSheet(); break;
      case 'backup': openBackupSheet(); break;
      case 'about': openAboutSheet(); break;
    }
  }

  // ---------- Init ----------
  function init() {
    applyTheme();

    // Theme button
    $('#themeBtn').addEventListener('click', onClickOnce(cycleTheme));

    // Settings sheet
    $('#saveSettingsBtn').addEventListener('click', onClickOnce(saveSettings));
    $('#closeSettingsBtn').addEventListener('click', closeSettingsSheet);
    $('#settingsOverlay').addEventListener('click', closeSettingsSheet);

    // Shifts sheet
    $('#addShiftBtn').addEventListener('click', onClickOnce(() => openShiftEditor(null)));
    $('#saveShiftBtn').addEventListener('click', onClickOnce(saveShift));
    $('#cancelShiftBtn').addEventListener('click', closeShiftEditor);
    $('#shiftEditOverlay').addEventListener('click', closeShiftEditor);
    $('#closeShiftsBtn').addEventListener('click', closeShiftsSheet);
    $('#shiftsOverlay').addEventListener('click', closeShiftsSheet);
    $('#applyPatternBtn').addEventListener('click', onClickOnce(applyPattern));
    $('#clearPatternBtn').addEventListener('click', clearPattern);

    // Leave
    $('#closeLeaveBtn').addEventListener('click', closeLeaveSheet);
    $('#leaveOverlay').addEventListener('click', closeLeaveSheet);

    // Stats
    $('#closeStatsBtn').addEventListener('click', closeStatsSheet);
    $('#statsOverlay').addEventListener('click', closeStatsSheet);
    $('#applyStatsRange').addEventListener('click', onClickOnce(() => {
      const from = $('#statsFrom').value;
      const to = $('#statsTo').value;
      if (!from || !to) { toast('حدد التاريخ', 'warning'); return; }
      renderStats(parseDate(from), parseDate(to));
      toast('تم تحديث الإحصائيات', 'success');
    }));

    // Backup
    $('#exportBackupBtn').addEventListener('click', onClickOnce(exportBackup));
    $('#importBackupBtn').addEventListener('click', () => $('#importBackupInput').click());
    $('#importBackupInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importBackup(file);
      e.target.value = '';
    });
    $('#resetSettingsBtn').addEventListener('click', onClickOnce(resetSettings));
    $('#deleteAllBtn').addEventListener('click', onClickOnce(deleteAll));
    $('#closeBackupBtn').addEventListener('click', closeBackupSheet);
    $('#backupOverlay').addEventListener('click', closeBackupSheet);

    // About
    $('#closeAboutBtn').addEventListener('click', closeAboutSheet);
    $('#aboutOverlay').addEventListener('click', closeAboutSheet);

    // "More" page item clicks
    document.querySelectorAll('[data-sheet]').forEach((btn) => {
      btn.addEventListener('click', () => openSheetByName(btn.dataset.sheet));
    });

    // Respond to system theme changes when on auto
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    }
  }

  global.SPSettings = {
    init, applyTheme, openSettingsSheet, closeSettingsSheet,
    openSheetByName
  };
})(window);
