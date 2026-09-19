/* ShiftPro - Salary Module
   Computes salary for a pay period: base hours, overtime, adjustments,
   deductions, advances, and net pay.
   Exposes: window.SPSalary
*/
(function (global) {
  'use strict';

  const { $, el, fmtDate, parseDate, addDays, fmtNum, fmtCurrency, fmtHours,
    monthNamesAr, toast, onClickOnce } = SPUtils;
  const storage = SPStorage;

  // ---------- Pay period (mirrors calendar's logic) ----------
  function getPayPeriod(refDate) {
    return SPCalendar.getPayPeriod(refDate);
  }

  // ---------- Hourly rate ----------
  function getHourlyRate() {
    const s = storage.getSettings();
    if (s.hourlyRate && s.hourlyRate > 0) return Number(s.hourlyRate);
    const monthly = Number(s.salary) || 0;
    const hours = Number(s.monthlyHours) || 1;
    return monthly / hours;
  }

  function getOvertimeHourlyRate() {
    const s = storage.getSettings();
    return getHourlyRate() * (Number(s.overtimeRate) || 1.5);
  }

  // ---------- Compute salary for a period ----------
  function computeSalary(start, end) {
    const s = storage.getSettings();
    const baseRate = getHourlyRate();
    const overtimeRate = getOvertimeHourlyRate();

    const counts = { A: 0, X: 0, L: 0, B: 0 };
    let baseHours = 0;
    let overtimeHours = 0;
    let lateTotal = 0;
    let earlyTotal = 0;
    const dailyDetails = [];

    let d = new Date(start);
    while (d <= end) {
      const dstr = fmtDate(d);
      const entry = storage.getEntry(dstr);
      const status = entry ? entry.status : null;

      let actual = 0, ot = 0, late = 0, early = 0, value = 0;
      if (status === 'B') {
        counts.B++;
      } else if (status === 'L') {
        counts.L++;
        actual = SPAttendance.computeActualHours(entry);
        // Leave counts as base hours but typically at lower value or zero
        // We count it as base (so the worker gets the leave)
        baseHours += actual;
      } else if (status === 'X') {
        counts.X++;
        actual = SPAttendance.computeActualHours(entry);
        ot = SPAttendance.computeOvertimeHours(d, entry);
        baseHours += (actual - ot);
        overtimeHours += ot;
      } else if (status === 'A') {
        counts.A++;
        actual = SPAttendance.computeActualHours(entry);
        ot = SPAttendance.computeOvertimeHours(d, entry);
        baseHours += (actual - ot);
        overtimeHours += ot;
        late = SPAttendance.computeLateMinutes(d, entry.from);
        early = SPAttendance.computeEarlyLeaveMinutes(d, entry.to);
        lateTotal += late;
        earlyTotal += early;
      }

      value = SPAttendance.dayValue(d, entry);
      dailyDetails.push({ date: new Date(d), entry, actual, ot, late, early, value });

      d = addDays(d, 1);
    }

    // Adjustments
    const adjustments = storage.getAdjustments().filter((a) => {
      const ad = parseDate(a.date);
      return ad >= start && ad <= end;
    });
    let bonus = 0, allowance = 0, deduction = 0, advance = 0;
    adjustments.forEach((a) => {
      const amt = Number(a.amount) || 0;
      if (a.type === 'bonus') bonus += amt;
      else if (a.type === 'allowance') allowance += amt;
      else if (a.type === 'deduction') deduction += amt;
      else if (a.type === 'advance') advance += amt;
    });

    // Absence deduction
    let absenceDeduction = 0;
    if (s.deductAbsence) {
      // Each absent day deducts one day's wage (salary / monthlyHours * shiftHours)
      const dayValue = baseRate * (Number(s.shiftHours) || 12);
      absenceDeduction = counts.B * dayValue;
    }

    // Late deduction
    let lateDeduction = 0;
    if (s.deductLate) {
      const lateHours = lateTotal / 60;
      lateDeduction = lateHours * baseRate;
    }

    const totalHours = baseHours + overtimeHours;
    const baseSalary = baseHours * baseRate;
    const overtimeValue = overtimeHours * overtimeRate;
    const totalDeductions = deduction + advance + absenceDeduction + lateDeduction;
    const grossSalary = baseSalary + overtimeValue + bonus + allowance;
    const netSalary = grossSalary - totalDeductions;

    return {
      counts,
      baseHours: Math.round(baseHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      lateTotal, earlyTotal,
      baseRate, overtimeRate,
      baseSalary: Math.round(baseSalary),
      overtimeValue: Math.round(overtimeValue),
      bonus, allowance,
      deduction: Math.round(deduction),
      advance: Math.round(advance),
      absenceDeduction: Math.round(absenceDeduction),
      lateDeduction: Math.round(lateDeduction),
      grossSalary: Math.round(grossSalary),
      totalDeductions: Math.round(totalDeductions),
      netSalary: Math.round(netSalary),
      adjustments,
      dailyDetails
    };
  }

  // ---------- Render ----------
  function render() {
    const periodRef = SPCalendar.getPeriodRef();
    const { start, end } = getPayPeriod(periodRef);
    $('#periodLabel').textContent =
      `${start.getDate()} ${monthNamesAr[start.getMonth()]} — ${end.getDate()} ${monthNamesAr[end.getMonth()]} ${end.getFullYear()}`;

    const s = storage.getSettings();
    $('#cycleStartLbl').textContent = s.cycleDay;
    $('#cycleEndLbl').textContent = s.cycleDay - 1 <= 0 ? 28 : s.cycleDay - 1;

    const result = computeSalary(start, end);

    $('#pA').textContent = result.counts.A;
    $('#pX').textContent = result.counts.X;
    $('#pL').textContent = result.counts.L;
    $('#pB').textContent = result.counts.B;

    $('#pBaseHours').textContent = fmtHours(result.baseHours);
    $('#pOvertimeHours').textContent = fmtHours(result.overtimeHours);
    $('#pHours').textContent = fmtHours(result.totalHours);

    $('#pRate').textContent = fmtNum(result.baseRate, 2) + ' ج/س';
    $('#pOvertimeRate').textContent = fmtNum(result.overtimeRate, 2) + ' ج/س';

    $('#pBaseSalary').textContent = fmtCurrency(result.baseSalary);
    $('#pOvertimeValue').textContent = fmtCurrency(result.overtimeValue);
    $('#pBonus').textContent = fmtCurrency(result.bonus);
    $('#pAllowance').textContent = fmtCurrency(result.allowance);
    $('#pDeduction').textContent = fmtCurrency(result.deduction + result.absenceDeduction + result.lateDeduction);
    $('#pAdvance').textContent = fmtCurrency(result.advance);
    $('#pTotal').textContent = fmtCurrency(result.netSalary);

    renderAdjustments(result.adjustments);
  }

  function renderAdjustments(adjustments) {
    const list = $('#adjustmentsList');
    list.innerHTML = '';
    if (adjustments.length === 0) {
      list.appendChild(el('div', { class: 'empty-state', style: 'padding:24px 8px;' }, [
        el('div', { class: 'fs-sm muted' }, ['لا توجد بنود إضافية في هذه الفترة'])
      ]));
      return;
    }
    adjustments.forEach((a) => {
      const sign = (a.type === 'bonus' || a.type === 'allowance') ? '+' : '−';
      const cls = (a.type === 'bonus' || a.type === 'allowance') ? 'success' : 'danger';
      const row = el('div', {
        class: 'setting-row',
        style: 'padding:8px 0;border-bottom:1px solid var(--line-soft);'
      });
      const meta = el('div', { class: 'meta' });
      meta.appendChild(el('div', { class: 't1 fs-sm' }, [
        a.type === 'bonus' ? 'مكافأة' : a.type === 'allowance' ? 'بدل' :
        a.type === 'deduction' ? 'خصم' : 'سلفة'
      ]));
      meta.appendChild(el('div', { class: 't2 fs-sm' }, [
        `${fmtDate(parseDate(a.date))} ${a.reason ? '— ' + a.reason : ''}`
      ]));
      row.appendChild(meta);
      row.appendChild(el('strong', { class: cls + ' fs-md' }, [sign + ' ' + fmtCurrency(a.amount)]));
      const delBtn = el('button', { class: 'icon-btn', style: 'width:32px;height:32px;font-size:14px;', 'aria-label': 'حذف' }, ['×']);
      delBtn.addEventListener('click', async () => {
        const ok = await SPUtils.confirmDialog('حذف هذا البند؟', { okText: 'حذف', danger: true });
        if (ok) {
          storage.deleteAdjustment(a.id);
          SPUtils.toast('تم الحذف', 'success');
          SPApp.onDataChange();
        }
      });
      row.appendChild(delBtn);
      list.appendChild(row);
    });
  }

  // ---------- Adjustment sheet ----------
  function openAdjustmentSheet(preselectedDate) {
    const overlay = $('#adjOverlay');
    const sheet = $('#adjSheet');
    $('#adjTitle').textContent = 'إضافة بند';
    $('#adjType').value = 'bonus';
    $('#adjAmount').value = '';
    $('#adjReason').value = '';
    $('#adjDate').value = preselectedDate || SPUtils.todayStr();
    overlay.classList.add('show');
    sheet.classList.add('show');
  }
  function closeAdjustmentSheet() {
    $('#adjOverlay').classList.remove('show');
    $('#adjSheet').classList.remove('show');
  }
  function saveAdjustment() {
    const type = $('#adjType').value;
    const amount = Number($('#adjAmount').value) || 0;
    const date = $('#adjDate').value;
    const reason = $('#adjReason').value.trim();
    if (amount <= 0) { toast('أدخل مبلغًا صحيحًا', 'warning'); return; }
    if (!date) { toast('حدد التاريخ', 'warning'); return; }
    storage.addAdjustment({ type, amount, date, reason });
    closeAdjustmentSheet();
    toast('تم حفظ البند', 'success');
    SPApp.onDataChange();
  }

  // ---------- Init ----------
  function init() {
    $('#prevPeriodBtn').addEventListener('click', onClickOnce(() => SPCalendar.shiftPeriod(-1)));
    $('#nextPeriodBtn').addEventListener('click', onClickOnce(() => SPCalendar.shiftPeriod(1)));
    $('#addAdjustmentBtn').addEventListener('click', onClickOnce(() => openAdjustmentSheet()));
    $('#saveAdjBtn').addEventListener('click', onClickOnce(saveAdjustment));
    $('#cancelAdjBtn').addEventListener('click', closeAdjustmentSheet);
    $('#adjOverlay').addEventListener('click', closeAdjustmentSheet);
  }

  global.SPSalary = {
    init, render, computeSalary, getHourlyRate, getOvertimeHourlyRate, getPayPeriod
  };
})(window);
