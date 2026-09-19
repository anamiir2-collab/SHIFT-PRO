/* ShiftPro - Reports Module
   Renders report table, summary stats, donut + bar charts.
   Exports CSV, JSON, and Print/PDF.
   Exposes: window.SPReports
*/
(function (global) {
  'use strict';

  const { $, el, fmtDate, parseDate, addDays, fmtNum, fmtCurrency, fmtHours,
    monthNamesAr, weekdayShortAr, fmtTime12, toast, onClickOnce, downloadBlob } = SPUtils;
  const storage = SPStorage;

  let currentRange = 'cycle'; // daily | weekly | cycle | custom
  let customStart = null;
  let customEnd = null;

  function getReportRange() {
    const periodRef = SPCalendar.getPeriodRef();
    if (currentRange === 'cycle') {
      return SPCalendar.getPayPeriod(periodRef);
    }
    if (currentRange === 'daily') {
      const today = new Date();
      return { start: today, end: today };
    }
    if (currentRange === 'weekly') {
      const today = new Date();
      const start = addDays(today, -6);
      return { start, end: today };
    }
    if (currentRange === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return SPCalendar.getPayPeriod(periodRef);
  }

  function render() {
    const { start, end } = getReportRange();
    $('#reportPeriodLabel').textContent =
      `${start.getDate()} ${monthNamesAr[start.getMonth()]} — ${end.getDate()} ${monthNamesAr[end.getMonth()]} ${end.getFullYear()}`;

    // Use salary computation for accurate numbers
    const result = SPSalary.computeSalary(start, end);

    // Summary cards
    $('#rWorkDays').textContent = result.counts.A + result.counts.X;
    $('#rPresent').textContent = result.counts.A;
    $('#rAbsent').textContent = result.counts.B;
    $('#rLeave').textContent = result.counts.L;
    $('#rDouble').textContent = result.counts.X;
    $('#rTotalHours').textContent = fmtNum(result.totalHours, 1);

    // Donut chart
    renderDonut(result.counts);

    // Bar chart — hours per day
    renderBarChart(result.dailyDetails);

    // Table
    renderTable(result.dailyDetails);

    // Print header
    $('#printPeriod').textContent =
      `الفترة: ${fmtDate(start)} إلى ${fmtDate(end)}`;
    $('#printWorker').textContent =
      `الموظف: ${storage.getSettings().name}`;
  }

  function renderDonut(counts) {
    const segments = $('#donutSegments');
    segments.innerHTML = '';
    const total = counts.A + counts.X + counts.L + counts.B;
    $('#donutCenterVal').textContent = total;
    if (total === 0) {
      $('#donutLegend').innerHTML = '<div class="muted fs-sm">لا توجد بيانات في هذه الفترة</div>';
      return;
    }
    const items = [
      { label: 'حضور', value: counts.A, color: '#22c55e' },
      { label: 'مطبق', value: counts.X, color: '#a855f7' },
      { label: 'إجازة', value: counts.L, color: '#f59e0b' },
      { label: 'غياب', value: counts.B, color: '#ef4444' }
    ];
    const r = 48, cx = 60, cy = 60;
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    items.forEach((it) => {
      if (it.value === 0) return;
      const len = (it.value / total) * circumference;
      const circle = el('circle', {
        cx, cy, r,
        fill: 'none',
        stroke: it.color,
        'stroke-width': 14,
        'stroke-dasharray': `${len} ${circumference - len}`,
        'stroke-dashoffset': -offset,
        transform: `rotate(-90 ${cx} ${cy})`
      });
      segments.appendChild(circle);
      offset += len;
    });
    // Legend
    const legend = $('#donutLegend');
    legend.innerHTML = '';
    items.forEach((it) => {
      const row = el('div', { class: 'item' });
      row.appendChild(el('span', { class: 'dot', style: `background:${it.color}` }));
      row.appendChild(el('span', {}, [it.label]));
      row.appendChild(el('span', { class: 'v' }, [String(it.value)]));
      legend.appendChild(row);
    });
  }

  function renderBarChart(dailyDetails) {
    const chart = $('#hoursBarChart');
    chart.innerHTML = '';
    if (!dailyDetails || dailyDetails.length === 0) {
      chart.appendChild(el('div', { class: 'muted fs-sm', style: 'margin:auto;text-align:center;' }, ['لا توجد بيانات في هذه الفترة']));
      return;
    }
    // Limit to last 14 days for readability
    const items = dailyDetails.slice(-14);
    const maxHours = Math.max(1, ...items.map((d) => d.actual));
    // If all zeros, show empty state
    const totalActual = items.reduce((s, d) => s + d.actual, 0);
    if (totalActual === 0) {
      chart.appendChild(el('div', { class: 'muted fs-sm', style: 'margin:auto;text-align:center;' }, ['لا توجد ساعات مسجلة بعد']));
      return;
    }
    items.forEach((d) => {
      const pct = (d.actual / maxHours) * 100;
      let cls = '';
      if (d.actual === 0 && d.entry && d.entry.status === 'B') cls = 'danger';
      else if (d.actual > (Number(storage.getSettings().shiftHours) || 12)) cls = 'success';
      const col = el('div', { class: 'bar-col' });
      col.appendChild(el('div', { class: 'bar-value' }, [d.actual > 0 ? fmtNum(d.actual, 1) : '']));
      col.appendChild(el('div', { class: 'bar ' + cls, style: `height:${Math.max(2, pct)}%` }));
      col.appendChild(el('div', { class: 'bar-label' }, [weekdayShortAr[d.date.getDay()]]));
      chart.appendChild(col);
    });
  }

  function renderTable(dailyDetails) {
    const tbody = $('#reportTableBody');
    tbody.innerHTML = '';
    let totalHours = 0, totalValue = 0;
    dailyDetails.forEach((d) => {
      const tr = el('tr');
      const dayName = weekdayShortAr[d.date.getDay()];
      const dateDisplay = `${String(d.date.getDate()).padStart(2, '0')}/${String(d.date.getMonth() + 1).padStart(2, '0')}/${d.date.getFullYear()}`;
      const scheduledCode = storage.getScheduledCode(fmtDate(d.date));
      const shift = scheduledCode ? storage.getShiftByCode(scheduledCode) : null;
      const scheduledLabel = shift ? shift.name : 'غير محدد';
      const statusLabel = d.entry ? SPAttendance.statusLabels[d.entry.status] || 'غير مسجل' : 'غير مسجل';
      const timeRange = (d.entry && d.entry.from && d.entry.to)
        ? `${fmtTime12(d.entry.from)} — ${fmtTime12(d.entry.to)}`
        : '-';
      tr.innerHTML = `<td>${dayName}</td><td>${dateDisplay}</td><td>${scheduledLabel}</td><td>${statusLabel}</td><td>${timeRange}</td><td>${fmtNum(d.actual, 1)}</td><td>${fmtCurrency(d.value)}</td>`;
      tbody.appendChild(tr);
      totalHours += d.actual;
      totalValue += d.value;
    });
    $('#reportTotalHours').textContent = fmtNum(totalHours, 1);
    $('#reportTotalValue').textContent = fmtCurrency(totalValue);
  }

  // ---------- Export functions ----------
  function exportCSV() {
    const { start, end } = getReportRange();
    const result = SPSalary.computeSalary(start, end);
    const headers = ['اليوم', 'التاريخ', 'الوردية المجدولة', 'الحالة', 'من الساعة', 'إلى الساعة', 'الساعات', 'الإضافي', 'التأخير (د)', 'الانصراف المبكر (د)', 'قيمة اليوم', 'ملاحظة'];
    let csv = '\uFEFF' + headers.join(',') + '\n';
    result.dailyDetails.forEach((d) => {
      const dayName = weekdayShortAr[d.date.getDay()];
      const dateDisplay = `${String(d.date.getDate()).padStart(2, '0')}/${String(d.date.getMonth() + 1).padStart(2, '0')}/${d.date.getFullYear()}`;
      const scheduledCode = storage.getScheduledCode(fmtDate(d.date));
      const shift = scheduledCode ? storage.getShiftByCode(scheduledCode) : null;
      const scheduledLabel = shift ? shift.name : 'غير محدد';
      const statusLabel = d.entry ? SPAttendance.statusLabels[d.entry.status] || 'غير مسجل' : 'غير مسجل';
      const from = (d.entry && d.entry.from) ? d.entry.from : '';
      const to = (d.entry && d.entry.to) ? d.entry.to : '';
      const note = (d.entry && d.entry.note) ? d.entry.note : '';
      const row = [dayName, dateDisplay, scheduledLabel, statusLabel, from, to, fmtNum(d.actual, 2), fmtNum(d.ot, 2), d.late, d.early, Math.round(d.value), note];
      csv += row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n';
    });
    // Summary footer
    csv += '\n\nالملخص,,,\n';
    csv += `"إجمالي الساعات الأساسية","","","","","","${fmtNum(result.baseHours, 2)}"\n`;
    csv += `"إجمالي الساعات الإضافية","","","","","","${fmtNum(result.overtimeHours, 2)}"\n`;
    csv += `"إجمالي الساعات","","","","","","${fmtNum(result.totalHours, 2)}"\n`;
    csv += `"الراتب الأساسي","","","","","","${result.baseSalary}"\n`;
    csv += `"+ الإضافي","","","","","","${result.overtimeValue}"\n`;
    csv += `"+ المكافآت","","","","","","${result.bonus}"\n`;
    csv += `"+ البدلات","","","","","","${result.allowance}"\n`;
    csv += `"− الخصومات","","","","","","${result.deduction + result.absenceDeduction + result.lateDeduction}"\n`;
    csv += `"− السلف","","","","","","${result.advance}"\n`;
    csv += `"صافي المستحق","","","","","","${result.netSalary}"\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(`ShiftPro-${fmtDate(start)}-to-${fmtDate(end)}.csv`, blob);
    toast('تم تصدير CSV بنجاح', 'success');
  }

  function exportJSON() {
    const data = storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(`ShiftPro-Backup-${SPUtils.todayStr()}.json`, blob);
    toast('تم تصدير نسخة احتياطية', 'success');
  }

  function printReport() {
    // Make sure the report page is visible before printing
    const wasActive = $('#page-reports').classList.contains('active');
    if (!wasActive) {
      // temporarily show reports page for printing
      document.querySelectorAll('.page').forEach((p) => p.style.display = 'none');
      $('#page-reports').style.display = 'block';
    }
    setTimeout(() => {
      window.print();
      if (!wasActive) {
        document.querySelectorAll('.page').forEach((p) => p.style.removeProperty('display'));
      }
    }, 100);
  }

  // ---------- Init ----------
  function init() {
    $('#prevReportBtn').addEventListener('click', onClickOnce(() => SPCalendar.shiftPeriod(-1)));
    $('#nextReportBtn').addEventListener('click', onClickOnce(() => SPCalendar.shiftPeriod(1)));
    $('#exportCsvBtn').addEventListener('click', onClickOnce(exportCSV));
    $('#exportJsonBtn').addEventListener('click', onClickOnce(exportJSON));
    $('#printBtn').addEventListener('click', onClickOnce(printReport));

    // Range tabs
    document.querySelectorAll('[data-report-range]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-report-range]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentRange = btn.dataset.reportRange;
        $('#customRangeCard').hidden = currentRange !== 'custom';
        render();
      });
    });

    $('#applyCustomRange').addEventListener('click', () => {
      const from = $('#customFrom').value;
      const to = $('#customTo').value;
      if (!from || !to) { toast('حدد التاريخ من وإلى', 'warning'); return; }
      customStart = parseDate(from);
      customEnd = parseDate(to);
      if (customStart > customEnd) {
        toast('تاريخ البداية يجب أن يكون قبل النهاية', 'warning');
        return;
      }
      render();
      toast('تم تطبيق الفترة المخصصة', 'success');
    });
  }

  global.SPReports = {
    init, render, exportCSV, exportJSON
  };
})(window);
