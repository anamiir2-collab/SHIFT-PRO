/* ShiftPro - Main App Entry
   Coordinates navigation, dashboard rendering, splash, PWA install,
   notifications, search, and global event wiring.
   Exposes: window.SPApp
*/
(function (global) {
  'use strict';

  const { $, el, fmtDate, parseDate, todayStr, formatHijri, fmtTime12,
    fmtNum, fmtCurrency, fmtHours, monthNamesAr, weekdayNamesAr,
    toast, confirmDialog, haptic, onClickOnce, debounce } = SPUtils;
  const storage = SPStorage;

  let unsubStore = null;
  let installPromptEvent = null;

  // ---------- Splash ----------
  function hideSplash() {
    const splash = $('#splash');
    if (!splash) return;
    splash.classList.add('is-hidden');
    setTimeout(() => splash.remove(), 800);
  }

  // ---------- Navigation ----------
  function goToTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.page').forEach((p) => {
      p.classList.toggle('active', p.dataset.tab === tab);
    });
    // Re-render the visible page (in case data changed)
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'calendar') SPCalendar.renderCalendar();
    if (tab === 'salary') SPSalary.render();
    if (tab === 'reports') SPReports.render();
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Dashboard rendering ----------
  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'صباح الخير';
    if (h < 17) return 'نهارك سعيد';
    if (h < 21) return 'مساء الخير';
    return 'مساء الخير';
  }

  function renderDashboard() {
    const s = storage.getSettings();
    const today = new Date();
    const dstr = fmtDate(today);
    const entry = storage.getEntry(dstr);
    const code = storage.getScheduledCode(dstr);
    const shift = code ? storage.getShiftByCode(code) : null;

    // Hero card
    $('#greetingText').textContent = greeting();
    $('#heroName').textContent = s.name || 'موظف';
    $('#todayGregorian').textContent =
      `${weekdayNamesAr[today.getDay()]}, ${today.getDate()} ${monthNamesAr[today.getMonth()]} ${today.getFullYear()}`;
    $('#todayHijri').textContent = formatHijri(today);

    // Status pills
    const pillsContainer = $('#todayStatusPills');
    pillsContainer.innerHTML = '';
    // Day type pill
    if (shift) {
      const p = el('span', { class: 'status-pill ' + shiftClass(shift) }, [
        el('i', { class: 'dot' }), shift.name
      ]);
      pillsContainer.appendChild(p);
    } else {
      pillsContainer.appendChild(el('span', { class: 'status-pill' }, [
        el('i', { class: 'dot' }), 'لم يتم تحديد الوردية'
      ]));
    }
    // Attendance pill
    if (entry) {
      const map = { A: ['present', 'حضرت'], X: ['double', 'مطبق'], L: ['leave', 'إجازة'], B: ['absent', 'غياب'] };
      const m = map[entry.status];
      if (m) {
        pillsContainer.appendChild(el('span', { class: 'status-pill ' + m[0] }, [
          el('i', { class: 'dot' }), m[1]
        ]));
      }
    } else {
      pillsContainer.appendChild(el('span', { class: 'status-pill' }, [
        el('i', { class: 'dot' }), 'لم أسجل الحضور'
      ]));
    }

    // Check-in / Check-out buttons
    const hasCheckIn = entry && (entry.status === 'A' || entry.status === 'X') && entry.from;
    const hasCheckOut = entry && (entry.status === 'A' || entry.status === 'X') && entry.to;
    $('#checkinActions').hidden = !!hasCheckIn;
    $('#checkoutActions').hidden = !hasCheckIn || !!hasCheckOut;
    if (hasCheckIn) {
      $('#checkinTime').textContent = 'تم التسجيل: ' + fmtTime12(entry.from);
    } else {
      $('#checkinTime').textContent = 'اضغط للتسجيل الآن';
    }
    if (hasCheckOut) {
      $('#checkoutTime').textContent = 'تم الانصراف: ' + fmtTime12(entry.to);
    } else if (hasCheckIn) {
      $('#checkoutTime').textContent = 'اضغط لتسجيل الانصراف';
    }

    // Today's hours / overtime / value
    const hours = SPAttendance.computeActualHours(entry);
    const overtime = SPAttendance.computeOvertimeHours(today, entry);
    const required = shift ? shift.hours : (Number(s.shiftHours) || 12);
    const value = SPAttendance.dayValue(today, entry);

    $('#todayHours').textContent = fmtHours(hours);
    $('#todayRequired').textContent = fmtHours(required);
    $('#todayOvertime').textContent = '+' + fmtHours(overtime);
    $('#todayValue').textContent = fmtCurrency(value);

    // Period stats (for stats cards + compliance)
    const { start, end } = SPCalendar.getPayPeriod(today);
    const result = SPSalary.computeSalary(start, end);
    $('#statPresent').textContent = result.counts.A;
    $('#statDouble').textContent = result.counts.X;
    $('#statLeave').textContent = result.counts.L;
    $('#statAbsent').textContent = result.counts.B;

    const workedDays = result.counts.A + result.counts.X + result.counts.B;
    const compliancePct = workedDays > 0
      ? Math.round(((result.counts.A + result.counts.X) / workedDays) * 100)
      : 0;
    $('#compliancePct').textContent = compliancePct + '%';
    $('#complianceBar').style.width = compliancePct + '%';
    $('#dueSalary').textContent = fmtCurrency(result.netSalary);
  }

  function shiftClass(shift) {
    // Map shift.color to a known pill class
    if (!shift) return '';
    if (shift.code === 'D') return 'day';
    if (shift.code === 'N') return 'night';
    if (shift.code === 'O') return 'off';
    if (shift.code === 'X') return 'double';
    return 'day';
  }

  // ---------- Data change handler ----------
  let changeTimer = null;
  function onDataChange() {
    // Debounce re-rendering to avoid flicker when multiple storage ops fire
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      const activeTab = document.querySelector('.tab-btn.active');
      const tab = activeTab ? activeTab.dataset.tab : 'dashboard';
      // Always refresh dashboard + calendar + salary + reports
      if (tab === 'dashboard') renderDashboard();
      SPCalendar.renderCalendar();
      SPCalendar.renderLegend();
      SPSalary.render();
      SPReports.render();
      // Topbar name
      $('#workerName').textContent = storage.getSettings().name || '—';
    }, 80);
  }

  // ---------- Search ----------
  function openSearch() {
    $('#searchOverlay').classList.add('show');
    $('#searchSheet').classList.add('show');
    setTimeout(() => $('#searchInput').focus(), 200);
  }
  function closeSearch() {
    $('#searchOverlay').classList.remove('show');
    $('#searchSheet').classList.remove('show');
    $('#searchInput').value = '';
    $('#searchResults').innerHTML = '';
  }

  function performSearch(query, statusFilter) {
    const results = $('#searchResults');
    results.innerHTML = '';
    const att = storage.getAttendance();
    const sched = storage.getSchedule();
    const all = new Set([...Object.keys(att), ...Object.keys(sched)]);
    const q = (query || '').trim().toLowerCase();
    const items = Array.from(all).sort().reverse();

    const filtered = items.filter((dstr) => {
      const entry = att[dstr];
      const code = sched[dstr];
      // Status filter
      if (statusFilter && (!entry || entry.status !== statusFilter)) return false;
      // Text query
      if (q) {
        const date = parseDate(dstr);
        const dateStr = `${date.getDate()} ${monthNamesAr[date.getMonth()]} ${date.getFullYear()}`;
        const dayName = weekdayNamesAr[date.getDay()];
        const shift = code ? storage.getShiftByCode(code) : null;
        const statusLabel = entry ? (SPAttendance.statusLabels[entry.status] || '') : '';
        const note = (entry && entry.note) || '';
        const location = (entry && entry.location) || '';
        const haystack = `${dstr} ${dateStr} ${dayName} ${shift ? shift.name : ''} ${statusLabel} ${note} ${location}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    }).slice(0, 60);

    if (filtered.length === 0) {
      results.appendChild(el('div', { class: 'empty-state' }, [
        el('div', { class: 't2' }, ['لا توجد نتائج'])
      ]));
      return;
    }
    filtered.forEach((dstr) => {
      const date = parseDate(dstr);
      const entry = att[dstr];
      const code = sched[dstr];
      const shift = code ? storage.getShiftByCode(code) : null;
      const statusLabel = entry ? (SPAttendance.statusLabels[entry.status] || '') : 'غير مسجل';
      const row = el('button', {
        class: 'item',
        style: 'display:flex;width:100%;padding:12px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);margin-bottom:6px;text-align:right;cursor:pointer;font-family:inherit;color:var(--text);'
      });
      const left = el('div', { style: 'flex:1;' }, []);
      left.appendChild(el('div', { class: 'fs-md fw-bold' }, [`${date.getDate()} ${monthNamesAr[date.getMonth()]} ${date.getFullYear()}`]));
      left.appendChild(el('div', { class: 'fs-sm muted' }, [
        `${weekdayNamesAr[date.getDay()]} • ${shift ? shift.name : '—'} • ${statusLabel}`
      ]));
      if (entry && entry.note) {
        left.appendChild(el('div', { class: 'fs-sm text-2', style: 'margin-top:4px;' }, ['📝 ' + entry.note]));
      }
      row.appendChild(left);
      if (entry) {
        const cls = entry.status === 'A' ? 'present' : entry.status === 'X' ? 'double' :
          entry.status === 'L' ? 'leave' : 'absent';
        row.appendChild(el('span', { class: 'status-pill ' + cls }, [statusLabel]));
      }
      row.addEventListener('click', () => {
        closeSearch();
        goToTab('calendar');
        setTimeout(() => SPAttendance.openDaySheet(date), 250);
      });
      results.appendChild(row);
    });
  }

  // ---------- Notifications (local, scheduled via setTimeout) ----------
  let notifTimers = [];
  function setupNotifications() {
    // Clear previous
    notifTimers.forEach((t) => clearTimeout(t));
    notifTimers = [];
    const s = storage.getSettings();
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const now = new Date();
    const today = new Date(now);

    function scheduleAt(timeStr, title, body) {
      if (!timeStr) return;
      const [h, m] = timeStr.split(':').map(Number);
      const target = new Date(today);
      target.setHours(h, m, 0, 0);
      if (target <= now) return; // already past
      const ms = target - now;
      const t = setTimeout(() => {
        try {
          new Notification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png' });
        } catch (e) {}
      }, ms);
      notifTimers.push(t);
    }

    if (s.notifyCheckIn) {
      scheduleAt(s.notifyCheckInTime, 'تذكير: تسجيل الحضور', 'لا تنسَ تسجيل حضورك لهذا اليوم');
    }
    if (s.notifyCheckOut) {
      scheduleAt(s.notifyCheckOutTime, 'تذكير: تسجيل الانصراف', 'لا تنسَ تسجيل انصرافك قبل المغادرة');
    }
    if (s.notifyShiftEnd) {
      const today = new Date();
      const dstr = fmtDate(today);
      const code = storage.getScheduledCode(dstr);
      const shift = code ? storage.getShiftByCode(code) : null;
      if (shift && shift.endTime) {
        scheduleAt(shift.endTime, 'تذكير: نهاية الوردية', 'انتهت ورديتك المجدولة — سجّل انصرافك');
      }
    }
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      toast('الإشعارات غير مدعومة على هذا الجهاز', 'warning');
      return false;
    }
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      toast('تم تفعيل الإشعارات', 'success');
      setupNotifications();
      return true;
    } else {
      toast('تم رفض الإذن — يمكنك تفعيله من إعدادات المتصفح', 'warning');
      return false;
    }
  }

  // ---------- PWA install prompt ----------
  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      installPromptEvent = e;
      // Show banner if not previously dismissed (within 7 days)
      const dismissed = storage.getMeta('installDismissedAt');
      if (dismissed) {
        const days = (Date.now() - new Date(dismissed).getTime()) / 86400000;
        if (days < 7) return;
      }
      setTimeout(() => {
        $('#installBanner').classList.add('show');
      }, 3000);
    });

    $('#installAcceptBtn').addEventListener('click', async () => {
      $('#installBanner').classList.remove('show');
      if (!installPromptEvent) {
        toast('افتح قائمة المتصفح واختر "إضافة للشاشة الرئيسية"', 'info');
        return;
      }
      installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      installPromptEvent = null;
      if (choice.outcome === 'accepted') {
        toast('جاري التثبيت...', 'success');
      }
    });
    $('#installDismissBtn').addEventListener('click', () => {
      $('#installBanner').classList.remove('show');
      storage.setMeta('installDismissedAt', new Date().toISOString());
    });

    // Already installed
    window.addEventListener('appinstalled', () => {
      $('#installBanner').classList.remove('show');
      storage.setMeta('installedAt', new Date().toISOString());
      toast('تم تثبيت ShiftPro!', 'success');
    });
  }

  // ---------- Service worker ----------
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch((err) => {
        console.warn('[SW] registration failed', err);
      });
      // Listen for updates
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Refresh to apply update
        if (navigator.serviceWorker.controller) {
          // Don't auto-reload; just notify
          // User can refresh manually
        }
      });
    }
  }

  // ---------- Update worker name in topbar ----------
  function updateTopbar() {
    $('#workerName').textContent = storage.getSettings().name || '—';
  }

  // ---------- Handle URL params (PWA shortcuts) ----------
  function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const action = params.get('action');
    if (tab) {
      setTimeout(() => goToTab(tab), 300);
    }
    if (action === 'checkin') {
      setTimeout(() => {
        SPAttendance.checkInToday ? null : null;
        // Trigger via the dashboard button to ensure proper flow
        const btn = $('#checkinBtn');
        if (btn && !btn.hidden) btn.click();
      }, 500);
    }
  }

  // ---------- Init ----------
  function init() {
    // Initialize storage (runs migration if needed)
    storage.init();
    storage.subscribe(onDataChange);

    // Apply theme
    SPSettings.applyTheme();
    updateTopbar();

    // Initialize all modules
    SPCalendar.init();
    SPAttendance.init();
    SPSalary.init();
    SPReports.init();
    SPSettings.init();

    // Initial render
    renderDashboard();
    SPCalendar.renderCalendar();
    SPSalary.render();
    SPReports.render();

    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', onClickOnce(() => goToTab(btn.dataset.tab)));
    });

    // Search
    $('#searchBtn').addEventListener('click', onClickOnce(openSearch));
    $('#closeSearchBtn').addEventListener('click', closeSearch);
    $('#searchOverlay').addEventListener('click', closeSearch);
    const debouncedSearch = debounce(() => {
      const q = $('#searchInput').value;
      performSearch(q, null);
    }, 200);
    $('#searchInput').addEventListener('input', debouncedSearch);
    document.querySelectorAll('[data-search-status]').forEach((chip) => {
      chip.addEventListener('click', () => {
        performSearch('', chip.dataset.searchStatus);
      });
    });

    // Hide splash after delay (or on first interaction)
    setTimeout(hideSplash, 2200);
    // Also hide on first tap
    const hideOnTap = () => {
      hideSplash();
      document.removeEventListener('click', hideOnTap);
      document.removeEventListener('keydown', hideOnTap);
    };
    document.addEventListener('click', hideOnTap);
    document.addEventListener('keydown', hideOnTap);

    // PWA + SW
    registerSW();
    setupInstallPrompt();

    // Notifications — request on first action only, not on load
    // But setup if already granted
    if ('Notification' in window && Notification.permission === 'granted') {
      setupNotifications();
    }

    // Watch for system time zone / date changes (e.g., when app stays open across midnight)
    let lastDay = new Date().getDate();
    setInterval(() => {
      const today = new Date().getDate();
      if (today !== lastDay) {
        lastDay = today;
        onDataChange();
        setupNotifications();
      }
    }, 60000);

    // Handle URL params
    handleUrlParams();

    // Auto-save settings sheet's "enable notifications" toggles
    document.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'inpNotifyCheckIn' && e.target.checked) {
        requestNotificationPermission().then((granted) => {
          if (!granted) {
            e.target.checked = false;
          }
        });
      }
      if (e.target && e.target.id === 'inpNotifyCheckOut' && e.target.checked) {
        requestNotificationPermission().then((granted) => {
          if (!granted) e.target.checked = false;
        });
      }
      if (e.target && e.target.id === 'inpNotifyShiftEnd' && e.target.checked) {
        requestNotificationPermission().then((granted) => {
          if (!granted) e.target.checked = false;
        });
      }
    });

    // Handle keyboard: ESC closes any open sheet
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.sheet.show').forEach((s) => s.classList.remove('show'));
        document.querySelectorAll('.sheet-overlay.show').forEach((o) => o.classList.remove('show'));
      }
    });

    // Console signature
    console.log('%cShiftPro v2.0', 'color:#3b82f6;font-size:18px;font-weight:bold;');
    console.log('Designed & Developed by Amir Anwar');
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.SPApp = {
    onDataChange,
    goToTab,
    requestNotificationPermission
  };
})(window);
