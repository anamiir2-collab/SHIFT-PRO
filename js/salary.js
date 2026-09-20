/* ShiftPro - Salary Module
   Computes salary for a pay period.

   Official Holiday Rules:
   - Official holidays DO NOT block attendance.
   - If no attendance is recorded on an official holiday:
       0 salary hours.
   - If the employee works on an official holiday:
       Actual worked hours are counted normally.
       Additional official-holiday hours are added according
       to the employee/company selected multiplier.
   - Example with multiplier 1:
       8 worked + 8 official = 16 salary hours.
   - Official holidays never deduct personal leave balance.

   Exposes: window.SPSalary
*/
(function (global) {
  'use strict';

  const {
    $,
    el,
    fmtDate,
    parseDate,
    addDays,
    fmtNum,
    fmtCurrency,
    fmtHours,
    monthNamesAr,
    toast,
    onClickOnce
  } = SPUtils;

  const storage = SPStorage;

  // =========================================================
  // Pay period
  // =========================================================

  function getPayPeriod(refDate) {
    return SPCalendar.getPayPeriod(refDate);
  }

  // =========================================================
  // Hourly rate
  // =========================================================

  function getHourlyRate() {
    const s = storage.getSettings();

    if (
      s.hourlyRate &&
      Number(s.hourlyRate) > 0
    ) {
      return Number(s.hourlyRate);
    }

    const monthly =
      Number(s.salary) || 0;

    const hours =
      Number(s.monthlyHours) || 1;

    return monthly / hours;
  }

  function getOvertimeHourlyRate() {
    const s =
      storage.getSettings();

    return (
      getHourlyRate() *
      (Number(s.overtimeRate) || 1.5)
    );
  }

  // =========================================================
  // Official holiday multiplier
  // =========================================================

  function getOfficialHolidayMultiplier() {
    const s =
      storage.getSettings();

    let multiplier =
      Number(
        s.officialHolidayRate
      );

    // Default:
    // 1 = same number of additional hours
    // Example:
    // 8 worked + 8 official = 16
    if (!Number.isFinite(multiplier)) {
      multiplier = 1;
    }

    if (multiplier < 0) {
      multiplier = 0;
    }

    if (multiplier > 5) {
      multiplier = 5;
    }

    return multiplier;
  }

  // =========================================================
  // Official holiday helpers
  // =========================================================

  function isOfficialHoliday(date) {
    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.isOfficialHoliday !== 'function'
    ) {
      return false;
    }

    return global.SPOfficialHolidays.isOfficialHoliday(
      fmtDate(date)
    );
  }

  function getOfficialHolidayName(date) {
    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.getOfficialHolidayName !== 'function'
    ) {
      return '';
    }

    return global.SPOfficialHolidays.getOfficialHolidayName(
      fmtDate(date)
    ) || '';
  }

  // =========================================================
  // Leave helpers
  // =========================================================

  function getLeaveHours(entry) {
    if (!entry) return 0;

    let hours =
      Number(entry.leaveHours);

    // Old leave records
    if (!Number.isFinite(hours)) {
      hours = 8;
    }

    if (hours < 0) hours = 0;
    if (hours > 24) hours = 24;

    return hours;
  }

  function normalizeLeaveType(type) {
    const value =
      String(type || 'annual')
        .trim()
        .toLowerCase();

    const aliases = {
      annual: 'annual',
      سنوية: 'annual',

      casual: 'casual',
      عارضة: 'casual',

      sick: 'sick',
      مرضية: 'sick',

      unpaid: 'unpaid',
      'بدون راتب': 'unpaid',
      بدون_راتب: 'unpaid',

      periodic: 'periodic',
      دورية: 'periodic',

      other: 'other',
      أخرى: 'other',
      اخرى: 'other'
    };

    return aliases[value] || 'annual';
  }

  function isPaidLeave(entry) {
    if (!entry) return false;

    const type =
      normalizeLeaveType(
        entry.leaveType
      );

    return type !== 'unpaid';
  }

  // =========================================================
  // Compute salary
  // =========================================================

  function computeSalary(start, end) {
    const s =
      storage.getSettings();

    const baseRate =
      getHourlyRate();

    const overtimeRate =
      getOvertimeHourlyRate();

    const officialHolidayMultiplier =
      getOfficialHolidayMultiplier();

    const counts = {
      A: 0,
      X: 0,
      L: 0,
      B: 0
    };

    let baseHours = 0;
    let overtimeHours = 0;

    // Additional official holiday hours
    let officialHolidayHours = 0;

    let lateTotal = 0;
    let earlyTotal = 0;

    let paidLeaveHours = 0;
    let unpaidLeaveHours = 0;

    const dailyDetails = [];

    let d =
      new Date(start);

    while (d <= end) {
      const dstr =
        fmtDate(d);

      const entry =
        storage.getEntry(dstr);

      const status =
        entry
          ? entry.status
          : null;

      const officialHoliday =
        isOfficialHoliday(d);

      const officialHolidayName =
        officialHoliday
          ? getOfficialHolidayName(d)
          : '';

      let actual = 0;
      let ot = 0;
      let late = 0;
      let early = 0;
      let value = 0;

      // =====================================================
      // Absence
      // =====================================================

      if (status === 'B') {
        counts.B++;
      }

      // =====================================================
      // Leave
      // =====================================================

      else if (status === 'L') {

        // Official holiday is NOT personal leave.
        // Do not deduct it as annual/casual/etc.
        if (officialHoliday) {

          // A manually-created L record on an official
          // holiday contributes nothing to salary.
          actual = 0;

        } else {

          counts.L++;

          actual =
            getLeaveHours(entry);

          if (isPaidLeave(entry)) {

            baseHours +=
              actual;

            paidLeaveHours +=
              actual;

          } else {

            unpaidLeaveHours +=
              actual;
          }
        }
      }

      // =====================================================
      // Applied shift X
      // =====================================================

      else if (status === 'X') {

        counts.X++;

        actual =
          SPAttendance.computeActualHours(
            entry
          );

        ot =
          SPAttendance.computeOvertimeHours(
            d,
            entry
          );

        const regularHours =
          Math.max(
            0,
            actual - ot
          );

        baseHours +=
          regularHours;

        overtimeHours +=
          ot;

        // ===================================================
        // Official holiday
        // ===================================================

        if (
          officialHoliday &&
          actual > 0
        ) {

          officialHolidayHours +=
            actual *
            officialHolidayMultiplier;
        }
      }

      // =====================================================
      // Attendance A
      // =====================================================

      else if (status === 'A') {

        counts.A++;

        actual =
          SPAttendance.computeActualHours(
            entry
          );

        ot =
          SPAttendance.computeOvertimeHours(
            d,
            entry
          );

        const regularHours =
          Math.max(
            0,
            actual - ot
          );

        baseHours +=
          regularHours;

        overtimeHours +=
          ot;

        // ===================================================
        // Official holiday additional hours
        // ===================================================

        if (
          officialHoliday &&
          actual > 0
        ) {

          officialHolidayHours +=
            actual *
            officialHolidayMultiplier;
        }

        // ===================================================
        // Late / early
        // ===================================================

        if (
          entry &&
          entry.from
        ) {

          late =
            SPAttendance.computeLateMinutes(
              d,
              entry.from
            );
        }

        if (
          entry &&
          entry.to
        ) {

          early =
            SPAttendance.computeEarlyLeaveMinutes(
              d,
              entry.to
            );
        }

        lateTotal +=
          late;

        earlyTotal +=
          early;
      }

      // =====================================================
      // Day value
      // =====================================================

      value =
        SPAttendance.dayValue(
          d,
          entry
        );

      dailyDetails.push({
        date:
          new Date(d),

        entry,

        actual,

        ot,

        late,

        early,

        value,

        officialHoliday,

        officialHolidayName,

        officialHolidayHours:
          officialHoliday &&
          actual > 0
            ? actual *
              officialHolidayMultiplier
            : 0
      });

      d =
        addDays(d, 1);
    }

    // =========================================================
    // Adjustments
    // =========================================================

    const adjustments =
      storage
        .getAdjustments()
        .filter((a) => {

          const ad =
            parseDate(a.date);

          return (
            ad >= start &&
            ad <= end
          );
        });

    let bonus = 0;
    let allowance = 0;
    let deduction = 0;
    let advance = 0;

    adjustments.forEach((a) => {

      const amt =
        Number(a.amount) || 0;

      if (a.type === 'bonus') {
        bonus += amt;
      }

      else if (a.type === 'allowance') {
        allowance += amt;
      }

      else if (a.type === 'deduction') {
        deduction += amt;
      }

      else if (a.type === 'advance') {
        advance += amt;
      }
    });

    // =========================================================
    // Absence deduction
    // =========================================================

    let absenceDeduction = 0;

    if (s.deductAbsence) {

      const dayValue =
        baseRate *
        (
          Number(s.shiftHours) ||
          12
        );

      absenceDeduction =
        counts.B *
        dayValue;
    }

    // =========================================================
    // Late deduction
    // =========================================================

    let lateDeduction = 0;

    if (s.deductLate) {

      const lateHours =
        lateTotal / 60;

      lateDeduction =
        lateHours *
        baseRate;
    }

    // =========================================================
    // Salary totals
    // =========================================================

    /*
      Important:

      officialHolidayHours are ADDITIONAL salary hours.

      Example:
      actual = 8
      multiplier = 1

      normal:
      8 hours

      official:
      +8 hours

      total:
      16 hours
    */

    const totalHours =
      baseHours +
      overtimeHours +
      officialHolidayHours;

    const baseSalary =
      baseHours *
      baseRate;

    const overtimeValue =
      overtimeHours *
      overtimeRate;

    // Official holiday additional payment
    const officialHolidayValue =
      officialHolidayHours *
      overtimeRate;

    const totalDeductions =
      deduction +
      advance +
      absenceDeduction +
      lateDeduction;

    const grossSalary =
      baseSalary +
      overtimeValue +
      officialHolidayValue +
      bonus +
      allowance;

    const netSalary =
      grossSalary -
      totalDeductions;

    // =========================================================
    // Result
    // =========================================================

    return {

      counts,

      baseHours:
        Math.round(
          baseHours * 100
        ) / 100,

      overtimeHours:
        Math.round(
          overtimeHours * 100
        ) / 100,

      officialHolidayHours:
        Math.round(
          officialHolidayHours * 100
        ) / 100,

      totalHours:
        Math.round(
          totalHours * 100
        ) / 100,

      paidLeaveHours:
        Math.round(
          paidLeaveHours * 100
        ) / 100,

      unpaidLeaveHours:
        Math.round(
          unpaidLeaveHours * 100
        ) / 100,

      lateTotal,
      earlyTotal,

      baseRate,
      overtimeRate,

      officialHolidayMultiplier,

      baseSalary:
        Math.round(
          baseSalary
        ),

      overtimeValue:
        Math.round(
          overtimeValue
        ),

      officialHolidayValue:
        Math.round(
          officialHolidayValue
        ),

      bonus,
      allowance,

      deduction:
        Math.round(
          deduction
        ),

      advance:
        Math.round(
          advance
        ),

      absenceDeduction:
        Math.round(
          absenceDeduction
        ),

      lateDeduction:
        Math.round(
          lateDeduction
        ),

      grossSalary:
        Math.round(
          grossSalary
        ),

      totalDeductions:
        Math.round(
          totalDeductions
        ),

      netSalary:
        Math.round(
          netSalary
        ),

      adjustments,

      dailyDetails
    };
  }

  // =========================================================
  // Render salary page
  // =========================================================

  function render() {

    const periodRef =
      SPCalendar.getPeriodRef();

    const {
      start,
      end
    } =
      getPayPeriod(
        periodRef
      );

    $('#periodLabel').textContent =
      `${start.getDate()} ` +
      `${monthNamesAr[start.getMonth()]} — ` +
      `${end.getDate()} ` +
      `${monthNamesAr[end.getMonth()]} ` +
      `${end.getFullYear()}`;

    const s =
      storage.getSettings();

    $('#cycleStartLbl').textContent =
      s.cycleDay;

    $('#cycleEndLbl').textContent =
      s.cycleDay - 1 <= 0
        ? 28
        : s.cycleDay - 1;

    const result =
      computeSalary(
        start,
        end
      );

    // Counts
    $('#pA').textContent =
      result.counts.A;

    $('#pX').textContent =
      result.counts.X;

    $('#pL').textContent =
      result.counts.L;

    $('#pB').textContent =
      result.counts.B;

    // Hours
    $('#pBaseHours').textContent =
      fmtHours(
        result.baseHours
      );

    $('#pOvertimeHours').textContent =
      fmtHours(
        result.overtimeHours
      );

    $('#pHours').textContent =
      fmtHours(
        result.totalHours
      );

    // Rates
    $('#pRate').textContent =
      fmtNum(
        result.baseRate,
        2
      ) + ' ج/س';

    $('#pOvertimeRate').textContent =
      fmtNum(
        result.overtimeRate,
        2
      ) + ' ج/س';

    // Salary
    $('#pBaseSalary').textContent =
      fmtCurrency(
        result.baseSalary
      );

    $('#pOvertimeValue').textContent =
      fmtCurrency(
        result.overtimeValue
      );

    $('#pBonus').textContent =
      fmtCurrency(
        result.bonus
      );

    $('#pAllowance').textContent =
      fmtCurrency(
        result.allowance
      );

    $('#pDeduction').textContent =
      fmtCurrency(
        result.deduction +
        result.absenceDeduction +
        result.lateDeduction
      );

    $('#pAdvance').textContent =
      fmtCurrency(
        result.advance
      );

    $('#pTotal').textContent =
      fmtCurrency(
        result.netSalary
      );

    renderAdjustments(
      result.adjustments
    );
  }

  // =========================================================
  // Render adjustments
  // =========================================================

  function renderAdjustments(
    adjustments
  ) {

    const list =
      $('#adjustmentsList');

    list.innerHTML = '';

    if (
      adjustments.length === 0
    ) {

      list.appendChild(
        el('div', {
          class:
            'empty-state',
          style:
            'padding:24px 8px;'
        }, [
          el('div', {
            class:
              'fs-sm muted'
          }, [
            'لا توجد بنود إضافية في هذه الفترة'
          ])
        ])
      );

      return;
    }

    adjustments.forEach((a) => {

      const sign =
        (
          a.type === 'bonus' ||
          a.type === 'allowance'
        )
          ? '+'
          : '−';

      const cls =
        (
          a.type === 'bonus' ||
          a.type === 'allowance'
        )
          ? 'success'
          : 'danger';

      const row =
        el('div', {
          class:
            'setting-row',
          style:
            'padding:8px 0;' +
            'border-bottom:1px solid var(--line-soft);'
        });

      const meta =
        el('div', {
          class: 'meta'
        });

      meta.appendChild(
        el('div', {
          class:
            't1 fs-sm'
        }, [
          a.type === 'bonus'
            ? 'مكافأة'
            : a.type === 'allowance'
              ? 'بدل'
              : a.type === 'deduction'
                ? 'خصم'
                : 'سلفة'
        ])
      );

      meta.appendChild(
        el('div', {
          class:
            't2 fs-sm'
        }, [
          `${fmtDate(parseDate(a.date))}` +
          `${a.reason ? ' — ' + a.reason : ''}`
        ])
      );

      row.appendChild(meta);

      row.appendChild(
        el('strong', {
          class:
            cls + ' fs-md'
        }, [
          sign +
          ' ' +
          fmtCurrency(
            a.amount
          )
        ])
      );

      const delBtn =
        el('button', {
          class:
            'icon-btn',
          style:
            'width:32px;' +
            'height:32px;' +
            'font-size:14px;',
          'aria-label':
            'حذف'
        }, [
          '×'
        ]);

      delBtn.addEventListener(
        'click',
        async () => {

          const ok =
            await SPUtils.confirmDialog(
              'حذف هذا البند؟',
              {
                okText:
                  'حذف',
                danger:
                  true
              }
            );

          if (!ok) return;

          storage.deleteAdjustment(
            a.id
          );

          SPUtils.toast(
            'تم الحذف',
            'success'
          );

          SPApp.onDataChange();
        }
      );

      row.appendChild(
        delBtn
      );

      list.appendChild(
        row
      );
    });
  }

  // =========================================================
  // Adjustment sheet
  // =========================================================

  function openAdjustmentSheet(
    preselectedDate
  ) {

    const overlay =
      $('#adjOverlay');

    const sheet =
      $('#adjSheet');

    $('#adjTitle').textContent =
      'إضافة بند';

    $('#adjType').value =
      'bonus';

    $('#adjAmount').value =
      '';

    $('#adjReason').value =
      '';

    $('#adjDate').value =
      preselectedDate ||
      SPUtils.todayStr();

    overlay.classList.add(
      'show'
    );

    sheet.classList.add(
      'show'
    );
  }

  function closeAdjustmentSheet() {

    $('#adjOverlay')
      .classList.remove(
        'show'
      );

    $('#adjSheet')
      .classList.remove(
        'show'
      );
  }

  function saveAdjustment() {

    const type =
      $('#adjType').value;

    const amount =
      Number(
        $('#adjAmount').value
      ) || 0;

    const date =
      $('#adjDate').value;

    const reason =
      $('#adjReason').value.trim();

    if (amount <= 0) {

      toast(
        'أدخل مبلغًا صحيحًا',
        'warning'
      );

      return;
    }

    if (!date) {

      toast(
        'حدد التاريخ',
        'warning'
      );

      return;
    }

    storage.addAdjustment({
      type,
      amount,
      date,
      reason
    });

    closeAdjustmentSheet();

    toast(
      'تم حفظ البند',
      'success'
    );

    SPApp.onDataChange();
  }

  // =========================================================
  // Init
  // =========================================================

  function init() {

    $('#prevPeriodBtn')
      .addEventListener(
        'click',
        onClickOnce(
          () =>
            SPCalendar.shiftPeriod(-1)
        )
      );

    $('#nextPeriodBtn')
      .addEventListener(
        'click',
        onClickOnce(
          () =>
            SPCalendar.shiftPeriod(1)
        )
      );

    $('#addAdjustmentBtn')
      .addEventListener(
        'click',
        onClickOnce(
          () =>
            openAdjustmentSheet()
        )
      );

    $('#saveAdjBtn')
      .addEventListener(
        'click',
        onClickOnce(
          saveAdjustment
        )
      );

    $('#cancelAdjBtn')
      .addEventListener(
        'click',
        closeAdjustmentSheet
      );

    $('#adjOverlay')
      .addEventListener(
        'click',
        closeAdjustmentSheet
      );
  }

  // =========================================================
  // Public API
  // =========================================================

  global.SPSalary = {

    init,

    render,

    computeSalary,

    getHourlyRate,

    getOvertimeHourlyRate,

    getPayPeriod,

    getLeaveHours,

    isPaidLeave,

    getOfficialHolidayMultiplier,

    isOfficialHoliday
  };

})(window);