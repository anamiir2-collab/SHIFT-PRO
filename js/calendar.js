/* ShiftPro - Calendar Module
   Renders the calendar grid, handles day-click, multi-select, and pattern.
   Official holidays + Ramadan dates integrated.
   Exposes: window.SPCalendar
*/
(function (global) {
  'use strict';

  const {
    $,
    el,
    fmtDate,
    parseDate,
    addDays,
    sameDay,
    dayDiff,
    monthNamesAr,
    monthShortAr,
    weekdayShortAr
  } = SPUtils;

  const storage = SPStorage;

  let periodRef = new Date();
  const selectedDates = new Set();
  let onSelectChangeCb = null;

  // ---------- Official Holidays ----------

  function getOfficialHoliday(date) {
    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.getOfficialHoliday !== 'function'
    ) {
      return null;
    }

    return global.SPOfficialHolidays.getOfficialHoliday(date);
  }

  function getSpecialDate(date) {
    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.getSpecialDate !== 'function'
    ) {
      return null;
    }

    return global.SPOfficialHolidays.getSpecialDate(date);
  }

  function isOfficialHoliday(date) {
    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.isOfficialHoliday !== 'function'
    ) {
      return false;
    }

    return global.SPOfficialHolidays.isOfficialHoliday(date);
  }

  function isRamadanStart(date) {
    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.isRamadanStart !== 'function'
    ) {
      return false;
    }

    return global.SPOfficialHolidays.isRamadanStart(date);
  }

  // ---------- Pay Period ----------

  function getPayPeriod(refDate) {
    const cd =
      storage.getSettings().cycleDay;

    let y =
      refDate.getFullYear();

    let m =
      refDate.getMonth();

    let start;

    if (
      refDate.getDate() >= cd
    ) {
      start =
        new Date(
          y,
          m,
          cd
        );
    } else {
      start =
        new Date(
          y,
          m - 1,
          cd
        );
    }

    const end =
      new Date(
        start.getFullYear(),
        start.getMonth() + 1,
        cd - 1
      );

    return {
      start,
      end
    };
  }

  // ---------- Shift Legend ----------

  function shiftLegend() {
    const shifts =
      storage.getShifts();

    return shifts
      .map(
        (s) =>
          `<span><i class="dot" style="background:${s.color}"></i> ${s.name}</span>`
      )
      .join('');
  }

  function getCellStyling(code) {
    const shift =
      storage.getShiftByCode(
        code
      );

    if (!shift) {
      return {
        bg: '',
        color: '',
        label: 'حدد'
      };
    }

    return {
      bg: shift.color,
      color: '#fff',
      label: shift.name
    };
  }

  function renderLegend() {
    $('#shiftLegend').innerHTML =
      shiftLegend();
  }

  // ---------- Calendar ----------

  function renderCalendar() {
    const {
      start,
      end
    } =
      getPayPeriod(
        periodRef
      );

    $('#monthLabel').textContent =
      `${start.getDate()} ${
        monthNamesAr[
          start.getMonth()
        ]
      } – ${end.getDate()} ${
        monthNamesAr[
          end.getMonth()
        ]
      }`;

    const grid =
      $('#calGrid');

    grid.innerHTML = '';

    const startOffset =
      start.getDay();

    const totalDays =
      dayDiff(
        end,
        start
      ) + 1;

    const today =
      new Date();

    // ---------- Empty cells ----------

    for (
      let i = 0;
      i < startOffset;
      i++
    ) {
      grid.appendChild(
        el(
          'div',
          {
            class:
              'cal-cell empty'
          }
        )
      );
    }

    // ---------- Days ----------

    for (
      let i = 0;
      i < totalDays;
      i++
    ) {
      const date =
        addDays(
          start,
          i
        );

      const dstr =
        fmtDate(
          date
        );

      const code =
        storage.getScheduledCode(
          dstr
        );

      const entry =
        storage.getEntry(
          dstr
        );

      const status =
        entry
          ? entry.status
          : null;

      const shift =
        storage.getShiftByCode(
          code
        );

      // ---------- Official Holiday ----------

      const officialHoliday =
        getOfficialHoliday(
          date
        );

      // ---------- Special Date ----------

      const specialDate =
        getSpecialDate(
          date
        );

      const official =
        !!officialHoliday;

      const ramadanStart =
        !!(
          specialDate &&
          specialDate.isRamadanStart
        );

      /*
        ساعات اليوم.

        الإجازة الرسمية:
        0 ساعات.

        أول رمضان:
        ليس إجازة، لذلك لا نغير
        حساب ساعات الحضور بسببه.
      */
      const hours =
        official
          ? 0
          : (
              entry
                ? computeEntryHours(
                    entry
                  )
                : 0
            );

      // ---------- Cell Class ----------

      let cellClass =
        'cal-cell clickable';

      if (code) {
        cellClass +=
          ' scheduled';
      }

      if (
        sameDay(
          date,
          today
        )
      ) {
        cellClass +=
          ' today';
      }

      if (
        date < today &&
        !sameDay(
          date,
          today
        )
      ) {
        cellClass +=
          ' before';
      }

      if (
        selectedDates.has(
          dstr
        )
      ) {
        cellClass +=
          ' selected';
      }

      if (official) {
        cellClass +=
          ' official-holiday';
      }

      if (ramadanStart) {
        cellClass +=
          ' ramadan-start';
      }

      const cell =
        el(
          'div',
          {
            class:
              cellClass,

            dataset: {
              date: dstr
            },

            role: 'button',

            tabindex: '0',

            'aria-label':
              buildAriaLabel(
                date,
                shift,
                officialHoliday,
                ramadanStart
              )
          }
        );

      // ---------- Shift Background ----------

      if (shift && !official) {
        cell.style.background =
          shift.color;

        cell.style.borderColor =
          shift.color;

        cell.style.color =
          '#fff';
      }

      /*
        الإجازة الرسمية تأخذ
        تنسيقها الخاص بدل لون الوردية.
      */
      if (official) {
        cell.style.background =
          'rgba(194, 136, 78, 0.14)';

        cell.style.borderColor =
          'rgba(194, 136, 78, 0.55)';

        cell.style.color =
          '#6d4c2f';
      }

      // ---------- Day Number ----------

      const num =
        el(
          'div',
          {
            class: 'num'
          }
        );

      num.textContent =
        date.getDate() === 1
          ? `${date.getDate()} ${
              monthShortAr[
                date.getMonth()
              ]
            }`
          : date.getDate();

      cell.appendChild(
        num
      );

      // ---------- Shift Tag ----------

      const tag =
        el(
          'div',
          {
            class: 'tag'
          }
        );

      if (officialHoliday) {
        tag.textContent =
          officialHoliday.name;
      } else if (ramadanStart) {
        tag.textContent =
          '🌙 أول رمضان';
      } else {
        tag.textContent =
          shift
            ? shift.name
            : 'حدد';
      }

      cell.appendChild(
        tag
      );

      // ---------- Official Holiday Label ----------

      if (officialHoliday) {
        const holidayLabel =
          el(
            'div',
            {
              class:
                'official-holiday-label'
            }
          );

        holidayLabel.textContent =
          'إجازة رسمية';

        cell.appendChild(
          holidayLabel
        );
      }

      // ---------- Ramadan Label ----------

      if (ramadanStart) {
        const ramadanLabel =
          el(
            'div',
            {
              class:
                'ramadan-label'
            }
          );

        ramadanLabel.textContent =
          'بداية رمضان';

        cell.appendChild(
          ramadanLabel
        );
      }

      // ---------- Hours Preview ----------

      /*
        الإجازة الرسمية لا تعرض ساعات
        لأنها ليست ساعات عمل.
      */
      if (
        !official &&
        entry &&
        hours > 0
      ) {
        const hrs =
          el(
            'div',
            {
              class: 'hrs'
            }
          );

        hrs.textContent =
          hours + 'س';

        cell.appendChild(
          hrs
        );
      }

      // ---------- Attendance Badge ----------

      if (status) {
        const b =
          el(
            'div',
            {
              class:
                'badge ' +
                status,

              'aria-hidden':
                'true'
            }
          );

        b.textContent =
          status === 'A'
            ? '✓'
            : (
                status === 'X'
                  ? '٢'
                  : (
                      status === 'L'
                        ? 'إ'
                        : 'غ'
                    )
              );

        cell.appendChild(
          b
        );
      }

      // ---------- Official Holiday Badge ----------

      if (official) {
        const officialBadge =
          el(
            'div',
            {
              class:
                'official-badge',
              'aria-hidden':
                'true'
            }
          );

        officialBadge.textContent =
          'عطلة';

        cell.appendChild(
          officialBadge
        );
      }

      // ---------- Click ----------

      cell.addEventListener(
        'click',
        () => {

          /*
            لو إجازة رسمية:
            لا نفتح سجل حضور جديد
            بالضغط العادي.

            لكن لو فيه سجل حضور موجود بالفعل
            نسمح بفتحه للتعديل.
          */
          if (
            official &&
            !entry &&
            selectedDates.size === 0
          ) {
            SPUtils.toast(
              officialHoliday.name,
              'info'
            );

            return;
          }

          if (
            selectedDates.size > 0
          ) {
            toggleSelection(
              dstr
            );
          } else {
            SPAttendance.openDaySheet(
              parseDate(
                dstr
              )
            );
          }
        }
      );

      // ---------- Long Press ----------

      let pressTimer =
        null;

      const startPress =
        (e) => {
          pressTimer =
            setTimeout(
              () => {
                pressTimer =
                  null;

                SPUtils.haptic(
                  20
                );

                toggleSelection(
                  dstr
                );

                if (
                  e.preventDefault
                ) {
                  e.preventDefault();
                }
              },
              500
            );
        };

      const cancelPress =
        () => {
          if (pressTimer) {
            clearTimeout(
              pressTimer
            );

            pressTimer =
              null;
          }
        };

      cell.addEventListener(
        'touchstart',
        startPress,
        {
          passive: true
        }
      );

      cell.addEventListener(
        'touchend',
        cancelPress
      );

      cell.addEventListener(
        'touchmove',
        cancelPress
      );

      cell.addEventListener(
        'touchcancel',
        cancelPress
      );

      grid.appendChild(
        cell
      );
    }
  }

  // ---------- Accessibility ----------

  function buildAriaLabel(
    date,
    shift,
    officialHoliday,
    ramadanStart
  ) {
    let label =
      `${date.getDate()} ${
        monthNamesAr[
          date.getMonth()
        ]
      }`;

    if (officialHoliday) {
      label +=
        ` — ${officialHoliday.name} — إجازة رسمية`;
    } else if (ramadanStart) {
      label +=
        ' — أول رمضان';
    } else if (shift) {
      label +=
        ` — ${shift.name}`;
    } else {
      label +=
        ' — غير محدد';
    }

    return label;
  }

  // ---------- Selection ----------

  function toggleSelection(
    dstr
  ) {
    if (
      selectedDates.has(
        dstr
      )
    ) {
      selectedDates.delete(
        dstr
      );
    } else {
      selectedDates.add(
        dstr
      );
    }

    updateSelectionUI();

    renderCalendar();
  }

  function updateSelectionUI() {
    const toolbar =
      $('#calToolbar');

    const clearBtn =
      $('#clearSelectBtn');

    if (
      selectedDates.size > 0
    ) {
      toolbar.classList.add(
        'show'
      );

      clearBtn.hidden =
        false;

      $('#selCount').textContent =
        `${selectedDates.size} يوم محدد`;
    } else {
      toolbar.classList.remove(
        'show'
      );

      clearBtn.hidden =
        true;
    }
  }

  function clearSelection() {
    selectedDates.clear();

    updateSelectionUI();

    renderCalendar();
  }

  // ---------- Apply Shift ----------

  async function applyShiftToSelected() {
    if (
      selectedDates.size === 0
    ) {
      return;
    }

    const shifts =
      storage.getShifts();

    const overlay =
      el(
        'div',
        {
          class:
            'sp-confirm-overlay show'
        }
      );

    const box =
      el(
        'div',
        {
          class:
            'sp-confirm-box'
        }
      );

    const title =
      el(
        'div',
        {
          class:
            'sp-confirm-title'
        },
        [
          'اختر الوردية'
        ]
      );

    const msg =
      el(
        'div',
        {
          class:
            'sp-confirm-msg'
        },
        [
          `سيتم تطبيق الوردية على ${selectedDates.size} يوم محدد`
        ]
      );

    const grid =
      el(
        'div',
        {
          style:
            'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px;'
        }
      );

    shifts.forEach(
      (s) => {
        const btn =
          el(
            'button',
            {
              class:
                'btn sm',

              style:
                `background:${s.color}22;border-color:${s.color};color:${s.color};`
            },
            [
              s.name
            ]
          );

        btn.addEventListener(
          'click',
          async () => {
            overlay.remove();

            const entries = {};

            selectedDates.forEach(
              (d) => {
                entries[d] =
                  s.code;
              }
            );

            storage.setScheduleMany(
              entries
            );

            SPUtils.toast(
              `تم تطبيق وردية ${s.name} على ${selectedDates.size} يوم`,
              'success'
            );

            clearSelection();

            SPApp.onDataChange();
          }
        );

        grid.appendChild(
          btn
        );
      }
    );

    const cancelBtn =
      el(
        'button',
        {
          class:
            'sp-btn sp-btn-ghost'
        },
        [
          'إلغاء'
        ]
      );

    cancelBtn.addEventListener(
      'click',
      () =>
        overlay.remove()
    );

    box.appendChild(
      title
    );

    box.appendChild(
      msg
    );

    box.appendChild(
      grid
    );

    box.appendChild(
      cancelBtn
    );

    overlay.appendChild(
      box
    );

    document.body.appendChild(
      overlay
    );
  }

  // ---------- Clear Selected ----------

  async function clearSelected() {
    if (
      selectedDates.size === 0
    ) {
      return;
    }

    const ok =
      await SPUtils.confirmDialog(
        `سيتم مسح نوع الوردية عن ${selectedDates.size} يوم. هل أنت متأكد؟`,
        {
          okText: 'مسح',
          danger: true
        }
      );

    if (!ok) {
      return;
    }

    const entries = {};

    selectedDates.forEach(
      (d) => {
        entries[d] =
          null;
      }
    );

    storage.setScheduleMany(
      entries
    );

    SPUtils.toast(
      'تم مسح الورديات المحددة',
      'success'
    );

    clearSelection();

    SPApp.onDataChange();
  }

  // ---------- Entry Hours ----------

  function computeEntryHours(entry) {
    if (!entry) {
      return 0;
    }

    /*
      الإجازة الرسمية لا تعتبر
      ساعات عمل.
    */
    if (
      entry.date &&
      isOfficialHoliday(
        parseDate(entry.date)
      )
    ) {
      return 0;
    }

    // ---------- Leave ----------

    if (
      entry.status === 'L'
    ) {
      const leaveHours =
        Number(
          entry.leaveHours
        );

      if (
        Number.isFinite(
          leaveHours
        ) &&
        leaveHours >= 0
      ) {
        return Math.min(
          24,
          leaveHours
        );
      }

      return 8;
    }

    // ---------- Attendance ----------

    if (
      (
        entry.status === 'A' ||
        entry.status === 'X'
      ) &&
      entry.from &&
      entry.to
    ) {
      if (
        global.SPAttendance &&
        typeof
          global.SPAttendance.computeActualHours ===
          'function'
      ) {
        const actual =
          global.SPAttendance.computeActualHours(
            entry
          );

        if (
          Number.isFinite(
            actual
          ) &&
          actual > 0
        ) {
          return actual;
        }
      }

      return SPUtils.computeRangeHours(
        entry.from,
        entry.to
      );
    }

    const sh =
      Number(
        storage.getSettings().shiftHours
      ) || 12;

    // ---------- 24 Hour Shift ----------

    if (
      entry.status === 'X'
    ) {
      return sh * 2;
    }

    // ---------- Normal Attendance ----------

    if (
      entry.status === 'A'
    ) {
      return sh;
    }

    // ---------- Absence ----------

    if (
      entry.status === 'B'
    ) {
      return 0;
    }

    return 0;
  }

  // ---------- Navigation ----------

  function shiftPeriod(
    delta
  ) {
    periodRef.setMonth(
      periodRef.getMonth() +
      delta
    );

    renderCalendar();

    SPSalary.render();

    SPReports.render();
  }

  function gotoToday() {
    periodRef =
      new Date();

    renderCalendar();

    SPSalary.render();

    SPReports.render();

    SPUtils.toast(
      'تم الانتقال للدورة الحالية',
      'info'
    );
  }

  function getPeriodRef() {
    return periodRef;
  }

  function setPeriodRef(d) {
    periodRef = d;
  }

  // ---------- Init ----------

  function init() {
    renderLegend();

    renderCalendar();

    $('#prevBtn')
      .addEventListener(
        'click',
        SPUtils.onClickOnce(
          () =>
            shiftPeriod(-1)
        )
      );

    $('#nextBtn')
      .addEventListener(
        'click',
        SPUtils.onClickOnce(
          () =>
            shiftPeriod(1)
        )
      );

    $('#todayBtn')
      .addEventListener(
        'click',
        gotoToday
      );

    $('#clearSelectBtn')
      .addEventListener(
        'click',
        clearSelection
      );

    $('#applyShiftToSelected')
      .addEventListener(
        'click',
        applyShiftToSelected
      );

    $('#clearSelected')
      .addEventListener(
        'click',
        clearSelected
      );
  }

  // ---------- Public API ----------

  global.SPCalendar = {
    init,
    renderCalendar,
    renderLegend,
    getPayPeriod,
    computeEntryHours,
    shiftPeriod,
    gotoToday,
    getPeriodRef,
    setPeriodRef,
    clearSelection,

    getOfficialHoliday,
    getSpecialDate,
    isOfficialHoliday,
    isRamadanStart
  };

})(window);