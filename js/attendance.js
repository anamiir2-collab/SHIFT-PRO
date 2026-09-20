/* ShiftPro - Attendance Module
   Handles the day sheet (add/edit/delete attendance entries),
   check-in / check-out from dashboard, copy-to-other-days.
   Leave types + annual/sick leave balance management.
   Exposes: window.SPAttendance
*/
(function (global) {
  'use strict';

  const {
    $,
    el,
    fmtDate,
    parseDate,
    formatHijri,
    fmtTime12,
    computeRangeHours,
    timeToMin,
    timeDiffMin,
    nowHHMM,
    monthNamesAr,
    weekdayNamesAr,
    toast,
    confirmDialog,
    haptic,
    onClickOnce
  } = SPUtils;

  const storage = SPStorage;

  let activeDate = null;
  let originalEntry = null;

  const statusLabels = {
    A: 'حضرت',
    X: 'مطبق (24 ساعة)',
    L: 'إجازة',
    B: 'غياب'
  };

  // =========================================================
  // Leave Types
  // =========================================================

  const leaveTypeLabels = {
    annual: 'سنوية',
    casual: 'عارضة',
    sick: 'مرضية',
    unpaid: 'بدون راتب',
    periodic: 'دورية',
    other: 'أخرى'
  };

  // الأنواع التي يتم خصمها من الرصيد
  const balanceLeaveTypes = ['annual', 'sick'];

  function getLeaveTypeLabel(type) {
    return leaveTypeLabels[type] || 'إجازة';
  }

  function isBalanceLeaveType(type) {
    return balanceLeaveTypes.includes(type);
  }

  /**
   * تعديل استخدام رصيد الإجازات عند تغيير التسجيل.
   *
   * مثال:
   * annual -> sick
   * يرجع يوم للسنوية
   * ويخصم يوم من المرضية
   *
   * delete:
   * يرجع اليوم للنوع السابق.
   */
  function adjustLeaveBalance(oldEntry, newEntry) {
    const oldType =
      oldEntry && oldEntry.status === 'L'
        ? oldEntry.leaveType
        : null;

    const newType =
      newEntry && newEntry.status === 'L'
        ? newEntry.leaveType
        : null;

    // لو النوع لم يتغير، لا يوجد شيء نعدله
    if (oldType === newType) {
      return true;
    }

    const balance = storage.getLeaveBalance();

    // ---------------------------------------------------------
    // أولاً: رجّع الاستخدام القديم
    // ---------------------------------------------------------
    if (isBalanceLeaveType(oldType)) {
      if (!balance[oldType]) {
        balance[oldType] = {
          total: 0,
          used: 0
        };
      }

      balance[oldType].used = Math.max(
        0,
        Number(balance[oldType].used || 0) - 1
      );
    }

    // ---------------------------------------------------------
    // ثانيًا: خصم النوع الجديد
    // ---------------------------------------------------------
    if (isBalanceLeaveType(newType)) {
      if (!balance[newType]) {
        balance[newType] = {
          total: 0,
          used: 0
        };
      }

      const total = Number(balance[newType].total || 0);
      const used = Number(balance[newType].used || 0);
      const remaining = total - used;

      // لو الرصيد غير كافي
      if (remaining <= 0) {
        // نرجع أي تعديل عملناه على القديم
        if (isBalanceLeaveType(oldType)) {
          balance[oldType].used = Number(balance[oldType].used || 0) + 1;
        }

        toast(
          `رصيد الإجازة ${getLeaveTypeLabel(newType)} خلص`,
          'warning'
        );

        return false;
      }

      balance[newType].used = used + 1;
    }

    storage.saveLeaveBalance(balance);
    return true;
  }

  /**
   * حفظ التسجيل مع تحديث رصيد الإجازات.
   */
  function saveEntryWithLeaveBalance(dstr, entry, oldEntry) {
    const balanceOk = adjustLeaveBalance(oldEntry, entry);

    if (!balanceOk) {
      return false;
    }

    storage.setEntry(dstr, entry);
    return true;
  }

  /**
   * حذف التسجيل مع إعادة رصيد الإجازة إذا كان التسجيل إجازة.
   */
  function deleteEntryWithLeaveBalance(dstr, entry) {
    if (
      entry &&
      entry.status === 'L' &&
      isBalanceLeaveType(entry.leaveType)
    ) {
      const balance = storage.getLeaveBalance();

      if (!balance[entry.leaveType]) {
        balance[entry.leaveType] = {
          total: 0,
          used: 0
        };
      }

      balance[entry.leaveType].used = Math.max(
        0,
        Number(balance[entry.leaveType].used || 0) - 1
      );

      storage.saveLeaveBalance(balance);
    }

    storage.deleteEntry(dstr);
  }

  /**
   * إظهار اختيار نوع الإجازة عند الضغط على زر إجازة.
   *
   * نستخدم رسالة بسيطة تعمل مباشرة على الموبايل
   * بدون الحاجة لإضافة HTML أو CSS جديد.
   */
  function showLeaveTypePicker() {
    const balance = storage.getLeaveBalance();

    const annualTotal = Number(
      balance.annual?.total || 0
    );

    const annualUsed = Number(
      balance.annual?.used || 0
    );

    const annualRemaining = Math.max(
      0,
      annualTotal - annualUsed
    );

    const sickTotal = Number(
      balance.sick?.total || 0
    );

    const sickUsed = Number(
      balance.sick?.used || 0
    );

    const sickRemaining = Math.max(
      0,
      sickTotal - sickUsed
    );

    const message =
      'حدد نوع الإجازة:\n\n' +
      `1 - سنوية (${annualRemaining} يوم متبقي)\n` +
      '2 - عارضة\n' +
      `3 - مرضية (${sickRemaining} يوم متبقي)\n` +
      '4 - بدون راتب\n' +
      '5 - دورية\n' +
      '6 - أخرى\n\n' +
      'اكتب رقم الاختيار:';

    const answer = window.prompt(message);

    if (answer === null) {
      return null;
    }

    const choice = String(answer).trim();

    const map = {
      '1': 'annual',
      '2': 'casual',
      '3': 'sick',
      '4': 'unpaid',
      '5': 'periodic',
      '6': 'other'
    };

    const type = map[choice];

    if (!type) {
      toast('اختيار غير صحيح — اختر رقم من 1 إلى 6', 'warning');
      return null;
    }

    // فحص الرصيد قبل إنشاء الإجازة
    if (type === 'annual' && annualRemaining <= 0) {
      toast('رصيد الإجازات السنوية غير كافٍ', 'warning');
      return null;
    }

    if (type === 'sick' && sickRemaining <= 0) {
      toast('رصيد الإجازات المرضية غير كافٍ', 'warning');
      return null;
    }

    return type;
  }

  // =========================================================
  // Hours & overtime computation
  // =========================================================

  function getShiftForDate(date) {
    const dstr = fmtDate(date);
    const code = storage.getScheduledCode(dstr);
    return code ? storage.getShiftByCode(code) : null;
  }

  function computeLateMinutes(date, fromTime) {
    if (!fromTime) return 0;

    const shift = getShiftForDate(date);

    if (!shift || !shift.startTime) return 0;

    const grace =
      Number(storage.getSettings().lateGraceMinutes) || 0;

    const diff = timeDiffMin(
      shift.startTime,
      fromTime
    );

    if (diff > 12 * 60) return 0;

    return Math.max(
      0,
      diff - grace
    );
  }

  function computeEarlyLeaveMinutes(date, toTime) {
    if (!toTime) return 0;

    const shift = getShiftForDate(date);

    if (!shift || !shift.endTime) return 0;

    const diff = timeDiffMin(
      toTime,
      shift.endTime
    );

    if (diff > 12 * 60) return 0;

    return Math.max(
      0,
      diff
    );
  }

  function computeOvertimeHours(date, entry) {
    const settings = storage.getSettings();

    if (!settings.overtimeEnabled) return 0;

    const actualHours = computeActualHours(entry);

    let threshold =
      Number(settings.overtimeAfterHours) || 0;

    if (threshold === 0) {
      const shift = getShiftForDate(date);

      threshold = shift
        ? shift.hours
        : Number(settings.shiftHours) || 12;
    }

    return Math.max(
      0,
      Math.round(
        (actualHours - threshold) * 100
      ) / 100
    );
  }

  function computeActualHours(entry) {
    if (!entry) return 0;

    if (entry.status === 'B') return 0;

    if (entry.from && entry.to) {
      return computeRangeHours(
        entry.from,
        entry.to
      );
    }

    const sh =
      Number(
        storage.getSettings().shiftHours
      ) || 12;

    if (entry.status === 'X') {
      return sh * 2;
    }

    if (
      entry.status === 'A' ||
      entry.status === 'L'
    ) {
      return sh;
    }

    return 0;
  }

  function dayValue(date, entry) {
    if (!entry) return 0;

    const s = storage.getSettings();

    const hourlyRate =
      s.hourlyRate > 0
        ? Number(s.hourlyRate)
        : (Number(s.salary) || 0) /
          (Number(s.monthlyHours) || 1);

    const actual =
      computeActualHours(entry);

    const overtime =
      computeOvertimeHours(
        date,
        entry
      );

    const base =
      actual - overtime;

    const overtimeValue =
      overtime *
      hourlyRate *
      (Number(s.overtimeRate) || 1.5);

    return (
      base * hourlyRate
    ) + overtimeValue;
  }

  // =========================================================
  // Day Sheet
  // =========================================================

  function openDaySheet(date) {
    activeDate = date;

    const dstr = fmtDate(date);

    const code =
      storage.getScheduledCode(dstr);

    const entry =
      storage.getEntry(dstr);

    originalEntry =
      entry
        ? JSON.parse(JSON.stringify(entry))
        : null;

    $('#daySheetTitle').textContent =
      `${date.getDate()} ${monthNamesAr[date.getMonth()]} ${date.getFullYear()}`;

    $('#daySheetHijri').textContent =
      formatHijri(date);

    const shift =
      code
        ? storage.getShiftByCode(code)
        : null;

    $('#daySheetSub').textContent =
      `الوردية: ${shift ? shift.name : 'غير محدد'}` +
      (
        shift &&
        shift.startTime
          ? ` — ${fmtTime12(shift.startTime)} إلى ${fmtTime12(shift.endTime)}`
          : ''
      ) +
      (
        entry
          ? ` — الحضور: ${statusLabels[entry.status] || '—'}`
          : ''
      ) +
      (
        entry &&
        entry.status === 'L' &&
        entry.leaveType
          ? ` — ${getLeaveTypeLabel(entry.leaveType)}`
          : ''
      );

    renderShiftPicker(code);

    // Fill form fields
    $('#inpFrom').value =
      entry && entry.from
        ? entry.from
        : '';

    $('#inpTo').value =
      entry && entry.to
        ? entry.to
        : '';

    $('#inpNote').value =
      entry && entry.note
        ? entry.note
        : '';

    $('#inpLocation').value =
      entry && entry.location
        ? entry.location
        : '';

    $('#inpAbsenceReason').value =
      entry && entry.absenceReason
        ? entry.absenceReason
        : '';

    $('#inpLeaveType').value =
      entry && entry.leaveType
        ? entry.leaveType
        : '';

    $('#inpLeaveType').disabled =
      !(entry && entry.status === 'L');

    $('#inpAbsenceReason').disabled =
      !(entry && entry.status === 'B');

    updateDurationPreview();
    updateComputedStats();

    $('#dayOverlay').classList.add('show');
    $('#daySheet').classList.add('show');
  }

  function closeDaySheet() {
    $('#dayOverlay').classList.remove('show');
    $('#daySheet').classList.remove('show');

    activeDate = null;
    originalEntry = null;
  }

  function renderShiftPicker(activeCode) {
    const picker = $('#shiftPicker');

    picker.innerHTML = '';

    const shifts =
      storage.getShifts();

    shifts.forEach((s) => {
      const btn = el(
        'button',
        {
          class:
            'chip' +
            (
              s.code === activeCode
                ? ' active'
                : ''
            ),

          style:
            s.code === activeCode
              ? `background:${s.color};color:#fff;border-color:${s.color};`
              : `border-color:${s.color};color:${s.color};`,

          'data-shift-code': s.code
        },
        [s.name]
      );

      btn.addEventListener(
        'click',
        () => setSchedule(s.code)
      );

      picker.appendChild(btn);
    });
  }

  function setSchedule(code) {
    if (!activeDate) return;

    const dstr =
      fmtDate(activeDate);

    storage.setSchedule(
      dstr,
      code
    );

    openDaySheet(activeDate);

    SPUtils.haptic(10);
    SPApp.onDataChange();
  }

  function updateDurationPreview() {
    const from =
      $('#inpFrom').value;

    const to =
      $('#inpTo').value;

    const preview =
      $('#durationPreview');

    if (from && to) {
      const h =
        computeRangeHours(
          from,
          to
        );

      preview.textContent =
        `المدة: ${h} ساعة — ${fmtTime12(from)} إلى ${fmtTime12(to)}`;
    } else {
      preview.textContent = '';
    }
  }

  function updateComputedStats() {
    if (!activeDate) return;

    const entry =
      collectEntryFromForm();

    const hours =
      computeActualHours(entry);

    const overtime =
      computeOvertimeHours(
        activeDate,
        entry
      );

    const from =
      entry
        ? entry.from
        : '';

    const to =
      entry
        ? entry.to
        : '';

    const late =
      computeLateMinutes(
        activeDate,
        from
      );

    const early =
      computeEarlyLeaveMinutes(
        activeDate,
        to
      );

    $('#daySheetHours').textContent =
      hours + ' س';

    $('#daySheetOvertime').textContent =
      overtime + ' س';

    $('#daySheetLate').textContent =
      late;

    $('#daySheetEarly').textContent =
      early;
  }

  function collectEntryFromForm() {
    const from =
      $('#inpFrom').value;

    const to =
      $('#inpTo').value;

    const note =
      $('#inpNote').value.trim();

    const location =
      $('#inpLocation').value.trim();

    const leaveType =
      $('#inpLeaveType').value;

    const absenceReason =
      $('#inpAbsenceReason').value.trim();

    let status =
      originalEntry
        ? originalEntry.status
        : null;

    if (!status && from && to) {
      status = 'A';
    }

    if (!status) {
      return null;
    }

    const entry = {
      status
    };

    if (
      from &&
      to &&
      (
        status === 'A' ||
        status === 'X'
      )
    ) {
      entry.from = from;
      entry.to = to;
    }

    if (note) {
      entry.note = note;
    }

    if (location) {
      entry.location = location;
    }

    if (
      status === 'L' &&
      leaveType
    ) {
      entry.leaveType =
        leaveType;
    }

    if (
      status === 'B' &&
      absenceReason
    ) {
      entry.absenceReason =
        absenceReason;
    }

    return entry;
  }

  // =========================================================
  // Set Status
  // =========================================================

  function setStatus(code) {
    if (!activeDate) return;

    // -------------------------------------------------------
    // عند اختيار الإجازة نطلب نوع الإجازة أولاً
    // -------------------------------------------------------
    let selectedLeaveType = '';

    if (code === 'L') {
      selectedLeaveType =
        showLeaveTypePicker();

      if (!selectedLeaveType) {
        return;
      }

      $('#inpLeaveType').value =
        selectedLeaveType;

      $('#inpLeaveType').disabled =
        false;
    }

    const from =
      $('#inpFrom').value;

    const to =
      $('#inpTo').value;

    const note =
      $('#inpNote').value.trim();

    const location =
      $('#inpLocation').value.trim();

    const leaveType =
      code === 'L'
        ? selectedLeaveType ||
          $('#inpLeaveType').value
        : '';

    const absenceReason =
      $('#inpAbsenceReason').value.trim();

    const entry = {
      status: code
    };

    if (
      (
        code === 'A' ||
        code === 'X'
      ) &&
      from &&
      to
    ) {
      entry.from = from;
      entry.to = to;
    }

    if (
      code === 'A' &&
      !from &&
      !to
    ) {
      entry.from = nowHHMM();

      $('#inpFrom').value =
        entry.from;
    }

    if (note) {
      entry.note = note;
    }

    if (location) {
      entry.location = location;
    }

    if (
      code === 'L' &&
      leaveType
    ) {
      entry.leaveType =
        leaveType;
    }

    if (
      code === 'B' &&
      absenceReason
    ) {
      entry.absenceReason =
        absenceReason;
    }

    const dstr =
      fmtDate(activeDate);

    const saved =
      saveEntryWithLeaveBalance(
        dstr,
        entry,
        originalEntry
      );

    if (!saved) {
      return;
    }

    originalEntry =
      JSON.parse(
        JSON.stringify(entry)
      );

    SPUtils.haptic(12);

    if (code === 'L') {
      SPUtils.toast(
        `تم تسجيل إجازة ${getLeaveTypeLabel(leaveType)}`,
        'success'
      );
    } else {
      SPUtils.toast(
        `تم تسجيل: ${statusLabels[code]}`,
        'success'
      );
    }

    closeDaySheet();
    SPApp.onDataChange();
  }

  // =========================================================
  // Delete
  // =========================================================

  async function deleteEntry() {
    if (!activeDate) return;

    const ok =
      await confirmDialog(
        'سيتم حذف تسجيل الحضور لهذا اليوم. هل أنت متأكد؟',
        {
          okText: 'حذف',
          cancelText: 'إلغاء',
          danger: true,
          title: 'حذف التسجيل'
        }
      );

    if (!ok) return;

    const dstr =
      fmtDate(activeDate);

    const entry =
      storage.getEntry(dstr);

    deleteEntryWithLeaveBalance(
      dstr,
      entry
    );

    SPUtils.haptic(15);

    SPUtils.toast(
      'تم حذف التسجيل',
      'success'
    );

    closeDaySheet();
    SPApp.onDataChange();
  }

  // =========================================================
  // Save Day
  // =========================================================

  function saveDay() {
    if (!activeDate) return;

    const entry =
      collectEntryFromForm();

    if (!entry) {
      toast(
        'حدد نوع الحضور أولًا (حضرت / مطبق / إجازة / غياب)',
        'warning'
      );

      return;
    }

    // -------------------------------------------------------
    // لو الحالة إجازة لكن النوع غير محدد
    // -------------------------------------------------------
    if (
      entry.status === 'L' &&
      !entry.leaveType
    ) {
      const selected =
        showLeaveTypePicker();

      if (!selected) {
        return;
      }

      entry.leaveType =
        selected;

      $('#inpLeaveType').value =
        selected;
    }

    // -------------------------------------------------------
    // Validate times
    // -------------------------------------------------------
    if (
      (
        entry.status === 'A' ||
        entry.status === 'X'
      ) &&
      entry.from &&
      entry.to
    ) {
      const h =
        computeRangeHours(
          entry.from,
          entry.to
        );

      if (
        h <= 0 ||
        h > 36
      ) {
        toast(
          'الوقت غير منطقي — تحقق من القيم',
          'error'
        );

        return;
      }
    }

    const dstr =
      fmtDate(activeDate);

    const saved =
      saveEntryWithLeaveBalance(
        dstr,
        entry,
        originalEntry
      );

    if (!saved) {
      return;
    }

    SPUtils.haptic(12);

    toast(
      'تم الحفظ بنجاح',
      'success'
    );

    closeDaySheet();
    SPApp.onDataChange();
  }

  // =========================================================
  // Copy day to other days
  // =========================================================

  async function copyDayToOthers() {
    if (
      !activeDate ||
      !originalEntry
    ) {
      toast(
        'لا يوجد تسجيل لنسخه',
        'warning'
      );

      return;
    }

    const ok =
      await confirmDialog(
        'سيتم نسخ تسجيل هذا اليوم (الحالة والوقت والملاحظة) إلى أيام أخرى. تستطيع تحديد الأيام من التقويم بعد الإغلاق. اضغط مطولاً على أي يوم لتحديده ثم اضغط "تطبيق".\n\nملاحظة: لن يتم نسخ نوع الوردية.',
        {
          okText: 'بدء التحديد',
          cancelText: 'إلغاء',
          title: 'نسخ التسجيل'
        }
      );

    if (!ok) return;

    closeDaySheet();

    toast(
      'حدد الأيام في التقويم ثم اضغط "تطبيق وردية" واختر نسخ التسجيل',
      'info'
    );

    showCopyToolbar();
  }

  function showCopyToolbar() {
    const toolbar =
      $('#calToolbar');

    toolbar.classList.add('show');

    $('#selCount').textContent =
      'حدد الأيام لنسخ التسجيل إليها';

    const applyBtn =
      $('#applyShiftToSelected');

    applyBtn.textContent =
      'نسخ التسجيل';

    applyBtn.dataset.mode =
      'copy';
  }

  // =========================================================
  // Dashboard quick actions
  // =========================================================

  function checkInToday() {
    const today =
      new Date();

    const dstr =
      fmtDate(today);

    let entry =
      storage.getEntry(dstr) ||
      {
        status: 'A'
      };

    entry.status =
      entry.status === 'X'
        ? 'X'
        : 'A';

    if (!entry.from) {
      entry.from =
        nowHHMM();
    }

    storage.setEntry(
      dstr,
      entry
    );

    haptic(15);

    toast(
      `تم تسجيل الحضور: ${fmtTime12(entry.from)}`,
      'success'
    );

    SPApp.onDataChange();
  }

  function checkOutToday() {
    const today =
      new Date();

    const dstr =
      fmtDate(today);

    let entry =
      storage.getEntry(dstr);

    if (
      !entry ||
      (
        entry.status !== 'A' &&
        entry.status !== 'X'
      )
    ) {
      toast(
        'لم تسجل حضور بعد — اضغط "تسجيل حضور" أولًا',
        'warning'
      );

      return;
    }

    entry.to =
      nowHHMM();

    storage.setEntry(
      dstr,
      entry
    );

    haptic(15);

    toast(
      `تم تسجيل الانصراف: ${fmtTime12(entry.to)}`,
      'success'
    );

    SPApp.onDataChange();
  }

  // =========================================================
  // Init
  // =========================================================

  function init() {
    $('#dayOverlay')
      .addEventListener(
        'click',
        closeDaySheet
      );

    $('#inpFrom')
      .addEventListener(
        'input',
        () => {
          updateDurationPreview();
          updateComputedStats();
        }
      );

    $('#inpTo')
      .addEventListener(
        'input',
        () => {
          updateDurationPreview();
          updateComputedStats();
        }
      );

    $('#markPresentBtn')
      .addEventListener(
        'click',
        onClickOnce(
          () => setStatus('A')
        )
      );

    $('#btnX')
      .addEventListener(
        'click',
        onClickOnce(
          () => setStatus('X')
        )
      );

    // -------------------------------------------------------
    // زر الإجازة
    // يفتح اختيار نوع الإجازة
    // -------------------------------------------------------
    $('#btnL')
      .addEventListener(
        'click',
        onClickOnce(
          () => setStatus('L')
        )
      );

    $('#btnB')
      .addEventListener(
        'click',
        onClickOnce(
          () => setStatus('B')
        )
      );

    $('#schClearBtn')
      .addEventListener(
        'click',
        () => {
          if (!activeDate) return;

          storage.setSchedule(
            fmtDate(activeDate),
            null
          );

          openDaySheet(
            activeDate
          );

          SPApp.onDataChange();
        }
      );

    $('#saveDayBtn')
      .addEventListener(
        'click',
        onClickOnce(saveDay)
      );

    $('#deleteDayBtn')
      .addEventListener(
        'click',
        onClickOnce(deleteEntry)
      );

    $('#copyDayBtn')
      .addEventListener(
        'click',
        onClickOnce(copyDayToOthers)
      );

    // Dashboard quick actions
    $('#checkinBtn')
      .addEventListener(
        'click',
        onClickOnce(
          checkInToday
        )
      );

    $('#checkoutBtn')
      .addEventListener(
        'click',
        onClickOnce(
          checkOutToday
        )
      );
  }

  // =========================================================
  // Public API
  // =========================================================

  global.SPAttendance = {
    init,
    openDaySheet,
    closeDaySheet,
    setStatus,
    computeActualHours,
    computeOvertimeHours,
    computeLateMinutes,
    computeEarlyLeaveMinutes,
    dayValue,
    statusLabels,

    // Leave helpers
    getLeaveTypeLabel,
    getLeaveBalance: () =>
      storage.getLeaveBalance()
  };

})(window);