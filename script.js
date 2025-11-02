// --- Utility ---
const $$ = (sel, ctx = document) => ctx.querySelector(sel);
const $$$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// Toast
function toast(title, msg) {
  const node = $$("#toast");
  if (!node) return;
  node.innerHTML = "<strong>" + title + "</strong><div>" + msg + "</div>";
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 4000);
}

function formatCurrency(amount) {
  if (!Number.isFinite(amount)) return "$0.00";
  return "$" + amount.toFixed(2);
}

// Navigation toggle for mobile
const navContainer = $$(".nav");
const navToggle = $$(".nav-toggle");
const primaryNav = $$("#primary-nav");
if (navContainer && navToggle && primaryNav) {
  const closeNav = () => {
    navContainer.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
  };
  navToggle.addEventListener("click", () => {
    const isOpen = navContainer.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
  primaryNav
    .querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", closeNav));
  const mq = window.matchMedia("(min-width: 1025px)");
  const handleResize = (event) => {
    if (event.matches) {
      closeNav();
    }
  };
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handleResize);
  } else if (typeof mq.addListener === "function") {
    mq.addListener(handleResize);
  }
}

const navLinks = $$$("[data-nav-link]");
const navSections = $$$("[data-nav-section]");
if (
  navLinks.length &&
  navSections.length &&
  typeof IntersectionObserver === "function"
) {
  const linkById = new Map();
  navLinks.forEach((link) => {
    const hash = link.getAttribute("href");
    if (!hash || !hash.startsWith("#")) return;
    linkById.set(hash.slice(1), link);
  });

  const setActive = (id) => {
    navLinks.forEach((link) =>
      link.classList.toggle("active", link === linkById.get(id))
    );
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        .slice(0, 1)
        .forEach((entry) => {
          const id = entry.target.getAttribute("id");
          if (id && linkById.has(id)) {
            setActive(id);
          }
        });
    },
    {
      rootMargin: "-40% 0px -45% 0px",
      threshold: [0.25, 0.5, 0.75],
    }
  );

  navSections.forEach((section) => observer.observe(section));
  const firstId = navSections[0]?.getAttribute("id");
  if (firstId && linkById.has(firstId)) {
    setActive(firstId);
  }
}

// Calendar / Booking
const timeSlots = [
  {
    id: "slot-1",
    label: "4:00 AM",
    start: "04:00",
    durationMinutes: 60,
    legacyKey: "4:00 AM",
  },
  {
    id: "slot-2",
    label: "5:00 AM",
    start: "05:00",
    durationMinutes: 60,
    legacyKey: "5:00 AM",
  },
  {
    id: "slot-3",
    label: "6:00 AM",
    start: "06:00",
    durationMinutes: 60,
    legacyKey: "6:00 AM",
  },
  {
    id: "slot-4",
    label: "7:00 AM",
    start: "07:00",
    durationMinutes: 60,
    legacyKey: "7:00 AM",
  },
  {
    id: "slot-5",
    label: "8:00 AM",
    start: "08:00",
    durationMinutes: 60,
    legacyKey: "8:00 AM",
  },
  {
    id: "slot-6",
    label: "9:00 AM",
    start: "09:00",
    durationMinutes: 60,
    legacyKey: "9:00 AM",
  },
  {
    id: "slot-7",
    label: "10:00 AM",
    start: "10:00",
    durationMinutes: 60,
    legacyKey: "10:00 AM",
  },
  {
    id: "slot-8",
    label: "11:00 AM",
    start: "11:00",
    durationMinutes: 60,
    legacyKey: "11:00 AM",
  },
  {
    id: "slot-9",
    label: "12:00 PM - 12:30 PM (Lunch)",
    start: "12:00",
    durationMinutes: 30,
    legacyKey: "12:00 PM",
    selectable: false,
  },
  {
    id: "slot-10",
    label: "1:00 PM",
    start: "13:00",
    durationMinutes: 60,
    legacyKey: "1:00 PM",
  },
  {
    id: "slot-11",
    label: "2:00 PM",
    start: "14:00",
    durationMinutes: 60,
    legacyKey: "2:00 PM",
  },
  {
    id: "slot-12",
    label: "3:00 PM",
    start: "15:00",
    durationMinutes: 60,
    legacyKey: "3:00 PM",
  },
  {
    id: "slot-13",
    label: "4:00 PM",
    start: "16:00",
    durationMinutes: 60,
    legacyKey: "4:00 PM",
  },
  {
    id: "slot-14",
    label: "5:00 PM",
    start: "17:00",
    durationMinutes: 60,
    legacyKey: "5:00 PM",
  },
  {
    id: "slot-15",
    label: "6:00 PM",
    start: "18:00",
    durationMinutes: 60,
    legacyKey: "6:00 PM",
  },
  {
    id: "slot-16",
    label: "7:00 PM",
    start: "19:00",
    durationMinutes: 60,
    legacyKey: "7:00 PM",
  },
];
const RATE_PER_HOUR = 35;
let current = new Date();
current.setDate(1);
const selectedDates = new Set();
let lastSelectedDateKey = null;
const selectedSlots = new Set();

const calTitle = $$(".cal-title");
const calDays = $$("#cal-days");
const quickPayButtons = $$$("[data-quick-pay-button]");
const quickPayTotals = $$$("[data-quick-pay-total]");
const quickPayScrollButtons = $$$("[data-quick-pay-scroll]");

function ymd(d) {
  return d.toISOString().split("T")[0];
}

function parseYMD(str) {
  const [y, m, day] = str.split("-").map((v) => parseInt(v, 10));
  return new Date(y, m - 1, day);
}

function getSelectedSlots() {
  return [...selectedSlots]
    .map((id) =>
      timeSlots.find((slot) => slot.id === id && slot.selectable !== false)
    )
    .filter(Boolean)
    .sort((a, b) => (a.start > b.start ? 1 : -1));
}

function calculateBookingTotals() {
  const slots = getSelectedSlots();
  const days = selectedDates.size;
  const minutesPerDay = slots.reduce(
    (total, slot) => total + slot.durationMinutes,
    0
  );
  const totalMinutes = minutesPerDay * days;
  const hours = totalMinutes / 60;
  const amount = Math.round(((totalMinutes * RATE_PER_HOUR) / 60) * 100) / 100;
  return { slots, days, minutesPerDay, totalMinutes, hours, amount };
}

function pluralize(value, singular, plural = singular + "s") {
  return value === 1 ? singular : plural;
}

function formatQuantity(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function updateQuickPaySummary() {
  if (!quickPayButtons.length && !quickPayTotals.length) return;
  const isProcessing = paymentForm?.classList.contains("processing");
  const { amount, days, hours, slots } = calculateBookingTotals();
  const hasDates = days > 0;
  const hasSlots = slots.length > 0;
  const isReady = amount > 0 && hasDates && hasSlots;
  let totalMessage;
  if (isReady) {
    const dayLabel = pluralize(days, "day");
    const hourLabel = Math.abs(hours - 1) < 1e-9 ? "hour" : "hours";
    const hoursValue = formatQuantity(hours);
    totalMessage = `${formatCurrency(amount)} • ${formatQuantity(
      days
    )} ${dayLabel} • ${hoursValue} ${hourLabel}`;
  } else if (!hasDates && !hasSlots) {
    totalMessage = "Select dates and time slots to calculate your total.";
  } else if (!hasDates) {
    totalMessage = "Add at least one date to calculate your total.";
  } else {
    totalMessage = "Add at least one time slot to calculate your total.";
  }
  quickPayTotals.forEach((node) => {
    node.textContent = totalMessage;
  });
  quickPayButtons.forEach((button) => {
    const role = button.getAttribute("data-quick-pay-button");
    const label = isReady ? "Pay " + formatCurrency(amount) : "Pay $0.00";
    button.textContent = label;
    if (role === "submit") {
      if (isReady && !isProcessing) {
        button.removeAttribute("disabled");
      } else {
        button.setAttribute("disabled", "true");
      }
    } else if (role === "trigger") {
      if (isReady && !isProcessing) {
        button.removeAttribute("disabled");
      } else {
        button.setAttribute("disabled", "true");
      }
    }
  });
}

// Payment form integration using Stripe Checkout
const paymentForm = $$("#quick-pay");
if (paymentForm) {
  // When the payment button is clicked, create a checkout session on the
  // server and redirect the user to Stripe's hosted payment page.
  const quickPaySubmitButton = paymentForm.querySelector(
    "[data-quick-pay-button='submit']"
  );
  quickPayScrollButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.hasAttribute("disabled")) return;
      paymentForm.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  if (quickPaySubmitButton) {
    quickPaySubmitButton.addEventListener("click", async () => {
      const totals = calculateBookingTotals();
      // Ensure the user has selected dates and slots and the amount is positive
      if (!totals.slots.length || totals.days === 0 || totals.amount <= 0) {
        toast(
          "Schedule needed",
          "Select your dates and time slots before paying."
        );
        return;
      }
      const amountInCents = Math.round(totals.amount * 100);
      // Disable the button while processing
      quickPaySubmitButton.setAttribute("disabled", "true");
      quickPaySubmitButton.classList.add("loading");
      try {
        const response = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ amount: amountInCents }),
        });
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        throw new Error(data.error || "Unknown error");
      } catch (err) {
        console.error(err);
        toast("Payment error", "Unable to create checkout session.");
      } finally {
        quickPaySubmitButton.removeAttribute("disabled");
        quickPaySubmitButton.classList.remove("loading");
      }
    });
  }
}

function renderCalendar() {
  if (!calTitle || !calDays) return;
  calTitle.textContent = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(current);
  calDays.innerHTML = "";
  const year = current.getFullYear();
  const month = current.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // leading blanks
  for (let i = 0; i < first.getDay(); i++) {
    const blank = document.createElement("div");
    blank.setAttribute("aria-hidden", "true");
    calDays.appendChild(blank);
  }
  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(year, month, d);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day";
    btn.textContent = d;
    const disabled = date < today;
    btn.setAttribute("aria-disabled", disabled);
    btn.disabled = disabled;
    const key = ymd(date);
    btn.setAttribute(
      "aria-selected",
      selectedDates.has(key) ? "true" : "false"
    );
    btn.addEventListener("click", () => {
      if (disabled) return;
      const currentKey = ymd(date);
      const isSelected = selectedDates.has(currentKey);
      if (isSelected) {
        selectedDates.delete(currentKey);
        btn.setAttribute("aria-selected", "false");
        if (selectedDates.size === 0) {
          lastSelectedDateKey = null;
        } else if (lastSelectedDateKey === currentKey) {
          lastSelectedDateKey = [...selectedDates].sort()[0];
        }
      } else {
        selectedDates.add(currentKey);
        lastSelectedDateKey = currentKey;
        btn.setAttribute("aria-selected", "true");
      }
      selectedSlots.clear();
      renderTimeSlots();
    });
    calDays.appendChild(btn);
  }
}

function renderTimeSlots() {
  const wrap = $$("#time-slots");
  if (!wrap) return;
  wrap.innerHTML = "";
  const selectedDateKeys = [...selectedDates];
  timeSlots.forEach((slot) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot";
    b.textContent = slot.label;
    b.dataset.slotId = slot.id;
    const isLunch = slot.selectable === false;
    const booked =
      !isLunch &&
      selectedDateKeys.some((dateKey) => {
        const key = dateKey + "@" + slot.id;
        const legacyKey = slot.legacyKey
          ? dateKey + "@" + slot.legacyKey
          : null;
        return (
          localStorage.getItem("booked:" + key) ||
          (legacyKey && localStorage.getItem("booked:" + legacyKey))
        );
      });
    if (isLunch) {
      selectedSlots.delete(slot.id);
      b.disabled = true;
      b.setAttribute("aria-disabled", "true");
      b.title = "Lunch break";
      b.classList.add("slot-lunch");
    } else if (booked) {
      selectedSlots.delete(slot.id);
      b.disabled = true;
      b.setAttribute("aria-disabled", "true");
      b.title = "Already booked";
      b.classList.add("slot-booked");
    } else {
      b.addEventListener("click", () => {
        const isSelected = selectedSlots.has(slot.id);
        if (isSelected) {
          selectedSlots.delete(slot.id);
          b.setAttribute("aria-selected", "false");
        } else {
          if (selectedSlots.size >= 16) {
            toast(
              "Limit reached",
              "You can choose up to 16 time slots per day."
            );
            return;
          }
          selectedSlots.add(slot.id);
          b.setAttribute("aria-selected", "true");
        }
        updateQuickPaySummary();
      });
    }
    b.setAttribute(
      "aria-selected",
      selectedSlots.has(slot.id) ? "true" : "false"
    );
    wrap.appendChild(b);
  });
  updateQuickPaySummary();
}

const selectWeekBtn = $$(".cal-select-week");
const selectMonthBtn = $$(".cal-select-month");
const clearDatesBtn = $$(".cal-clear");

function futureOnly(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return copy >= today;
}

function addDateToSelection(date) {
  if (!futureOnly(date)) return false;
  const key = ymd(date);
  selectedDates.add(key);
  lastSelectedDateKey = key;
  return true;
}

if (selectWeekBtn) {
  selectWeekBtn.addEventListener("click", () => {
    const baseKey =
      lastSelectedDateKey ||
      (selectedDates.size ? [...selectedDates].sort()[0] : null);
    if (!baseKey) {
      toast(
        "Pick a day",
        "Select at least one day before choosing an entire week."
      );
      return;
    }
    const baseDate = parseYMD(baseKey);
    const weekStart = new Date(baseDate);
    weekStart.setDate(baseDate.getDate() - baseDate.getDay());
    let added = 0;
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      if (addDateToSelection(day)) {
        added++;
      }
    }
    if (!added) {
      toast("No available days", "That week is entirely in the past.");
      return;
    }
    lastSelectedDateKey = ymd(baseDate);
    selectedSlots.clear();
    renderCalendar();
    renderTimeSlots();
  });
}

if (selectMonthBtn) {
  selectMonthBtn.addEventListener("click", () => {
    const year = current.getFullYear();
    const month = current.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    let added = 0;
    let firstKey = null;
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(year, month, d);
      if (addDateToSelection(date)) {
        if (!firstKey) firstKey = ymd(date);
        added++;
      }
    }
    if (!added) {
      toast("No available days", "All days this month are in the past.");
      return;
    }
    if (firstKey) {
      lastSelectedDateKey = firstKey;
    }
    selectedSlots.clear();
    renderCalendar();
    renderTimeSlots();
  });
}

if (clearDatesBtn) {
  clearDatesBtn.addEventListener("click", () => {
    selectedDates.clear();
    lastSelectedDateKey = null;
    selectedSlots.clear();
    renderCalendar();
    renderTimeSlots();
  });
}

// Month nav
const calPrev = $$(".cal-prev");
const calNext = $$(".cal-next");
calPrev?.addEventListener("click", () => {
  current.setMonth(current.getMonth() - 1);
  renderCalendar();
  renderTimeSlots();
});
calNext?.addEventListener("click", () => {
  current.setMonth(current.getMonth() + 1);
  renderCalendar();
  renderTimeSlots();
});

// Submit
const bookingForm = $$("#booking-form");
bookingForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $$("#name").value.trim();
  const email = $$("#email").value.trim();
  const phone = $$("#phone").value.trim();
  const notes = $$("#notes").value.trim();
  if (selectedDates.size === 0) {
    toast("Select a date", "Please choose a date on the calendar.");
    return;
  }
  if (selectedSlots.size === 0) {
    toast("Select a time", "Pick at least one time slot.");
    return;
  }
  if (!name || !email || !phone) {
    toast("Missing info", "Name, email, and phone are required.");
    return;
  }

  const { slots } = calculateBookingTotals();
  if (!slots.length) {
    toast("Select a time", "Pick at least one available slot.");
    return;
  }

  const dateKeys = [...selectedDates].sort();
  if (!dateKeys.length) {
    toast("Select a date", "Please choose at least one date.");
    return;
  }

  // "Save" the booking locally so the slot appears blocked for this browser
  const storagePayload = JSON.stringify({ name, email, phone, notes });
  dateKeys.forEach((dateKey) => {
    slots.forEach((slot) => {
      const key = dateKey + "@" + slot.id;
      localStorage.setItem("booked:" + key, storagePayload);
      if (slot.legacyKey) {
        localStorage.setItem(
          "booked:" + dateKey + "@" + slot.legacyKey,
          storagePayload
        );
      }
    });
  });

  // Generate an ICS file for the user
  function fmtICS(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      "00Z"
    );
  }
  const vevents = dateKeys
    .flatMap((dateKey) => {
      const [year, month, day] = dateKey.split("-").map((v) => parseInt(v, 10));
      return slots.map((slot) => {
        const start = new Date(year, month - 1, day);
        const [hours, minutes] = slot.start
          .split(":")
          .map((v) => parseInt(v, 10));
        start.setHours(hours, minutes, 0, 0);
        const end = new Date(
          start.getTime() + slot.durationMinutes * 60 * 1000
        );
        return `BEGIN:VEVENT
UID:${crypto.randomUUID()}
DTSTAMP:${fmtICS(new Date())}
DTSTART:${fmtICS(start)}
DTEND:${fmtICS(end)}
SUMMARY:Dog Training Session — ${slot.label}
DESCRIPTION:${name}\n${email}\n${phone}\n${notes.replace(/\n/g, " ")}
END:VEVENT`;
      });
    })
    .join("\n");

  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Bravo K9 Solutions//EN
${vevents}
END:VCALENDAR`;
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bravo-k9-consultation.ics";
  a.click();
  URL.revokeObjectURL(url);

  toast(
    "Request sent ✅",
    "We’ll be in touch to confirm. A calendar file has been downloaded."
  );
  e.target.reset();
  selectedDates.clear();
  lastSelectedDateKey = null;
  selectedSlots.clear();
  renderCalendar();
  renderTimeSlots();

  // Send booking details to the server API.  This allows the backend to
  // persist the request in MongoDB when the site is hosted as part of a
  // MERN stack.  The request is made after the UI feedback has been shown.
  try {
    // Compose a payload that includes the selected dates and time slots.
    const payload = {
      name,
      email,
      phone,
      message: notes,
      slot: slots.map((slot) => slot.id).join(","),
      dates: dateKeys,
    };
    fetch('/api/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.warn('Unable to submit booking to server:', err);
    });
  } catch (err) {
    console.warn('Unexpected error sending booking to server:', err);
  }
});

// Minor polish
$$("#year").textContent = new Date().getFullYear();
renderCalendar();
renderTimeSlots();

// Graduates carousel
(() => {
  const carousels = $$$("[data-carousel]");
  if (!carousels.length) return;

  carousels.forEach((carousel) => {
    const windowEl = carousel.querySelector("[data-carousel-window]");
    const track = carousel.querySelector("[data-carousel-track]");
    const prevBtn = carousel.querySelector("[data-carousel-prev]");
    const nextBtn = carousel.querySelector("[data-carousel-next]");
    const dotsHost =
      carousel.parentElement &&
      carousel.parentElement.querySelector("[data-carousel-dots]");

    if (!windowEl || !track) return;
    const cards = [...track.children];
    if (!cards.length) return;

    let currentIndex = 0;
    const dots = [];
    let baseOffset = cards[0].offsetLeft;

    if (dotsHost) {
      dotsHost.innerHTML = "";
      cards.forEach((_, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.setAttribute("aria-label", "View graduate " + (index + 1));
        dot.addEventListener("click", () => goTo(index));
        dotsHost.appendChild(dot);
        dots.push(dot);
      });
    }

    const updateControls = () => {
      if (prevBtn) prevBtn.disabled = currentIndex <= 0;
      if (nextBtn) nextBtn.disabled = currentIndex >= cards.length - 1;
      dots.forEach((dot, index) => {
        dot.setAttribute(
          "aria-current",
          index === currentIndex ? "true" : "false"
        );
      });
    };

    const scrollToCard = (index, behavior = "smooth") => {
      const target = cards[index];
      if (!target) return;
      const offset = target.offsetLeft - baseOffset;
      windowEl.scrollTo({ left: offset, behavior });
    };

    const goTo = (index, behavior = "smooth") => {
      const clamped = Math.max(0, Math.min(index, cards.length - 1));
      if (clamped === currentIndex && behavior === "smooth") {
        scrollToCard(clamped, behavior);
        return;
      }
      currentIndex = clamped;
      scrollToCard(clamped, behavior);
      updateControls();
    };

    const handlePrev = () => goTo(currentIndex - 1);
    const handleNext = () => goTo(currentIndex + 1);

    prevBtn && prevBtn.addEventListener("click", handlePrev);
    nextBtn && nextBtn.addEventListener("click", handleNext);

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const scrollLeft = windowEl.scrollLeft;
        let nearestIndex = currentIndex;
        let smallestDiff = Infinity;
        cards.forEach((card, index) => {
          const diff = Math.abs(card.offsetLeft - baseOffset - scrollLeft);
          if (diff < smallestDiff) {
            smallestDiff = diff;
            nearestIndex = index;
          }
        });
        if (nearestIndex !== currentIndex) {
          currentIndex = nearestIndex;
          updateControls();
        }
      });
    };

    windowEl.addEventListener("scroll", handleScroll, { passive: true });

    const handleResize = () => {
      baseOffset = cards[0].offsetLeft;
      goTo(currentIndex, "auto");
    };
    window.addEventListener("resize", handleResize);

    // Initialize
    goTo(0, "auto");
  });
})();

// Scroll-based reveal animations
(() => {
  const selectors = [
    ".hero-copy",
    ".hero-photo",
    ".mission-copy",
    ".mission-stats > div",
    ".info-copy",
    ".info-cards > .info-card",
    ".info-cards.info-steps > .info-card",
    ".proof-cards > .info-card",
    ".pricing-card",
    ".pricing-custom > *",
    ".card",
    ".certificate-grid",
    ".certificate-example figure",
    ".trainer-grid > *",
    ".booking-summary",
    ".press-strip .container",
  ];
  const revealSet = new Set();
  selectors.forEach((selector) => {
    $$$(selector).forEach((node) => {
      if (node instanceof Element) {
        revealSet.add(node);
      }
    });
  });
  const elements = Array.from(revealSet);
  if (!elements.length) return;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const supportsObserver = typeof IntersectionObserver === "function";

  const initialVisible = [];
  const isInViewport = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.bottom >= 0 && rect.top <= window.innerHeight;
  };

  elements.forEach((el, index) => {
    el.classList.add("reveal");
    if (!el.closest(".hero")) {
      el.classList.add("shine-sweep");
    }
    el.classList.add(index % 2 === 0 ? "reveal-left" : "reveal-right");
    const delayMs = Math.min(index * 70, 420);
    el.style.setProperty("--reveal-delay", delayMs + "ms");
    if (el.closest("footer")) {
      initialVisible.push(el);
    } else if (isInViewport(el)) {
      initialVisible.push(el);
    }
  });

  const showAll = () => {
    elements.forEach((el) => {
      el.classList.add("reveal-visible");
    });
  };

  if (!supportsObserver || motionQuery.matches) {
    showAll();
    return;
  }

  initialVisible.forEach((el) => el.classList.add("reveal-visible"));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const viewportHeight =
          entry.rootBounds && typeof entry.rootBounds.bottom === "number"
            ? entry.rootBounds.bottom
            : window.innerHeight;
        const isFooter = entry.target.closest("footer");
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal-visible");
        } else if (!isFooter && entry.boundingClientRect.top > viewportHeight) {
          entry.target.classList.remove("reveal-visible");
        }
      });
    },
    {
      threshold: 0.15,
      rootMargin: "0px 0px -10% 0px",
    }
  );

  elements.forEach((el) => observer.observe(el));

  const handleMotionChange = (event) => {
    if (event.matches) {
      observer.disconnect();
      showAll();
    }
  };

  if (typeof motionQuery.addEventListener === "function") {
    motionQuery.addEventListener("change", handleMotionChange);
  } else if (typeof motionQuery.addListener === "function") {
    motionQuery.addListener(handleMotionChange);
  }
})();
