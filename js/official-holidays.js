/* =========================================================
   SHIFTPROO
   Official Holidays + Islamic Dates - Egypt
   ---------------------------------------------------------
   مسؤول عن:
   1) الإجازات الرسمية في مصر
   2) المناسبات الإسلامية الرسمية
   3) بداية شهر رمضان
   4) تحويل التاريخ الهجري إلى ميلادي
   5) معرفة هل اليوم إجازة رسمية
   6) معرفة هل اليوم أول رمضان

   قواعد النظام:
   - الإجازة الرسمية تظهر كمناسبة في التقويم فقط.
   - لا يتم إنشاء ساعات عمل تلقائيًا بسبب الإجازة الرسمية.
   - الإجازة الرسمية لا تخصم من رصيد الموظف.
   - الموظف يستطيع تسجيل الحضور في الإجازة الرسمية.
   - إذا سجل الموظف حضورًا، يتم حساب ساعات عمله طبيعيًا.
   - الإجازة الرسمية لا تمنع فتح اليوم أو تعديل الحضور.
   - أول رمضان ليس إجازة رسمية.
========================================================= */

(function (window) {
  "use strict";

  const VERSION = "2.1.0";

  /* =======================================================
     الإجازات الرسمية الثابتة في مصر
  ======================================================= */

  const FIXED_HOLIDAYS = [
    {
      month: 1,
      day: 7,
      name: "عيد الميلاد المجيد"
    },

    {
      month: 1,
      day: 25,
      name: "ثورة 25 يناير وعيد الشرطة"
    },

    {
      month: 4,
      day: 25,
      name: "عيد تحرير سيناء"
    },

    {
      month: 5,
      day: 1,
      name: "عيد العمال"
    },

    {
      month: 6,
      day: 30,
      name: "ثورة 30 يونيو"
    },

    {
      month: 7,
      day: 23,
      name: "ثورة 23 يوليو"
    },

    {
      month: 10,
      day: 6,
      name: "عيد القوات المسلحة – 6 أكتوبر"
    }
  ];

  /* =======================================================
     الإجازات الإسلامية الرسمية

     التاريخ الهجري يتحول إلى ميلادي تلقائيًا.
  ======================================================= */

  const ISLAMIC_OFFICIAL_HOLIDAYS = [
    {
      month: 1,
      day: 1,
      name: "رأس السنة الهجرية",
      duration: 1
    },

    {
      month: 3,
      day: 12,
      name: "المولد النبوي الشريف",
      duration: 1
    },

    {
      month: 10,
      day: 1,
      name: "عيد الفطر المبارك",
      duration: 4
    },

    {
      month: 12,
      day: 9,
      name: "وقفة عرفات",
      duration: 1
    },

    {
      month: 12,
      day: 10,
      name: "عيد الأضحى المبارك",
      duration: 4
    }
  ];

  /* =======================================================
     بداية شهر رمضان

     ليست إجازة رسمية.
  ======================================================= */

  const RAMADAN_START = {
    month: 9,
    day: 1,
    name: "أول رمضان",
    type: "religious-date",
    category: "ramadan",

    isRamadanStart: true,

    isOfficialHoliday: false,

    isPersonalLeave: false,

    hours: 0,

    salaryHours: 0
  };

  /* =======================================================
     التواريخ الرسمية المنقولة

     يتم وضعها هنا عندما يصدر القرار الرسمي.
  ======================================================= */

  const OFFICIAL_OVERRIDES = {

    /*
    مثال:

    "2026-08-27": {
      name: "المولد النبوي الشريف",
      originalDate: "2026-08-25"
    }

    */

  };

  /* =======================================================
     أدوات التاريخ
  ======================================================= */

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatDate(year, month, day) {
    return (
      String(year) +
      "-" +
      pad(month) +
      "-" +
      pad(day)
    );
  }

  function dateToString(date) {
    return formatDate(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate()
    );
  }

  function addDays(date, days) {
    const result = new Date(date);

    result.setDate(
      result.getDate() + days
    );

    return result;
  }

  /* =======================================================
     Gregorian -> Julian Day
  ======================================================= */

  function gregorianToJD(
    year,
    month,
    day
  ) {
    let y = year;
    let m = month;

    if (m <= 2) {
      y -= 1;
      m += 12;
    }

    const A =
      Math.floor(y / 100);

    const B =
      2 -
      A +
      Math.floor(A / 4);

    return (
      Math.floor(
        365.25 * (y + 4716)
      ) +
      Math.floor(
        30.6001 * (m + 1)
      ) +
      day +
      B -
      1524.5
    );
  }

  /* =======================================================
     Julian Day -> Gregorian
  ======================================================= */

  function jdToGregorian(jd) {
    const z =
      Math.floor(jd + 0.5);

    const f =
      jd + 0.5 - z;

    let A = z;

    if (z >= 2299161) {
      const alpha =
        Math.floor(
          (z - 1867216.25) /
          36524.25
        );

      A =
        z +
        1 +
        alpha -
        Math.floor(alpha / 4);
    }

    const B =
      A + 1524;

    const C =
      Math.floor(
        (B - 122.1) /
        365.25
      );

    const D =
      Math.floor(
        365.25 * C
      );

    const E =
      Math.floor(
        (B - D) /
        30.6001
      );

    const day =
      B -
      D -
      Math.floor(
        30.6001 * E
      ) +
      f;

    let month;

    if (E < 14) {
      month = E - 1;
    } else {
      month = E - 13;
    }

    let year;

    if (month > 2) {
      year = C - 4716;
    } else {
      year = C - 4715;
    }

    return new Date(
      year,
      month - 1,
      Math.floor(day)
    );
  }

  /* =======================================================
     Hijri -> Julian Day
  ======================================================= */

  function islamicToJD(
    year,
    month,
    day
  ) {
    return (
      day +
      Math.ceil(
        29.5 * (month - 1)
      ) +
      (year - 1) * 354 +
      Math.floor(
        (3 + 11 * year) / 30
      ) +
      1948439.5 -
      1
    );
  }

  /* =======================================================
     Hijri -> Gregorian
  ======================================================= */

  function hijriToGregorian(
    hijriYear,
    hijriMonth,
    hijriDay
  ) {
    const jd =
      islamicToJD(
        hijriYear,
        hijriMonth,
        hijriDay
      );

    return jdToGregorian(jd);
  }

  /* =======================================================
     Gregorian -> Hijri
  ======================================================= */

  function gregorianToHijri(date) {
    const jd =
      gregorianToJD(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate()
      );

    const year =
      Math.floor(
        (
          30 *
            (jd - 1948439.5) +
          10646
        ) / 10631
      );

    let month =
      Math.ceil(
        (
          jd -
          (
            29 +
            islamicToJD(
              year,
              1,
              1
            )
          )
        ) / 29.5
      ) + 1;

    month =
      Math.max(
        1,
        Math.min(
          12,
          month
        )
      );

    const firstDay =
      islamicToJD(
        year,
        month,
        1
      );

    const day =
      Math.floor(
        jd -
        firstDay +
        1
      );

    return {
      year,
      month,
      day
    };
  }

  /* =======================================================
     السنوات الهجرية داخل السنة الميلادية
  ======================================================= */

  function getHijriYearsForYear(
    gregorianYear
  ) {
    const start =
      new Date(
        gregorianYear,
        0,
        1
      );

    const end =
      new Date(
        gregorianYear,
        11,
        31
      );

    const first =
      gregorianToHijri(start);

    const last =
      gregorianToHijri(end);

    const years = [];

    if (
      !years.includes(first.year)
    ) {
      years.push(first.year);
    }

    if (
      !years.includes(last.year)
    ) {
      years.push(last.year);
    }

    return years;
  }

  /* =======================================================
     إنشاء كائن الإجازة الرسمية
  ======================================================= */

  function createOfficialHoliday(
    date,
    name,
    extra = {}
  ) {
    return {
      date,

      name,

      type: "official",

      category:
        extra.category ||
        "official",

      source:
        extra.source ||
        "official",

      /*
       * لا توجد ساعات عمل تلقائية.
       *
       * إذا سجل الموظف حضورًا،
       * يتم حساب الساعات من سجل الحضور نفسه.
       */
      hours: 0,

      salaryHours: 0,

      /*
       * لا تخصم من رصيد الإجازات.
       */
      deductLeaveBalance: false,

      /*
       * اليوم إجازة رسمية من ناحية المناسبة
       * فقط، وليس قفلًا للحضور.
       */
      isOfficialHoliday: true,

      isPersonalLeave: false,

      paid:
        extra.paid !== false,

      hijri:
        extra.hijri || null
    };
  }

  /* =======================================================
     إنشاء الإجازات الثابتة
  ======================================================= */

  function buildFixedHolidays(
    year
  ) {
    return FIXED_HOLIDAYS.map(
      (holiday) => {
        return createOfficialHoliday(
          formatDate(
            year,
            holiday.month,
            holiday.day
          ),
          holiday.name,
          {
            category:
              "national",

            source:
              "gregorian"
          }
        );
      }
    );
  }

  /* =======================================================
     إنشاء الإجازات الإسلامية الرسمية
  ======================================================= */

  function buildIslamicOfficialHolidays(
    year
  ) {
    const holidays = [];

    const hijriYears =
      getHijriYearsForYear(
        year
      );

    hijriYears.forEach(
      (hijriYear) => {

        ISLAMIC_OFFICIAL_HOLIDAYS.forEach(
          (holiday) => {

            const firstDate =
              hijriToGregorian(
                hijriYear,
                holiday.month,
                holiday.day
              );

            for (
              let i = 0;
              i < holiday.duration;
              i++
            ) {
              const currentDate =
                addDays(
                  firstDate,
                  i
                );

              if (
                currentDate.getFullYear() !==
                Number(year)
              ) {
                continue;
              }

              let name =
                holiday.name;

              /* ================================
                 أسماء أيام عيد الفطر
              ================================= */

              if (
                holiday.name ===
                "عيد الفطر المبارك"
              ) {
                if (i === 1) {
                  name =
                    "ثاني أيام عيد الفطر المبارك";
                }

                if (i === 2) {
                  name =
                    "ثالث أيام عيد الفطر المبارك";
                }

                if (i === 3) {
                  name =
                    "رابع أيام عيد الفطر المبارك";
                }
              }

              /* ================================
                 أسماء أيام عيد الأضحى
              ================================= */

              if (
                holiday.name ===
                "عيد الأضحى المبارك"
              ) {
                if (i === 1) {
                  name =
                    "ثاني أيام عيد الأضحى المبارك";
                }

                if (i === 2) {
                  name =
                    "ثالث أيام عيد الأضحى المبارك";
                }

                if (i === 3) {
                  name =
                    "رابع أيام عيد الأضحى المبارك";
                }
              }

              holidays.push(
                createOfficialHoliday(
                  dateToString(
                    currentDate
                  ),
                  name,
                  {
                    category:
                      "islamic",

                    source:
                      "hijri",

                    hijri: {
                      year:
                        hijriYear,

                      month:
                        holiday.month,

                      day:
                        holiday.day + i
                    }
                  }
                )
              );
            }
          }
        );
      }
    );

    return holidays;
  }

  /* =======================================================
     إنشاء بداية رمضان
  ======================================================= */

  function getRamadanStart(
    year
  ) {
    const hijriYears =
      getHijriYearsForYear(
        year
      );

    for (
      const hijriYear of hijriYears
    ) {
      const date =
        hijriToGregorian(
          hijriYear,
          RAMADAN_START.month,
          RAMADAN_START.day
        );

      if (
        date.getFullYear() ===
        Number(year)
      ) {
        return {
          date:
            dateToString(date),

          name:
            RAMADAN_START.name,

          type:
            RAMADAN_START.type,

          category:
            RAMADAN_START.category,

          source:
            "hijri",

          isRamadanStart:
            true,

          isOfficialHoliday:
            false,

          isPersonalLeave:
            false,

          hours: 0,

          salaryHours: 0,

          deductLeaveBalance:
            false,

          hijri: {
            year:
              hijriYear,

            month: 9,

            day: 1
          }
        };
      }
    }

    return null;
  }

  /* =======================================================
     جميع الإجازات الرسمية للسنة
  ======================================================= */

  function getOfficialHolidays(
    year
  ) {
    year =
      Number(year) ||
      new Date().getFullYear();

    let holidays = [];

    holidays =
      holidays.concat(
        buildFixedHolidays(
          year
        )
      );

    holidays =
      holidays.concat(
        buildIslamicOfficialHolidays(
          year
        )
      );

    /* ================================================
       تطبيق النقل الرسمي
    ================================================= */

    Object.keys(
      OFFICIAL_OVERRIDES
    ).forEach(
      (date) => {

        if (
          !date.startsWith(
            `${year}-`
          )
        ) {
          return;
        }

        const override =
          OFFICIAL_OVERRIDES[
            date
          ];

        holidays.push(
          createOfficialHoliday(
            date,

            override.name ||
              "إجازة رسمية",

            {
              category:
                override.category ||
                "official",

              source:
                "official-override",

              hijri:
                override.hijri ||
                null
            }
          )
        );
      }
    );

    /* ================================================
       إزالة التكرار
    ================================================= */

    const map =
      new Map();

    holidays.forEach(
      (holiday) => {

        if (
          !map.has(
            holiday.date
          )
        ) {
          map.set(
            holiday.date,
            holiday
          );
        }
      }
    );

    holidays =
      Array.from(
        map.values()
      );

    /* ================================================
       ترتيب حسب التاريخ
    ================================================= */

    holidays.sort(
      (a, b) =>
        a.date.localeCompare(
          b.date
        )
    );

    return holidays;
  }

  /* =======================================================
     جميع التواريخ الخاصة للسنة
  ======================================================= */

  function getSpecialDates(
    year
  ) {
    const holidays =
      getOfficialHolidays(
        year
      );

    const ramadan =
      getRamadanStart(
        year
      );

    const result = [
      ...holidays
    ];

    /*
     * أول رمضان يظهر كمناسبة منفصلة
     * ولا يتحول إلى إجازة.
     */

    if (
      ramadan &&
      !result.some(
        (item) =>
          item.date ===
          ramadan.date
      )
    ) {
      result.push(
        ramadan
      );
    }

    result.sort(
      (a, b) =>
        a.date.localeCompare(
          b.date
        )
    );

    return result;
  }

  /* =======================================================
     البحث عن إجازة رسمية
  ======================================================= */

  function getOfficialHoliday(
    date
  ) {
    let dateString = "";

    if (
      date instanceof Date
    ) {
      dateString =
        dateToString(date);
    } else {
      dateString =
        String(date || "");
    }

    if (
      !dateString
    ) {
      return null;
    }

    const year =
      Number(
        dateString.substring(
          0,
          4
        )
      );

    const holidays =
      getOfficialHolidays(
        year
      );

    return (
      holidays.find(
        (holiday) =>
          holiday.date ===
          dateString
      ) || null
    );
  }

  /* =======================================================
     البحث عن أي تاريخ خاص
  ======================================================= */

  function getSpecialDate(
    date
  ) {
    let dateString = "";

    if (
      date instanceof Date
    ) {
      dateString =
        dateToString(date);
    } else {
      dateString =
        String(date || "");
    }

    if (
      !dateString
    ) {
      return null;
    }

    const year =
      Number(
        dateString.substring(
          0,
          4
        )
      );

    const specialDates =
      getSpecialDates(
        year
      );

    return (
      specialDates.find(
        (item) =>
          item.date ===
          dateString
      ) || null
    );
  }

  /* =======================================================
     هل اليوم إجازة رسمية؟
  ======================================================= */

  function isOfficialHoliday(
    date
  ) {
    return !!getOfficialHoliday(
      date
    );
  }

  /* =======================================================
     هل اليوم أول رمضان؟
  ======================================================= */

  function isRamadanStart(
    date
  ) {
    const special =
      getSpecialDate(
        date
      );

    return !!(
      special &&
      special.isRamadanStart
    );
  }

  /* =======================================================
     الحصول على بداية رمضان
  ======================================================= */

  function getRamadanStartDate(
    year
  ) {
    const ramadan =
      getRamadanStart(
        year
      );

    return ramadan
      ? ramadan.date
      : null;
  }

  /* =======================================================
     ساعات الإجازة الرسمية التلقائية
  =======================================================

     مهم:

     ترجع 0 لأن الإجازة الرسمية لا تنشئ
     ساعات عمل تلقائيًا.

     إذا كان هناك سجل حضور في نفس اليوم،
     يجب أن يعتمد حساب الساعات على سجل الحضور
     وليس على هذه الدالة.
  ======================================================= */

  function getOfficialHolidayHours(
    date
  ) {
    return 0;
  }

  /* =======================================================
     اسم الإجازة الرسمية
  ======================================================= */

  function getOfficialHolidayName(
    date
  ) {
    const holiday =
      getOfficialHoliday(
        date
      );

    return holiday
      ? holiday.name
      : "";
  }

  /* =======================================================
     هل يجب استبعاد اليوم من المرتب؟
  =======================================================

     الإجازة الرسمية لا تستبعد سجل الحضور.

     لو الموظف اشتغل في اليوم:
     يتم حساب ساعات العمل من attendance.

     لو لم يعمل:
     لا يتم إنشاء ساعات تلقائية.
  ======================================================= */

  function shouldExcludeFromSalary(
    date
  ) {
    return false;
  }

  /* =======================================================
     معرفة هل التاريخ الرسمي يسمح بتسجيل الحضور
  ======================================================= */

  function canRegisterAttendance(
    date
  ) {
    /*
     * حتى لو كان اليوم إجازة رسمية،
     * الموظف يستطيع تسجيل الحضور.
     */

    return true;
  }

  /* =======================================================
     معرفة هل اليوم يخصم من رصيد الإجازات
  ======================================================= */

  function shouldDeductLeaveBalance(
    date
  ) {
    /*
     * الإجازة الرسمية لا تخصم من الرصيد.
     */

    return false;
  }

  /* =======================================================
     API
  ======================================================= */

  window.SPOfficialHolidays = {

    version: VERSION,

    FIXED_HOLIDAYS,

    ISLAMIC_OFFICIAL_HOLIDAYS,

    RAMADAN_START,

    getOfficialHolidays,

    getOfficialHoliday,

    getSpecialDates,

    getSpecialDate,

    getRamadanStart,

    getRamadanStartDate,

    isOfficialHoliday,

    isRamadanStart,

    getOfficialHolidayHours,

    getOfficialHolidayName,

    shouldExcludeFromSalary,

    canRegisterAttendance,

    shouldDeductLeaveBalance,

    gregorianToHijri,

    hijriToGregorian,

    addDays,

    dateToString
  };

  /* =======================================================
     توافق مع أي كود قديم
  ======================================================= */

  window.OfficialHolidays =
    window.SPOfficialHolidays;

})(window);