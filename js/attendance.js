/* ShiftPro - Attendance Module
   Handles the day sheet (add/edit/delete attendance entries),
   check-in / check-out from dashboard, copy-to-other-days.
   Exposes: window.SPAttendance
*/
(function (global) {
  'use strict';

  const {
    $, el, fmtDate, parseDate, formatHijri, fmtTime12,
    computeRangeHours, timeToMin, timeDiffMin, nowHHMM,
    monthNamesAr, weekdayNamesAr, toast, confirmDialog,
    haptic, onClickOnce
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

  // ---------- Hours & overtime computation ----------

  function getShiftForDate(date) {
    const dstr = fmtDate(date);
    const code = storage.getScheduledCode(dstr);
    return code ? storage.getShiftByCode(code) : null;
  }

  function computeLateMinutes(date, fromTime) {
    if (!fromTime) return 0;

    const shift = getShiftForDate(date);
    if (!shift || !shift.startTime) return 0;

    const grace = Number(storage.getSettings().lateGraceMinutes) || 0;
    const diff = timeDiffMin(shift.startTime, fromTime);

    if (diff > 12 * 60) return 0;

    return Math.max(0, diff - grace);
  }

  function computeEarlyLeaveMinutes(date, toTime) {
    if (!toTime) return 0;

    const shift = getShiftForDate(date);
    if (!shift || !shift.endTime) return 0;

    const diff = timeDiffMin(toTime, shift.endTime);

    if (diff > 12 * 60) return 0;

    return Math.max(0, diff);
  }

  function computeOvertimeHours(date, entry) {
    const settings = storage.getSettings();

    if (!settings.overtimeEnabled) return 0;

    const actualHours = computeActualHours(entry);

    let threshold = Number(settings.overtimeAfterHours) || 0;

    if (threshold === 0) {
      const shift = getShiftForDate(date);
      threshold = shift
        ? Number(shift.hours) || 0
        : (Number(settings.shiftHours) || 12);
    }

    return Math.max(
      0,
      Math.round((actualHours - threshold) * 100) / 100
    );
  }

  // ---------- Duration ----------

  function getEntryDurationHours(entry) {
    if (!entry || !entry.from || !entry.to) {
      return 0;
    }

    /*
      لو فيه تاريخ بداية ونهاية
      نحسب المدة الحقيقية بالتاريخ والوقت.
    */
    if (entry.fromDate && entry.toDate) {
      const start = new Date(
        entry.fromDate + 'T' + entry.from + ':00'
      );

      const end = new Date(
        entry.toDate + 'T' + entry.to + ':00'
      );

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
      ) {
        return 0;
      }

      const diff = (end - start) / 3600000;

      if (diff <= 0) return 0;

      return Math.round(diff * 100) / 100;
    }

    return computeRangeHours(entry.from, entry.to);
  }

  function computeActualHours(entry) {
    if (!entry) return 0;

    // غياب
    if (entry.status === 'B') {
      return 0;
    }

    // لو فيه بداية ونهاية
    if (entry.from && entry.to) {
      const duration = getEntryDurationHours(entry);

      if (duration > 0) {
        return duration;
      }
    }

    const sh =
      Number(storage.getSettings().shiftHours) || 12;

    // مطبق 24 ساعة
    if (entry.status === 'X') {
      return sh * 2;
    }

    // حضور أو إجازة
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

    const actual = computeActualHours(entry);
    const overtime = computeOvertimeHours(date, entry);

    const base = actual - overtime;

    const overtimeValue =
      overtime *
      hourlyRate *
      (Number(s.overtimeRate) || 1.5);

    return (base * hourlyRate) + overtimeValue;
  }

  // ---------- Day Sheet ----------

  function openDaySheet(date) {
    activeDate = date;

    const dstr = fmtDate(date);

    const code = storage.getScheduledCode(dstr);
    const entry = storage.getEntry(dstr);

    originalEntry = entry
      ? JSON.parse(JSON.stringify(entry))
      : null;

    $('#daySheetTitle').textContent =
      `${date.getDate()} ${monthNamesAr[date.getMonth()]} ${date.getFullYear()}`;

    $('#daySheetHijri').textContent =
      formatHijri(date);

    const shift = code
      ? storage.getShiftByCode(code)
      : null;

    $('#daySheetSub').textContent =
      `الوردية: ${shift ? shift.name : 'غير محدد'}` +
      (
        shift && shift.startTime
          ? ` — ${fmtTime12(shift.startTime)} إلى ${fmtTime12(shift.endTime)}`
          : ''
      ) +
      (
        entry
          ? ` — الحضور: ${statusLabels[entry.status] || '—'}`
          : ''
      );

    renderShiftPicker(code);

    // ---------- Fill form ----------

    $('#inpFrom').value =
      entry && entry.from
        ? entry.from
        : '';

    $('#inpTo').value =
      entry && entry.to
        ? entry.to
        : '';

    /*
      تاريخ البداية والنهاية

      لو التسجيل القديم مفيهوش تاريخ،
      نستخدم تاريخ اليوم المفتوح في الشيت.
    */
    const defaultDate = fmtDate(date);

    if ($('#inpFromDate')) {
      $('#inpFromDate').value =
        entry && entry.fromDate
          ? entry.fromDate
          : defaultDate;
    }

    if ($('#inpToDate')) {
      $('#inpToDate').value =
        entry && entry.toDate
          ? entry.toDate
          : defaultDate;
    }

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

    const shifts = storage.getShifts();

    shifts.forEach((s) => {
      const btn = el(
        'button',
        {
          class:
            'chip' +
            (s.code === activeCode ? ' active' : ''),

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

    const dstr = fmtDate(activeDate);

    storage.setSchedule(dstr, code);

    openDaySheet(activeDate);

    SPUtils.haptic(10);

    SPApp.onDataChange();
  }

  function updateDurationPreview() {
    const from = $('#inpFrom').value;
    const to = $('#inpTo').value;

    const preview = $('#durationPreview');

    if (from && to) {
      let h = computeRangeHours(from, to);

      /*
        لو التاريخين موجودين نحسب باليوم كمان.
      */
      if (
        $('#inpFromDate') &&
        $('#inpToDate') &&
        $('#inpFromDate').value &&
        $('#inpToDate').value
      ) {
        const start = new Date(
          $('#inpFromDate').value +
          'T' +
          from +
          ':00'
        );

        const end = new Date(
          $('#inpToDate').value +
          'T' +
          to +
          ':00'
        );

        if (
          !Number.isNaN(start.getTime()) &&
          !Number.isNaN(end.getTime()) &&
          end > start
        ) {
          h = Math.round(
            ((end - start) / 3600000) * 100
          ) / 100;
        }
      }

      preview.textContent =
        `المدة: ${h} ساعة — ${fmtTime12(from)} إلى ${fmtTime12(to)}`;
    } else {
      preview.textContent = '';
    }
  }

  function updateComputedStats() {
    if (!activeDate) return;

    const entry = collectEntryFromForm({
      silent: true
    });

    const hours =
      computeActualHours(entry);

    const overtime =
      computeOvertimeHours(activeDate, entry);

    const from =
      entry ? entry.from : '';

    const to =
      entry ? entry.to : '';

    const late =
      computeLateMinutes(activeDate, from);

    const early =
      computeEarlyLeaveMinutes(activeDate, to);

    $('#daySheetHours').textContent =
      hours + ' س';

    $('#daySheetOvertime').textContent =
      overtime + ' س';

    $('#daySheetLate').textContent =
      late;

    $('#daySheetEarly').textContent =
      early;
  }

  // ---------- Collect form ----------

  function collectEntryFromForm(options = {}) {
    const silent = options.silent === true;

    const from = $('#inpFrom').value;
    const to = $('#inpTo').value;

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

    /*
      لو المستخدم كتب وقت بداية ونهاية
      نعتبرها حضور تلقائي.
    */
    if (!status && from && to) {
      status = 'A';
    }

    if (!status) {
      return null;
    }

    const entry = {
      status
    };

    // ---------- Attendance ----------

    if (
      from &&
      to &&
      (status === 'A' || status === 'X')
    ) {
      entry.from = from;
      entry.to = to;

      /*
        تاريخ البداية
      */
      entry.fromDate =
        $('#inpFromDate') &&
        $('#inpFromDate').value
          ? $('#inpFromDate').value
          : (
              activeDate
                ? fmtDate(activeDate)
                : ''
            );

      /*
        تاريخ النهاية
      */
      entry.toDate =
        $('#inpToDate') &&
        $('#inpToDate').value
          ? $('#inpToDate').value
          : (
              activeDate
                ? fmtDate(activeDate)
                : ''
            );

      /*
        التحقق من التاريخ والوقت
      */
      if (
        entry.fromDate &&
        entry.toDate
      ) {
        const start = new Date(
          entry.fromDate +
          'T' +
          entry.from +
          ':00'
        );

        const end = new Date(
          entry.toDate +
          'T' +
          entry.to +
          ':00'
        );

        if (
          Number.isNaN(start.getTime()) ||
          Number.isNaN(end.getTime())
        ) {
          if (!silent) {
            toast(
              'التاريخ أو الوقت غير صحيح',
              'error'
            );
          }

          return null;
        }

        const hours =
          (end - start) / 3600000;

        if (hours <= 0) {
          if (!silent) {
            toast(
              'تاريخ ووقت النهاية يجب أن يكون بعد البداية',
              'error'
            );
          }

          return null;
        }

        if (hours > 36) {
          if (!silent) {
            toast(
              'أقصى مدة لتسجيل الحضور هي 36 ساعة',
              'error'
            );
          }

          return null;
        }
      }
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
      entry.leaveType = leaveType;
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

  // ---------- Status ----------

  function setStatus(code) {
    if (!activeDate) return;

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

    const entry = {
      status: code
    };

    if (
      (code === 'A' || code === 'X') &&
      from &&
      to
    ) {
      entry.from = from;
      entry.to = to;

      if (
        $('#inpFromDate') &&
        $('#inpFromDate').value
      ) {
        entry.fromDate =
          $('#inpFromDate').value;
      }

      if (
        $('#inpToDate') &&
        $('#inpToDate').value
      ) {
        entry.toDate =
          $('#inpToDate').value;
      }
    }

    /*
      تسجيل حضور سريع
    */
    if (
      code === 'A' &&
      !from &&
      !to
    ) {
      entry.from = nowHHMM();

      $('#inpFrom').value =
        entry.from;

      if (
        $('#inpFromDate') &&
        !$('#inpFromDate').value
      ) {
        $('#inpFromDate').value =
          fmtDate(activeDate);
      }
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

    storage.setEntry(
      fmtDate(activeDate),
      entry
    );

    originalEntry =
      JSON.parse(
        JSON.stringify(entry)
      );

    SPUtils.haptic(12);

    SPUtils.toast(
      `تم تسجيل: ${statusLabels[code]}`,
      'success'
    );

    closeDaySheet();

    SPApp.onDataChange();
  }

  // ---------- Delete ----------

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

    storage.deleteEntry(
      fmtDate(activeDate)
    );

    SPUtils.haptic(15);

    SPUtils.toast(
      'تم حذف التسجيل',
      'success'
    );

    closeDaySheet();

    SPApp.onDataChange();
  }

  // ---------- Save ----------

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

    /*
      تحقق إضافي من المدة
    */
    if (
      (entry.status === 'A' ||
       entry.status === 'X') &&
      entry.from &&
      entry.to
    ) {
      const h =
        getEntryDurationHours(entry);

      if (h <= 0 || h > 36) {
        toast(
          'الوقت غير منطقي — تحقق من القيم',
          'error'
        );
        return;
      }
    }

    storage.setEntry(
      fmtDate(activeDate),
      entry
    );

    originalEntry =
      JSON.parse(
        JSON.stringify(entry)
      );

    SPUtils.haptic(12);

    toast(
      'تم الحفظ بنجاح',
      'success'
    );

    closeDaySheet();

    SPApp.onDataChange();
  }

  // ---------- Copy day ----------

  async function copyDayToOthers() {
    if (!activeDate || !originalEntry) {
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

  // ---------- Dashboard quick actions ----------

  function checkInToday() {
    const today = new Date();

    const dstr =
      fmtDate(today);

    let entry =
      storage.getEntry(dstr) ||
      { status: 'A' };

    entry.status =
      entry.status === 'X'
        ? 'X'
        : 'A';

    if (!entry.from) {
      entry.from =
        nowHHMM();
    }

    /*
      حفظ تاريخ بداية الحضور
    */
    if (!entry.fromDate) {
      entry.fromDate =
        dstr;
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
    const today = new Date();

    const dstr =
      fmtDate(today);

    let entry =
      storage.getEntry(dstr);

    if (
      !entry ||
      (entry.status !== 'A' &&
       entry.status !== 'X')
    ) {
      toast(
        'لم تسجل حضور بعد — اضغط "تسجيل حضور" أولًا',
        'warning'
      );
      return;
    }

    entry.to =
      nowHHMM();

    /*
      حفظ تاريخ الانصراف
    */
    if (!entry.toDate) {
      entry.toDate =
        dstr;
    }

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

  // ---------- Init ----------

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

    /*
      تحديث الحساب عند تغيير التاريخ
    */
    if ($('#inpFromDate')) {
      $('#inpFromDate')
        .addEventListener(
          'input',
          () => {
            updateDurationPreview();
            updateComputedStats();
          }
        );

      $('#inpFromDate')
        .addEventListener(
          'change',
          () => {
            updateDurationPreview();
            updateComputedStats();
          }
        );
    }

    if ($('#inpToDate')) {
      $('#inpToDate')
        .addEventListener(
          'input',
          () => {
            updateDurationPreview();
            updateComputedStats();
          }
        );

      $('#inpToDate')
        .addEventListener(
          'change',
          () => {
            updateDurationPreview();
            updateComputedStats();
          }
        );
    }

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

          openDaySheet(activeDate);

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
        onClickOnce(
          copyDayToOthers
        )
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

  // ---------- Public API ----------

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
    statusLabels
  };

})(window);