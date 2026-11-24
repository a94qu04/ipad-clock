(function () {
  var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
  var weekDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  var lastHour24 = null;
  var lastDisplayedHour = "";
  var lastDisplayedMinute = "";

  var defaultToggles = {
    year: true,
    month: true,
    day: true,
    week: true,
    lunar: true,
    battery: true,
    weather: true,
    pomodoro: true,
    memo: true
  };

  function loadToggles() {
    var result = {};
    for (var k in defaultToggles) {
      if (defaultToggles.hasOwnProperty(k)) result[k] = defaultToggles[k];
    }
    try {
      var saved = JSON.parse(localStorage.getItem("ipad_clock_toggles_v6") || "{}");
      if (saved && typeof saved === "object") {
        for (var key in defaultToggles) {
          if (defaultToggles.hasOwnProperty(key) && typeof saved[key] === "boolean") {
            result[key] = saved[key];
          }
        }
      }
    } catch (e) {}
    return result;
  }

  var state = {
    theme: localStorage.getItem("ipad_clock_theme_v6") || "theme-flip",
    city: localStorage.getItem("ipad_clock_city_v6") || "25.066,121.662,汐止區",
    scale: parseInt(localStorage.getItem("ipad_clock_scale_v6") || "100", 10),
    dim: parseInt(localStorage.getItem("ipad_clock_dim_v6") || "0", 10),
    hour12: localStorage.getItem("ipad_clock_hour12_v6") === "true",
    chime: localStorage.getItem("ipad_clock_chime_v6") === "true",
    memo: localStorage.getItem("ipad_clock_memo_v6") || "",
    toggles: loadToggles()
  };

  if (isNaN(state.scale) || state.scale < 60 || state.scale > 140) state.scale = 100;
  if (isNaN(state.dim) || state.dim < 0 || state.dim > 80) state.dim = 0;

  // 機械翻頁 3D 動畫觸發
  function triggerFlip(cardId, oldVal, newVal) {
    if (!oldVal || oldVal === newVal || state.theme !== "theme-flip") return;
    var card = document.getElementById(cardId);
    if (!card) return;
    var oldBottom = card.querySelector(".flip-old-bottom .flip-leaf-num");
    var leafTop = card.querySelector(".flip-leaf-top .flip-leaf-num");
    var leafBottom = card.querySelector(".flip-leaf-bottom .flip-leaf-num");
    if (!oldBottom || !leafTop || !leafBottom) return;

    oldBottom.textContent = oldVal;
    leafTop.textContent = oldVal;
    leafBottom.textContent = newVal;

    card.classList.remove("flipping");
    void card.offsetWidth;
    card.classList.add("flipping");

    if (card._flipTimer) clearTimeout(card._flipTimer);
    card._flipTimer = setTimeout(function () {
      card.classList.remove("flipping");
    }, 450);
  }

  // 番茄鐘計時邏輯
  var pomoSeconds = 25 * 60;
  var pomoTimer = null;
  function renderPomo() {
    var m = Math.floor(pomoSeconds / 60);
    var s = pomoSeconds % 60;
    document.getElementById("pomo-display").textContent = pad(m) + ":" + pad(s);
  }

  document.getElementById("pomo-start").addEventListener("click", function () {
    if (pomoTimer) {
      clearInterval(pomoTimer);
      pomoTimer = null;
      this.textContent = "繼續";
    } else {
      var self = this;
      self.textContent = "暫停";
      pomoTimer = setInterval(function () {
        if (pomoSeconds > 0) {
          pomoSeconds--;
          renderPomo();
        } else {
          clearInterval(pomoTimer);
          pomoTimer = null;
          self.textContent = "開始";
          window.StandByServices.playChime();
          pomoSeconds = 25 * 60;
          renderPomo();
        }
      }, 1000);
    }
  });

  document.getElementById("pomo-reset").addEventListener("click", function () {
    clearInterval(pomoTimer);
    pomoTimer = null;
    pomoSeconds = 25 * 60;
    document.getElementById("pomo-start").textContent = "開始";
    renderPomo();
  });

  // 時鐘與農曆更新
  function updateClock(skipFlip) {
    var now = new Date();
    var h24 = now.getHours();
    var displayH = state.hour12 ? (h24 % 12 || 12) : h24;
    var hStr = pad(displayH);
    var mStr = pad(now.getMinutes());
    var sStr = pad(now.getSeconds());

    if (lastHour24 !== null && h24 !== lastHour24 && state.chime && now.getMinutes() === 0) {
      window.StandByServices.playChime();
    }
    lastHour24 = h24;

    if (hStr !== lastDisplayedHour) {
      if (!skipFlip) triggerFlip("card-hours", lastDisplayedHour, hStr);
      document.getElementById("hours").textContent = hStr;
      lastDisplayedHour = hStr;
    }

    if (mStr !== lastDisplayedMinute) {
      if (!skipFlip) triggerFlip("card-minutes", lastDisplayedMinute, mStr);
      document.getElementById("minutes").textContent = mStr;
      lastDisplayedMinute = mStr;
    }

    document.getElementById("seconds").textContent = sStr;

    var ampmEl = document.getElementById("ampm");
    ampmEl.textContent = h24 >= 12 ? "PM" : "AM";
    ampmEl.classList.toggle("hidden-item", !state.hour12);

    document.getElementById("disp-year").textContent = now.getFullYear() + "年";
    document.getElementById("disp-month").textContent = (now.getMonth() + 1) + "月";
    document.getElementById("disp-day").textContent = now.getDate() + "日";
    document.getElementById("disp-week").textContent = weekDays[now.getDay()];

    try {
      var lunarStr = new Intl.DateTimeFormat("zh-TW-u-ca-chinese", { month: "short", day: "numeric" }).format(now);
      document.getElementById("disp-lunar").textContent = "農曆 " + lunarStr;
    } catch (e) {}
  }

  function initBattery() {
    var batEl = document.getElementById("disp-battery");
    if (navigator.getBattery) {
      navigator.getBattery().then(function (bat) {
        function refreshBat() {
          var pct = Math.round(bat.level * 100) + "%";
          batEl.textContent = (bat.charging ? "⚡ 充電中 " : "🔋 電池 ") + pct;
        }
        refreshBat();
        bat.addEventListener("levelchange", refreshBat);
        bat.addEventListener("chargingchange", refreshBat);
      });
    }
  }

  // 天氣展開浮層控制
  var weatherPillBtn = document.getElementById("weather-pill-btn");
  var weatherPopover = document.getElementById("weather-popover");
  var weatherAnchor = document.getElementById("disp-weather");

  function setWeatherPopoverOpen(isOpen) {
    weatherPopover.classList.toggle("hidden-item", !isOpen);
    weatherPillBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  weatherPillBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var willOpen = weatherPopover.classList.contains("hidden-item");
    setWeatherPopoverOpen(willOpen);
  });

  document.getElementById("w-refresh-btn").addEventListener("click", function (e) {
    e.stopPropagation();
    window.StandByServices.fetchWeather(state.city);
  });

  var dimOverlay = document.getElementById("dim-overlay");
  var dimSlider = document.getElementById("dim-slider");
  var dimVal = document.getElementById("dim-val");
  var brightnessHud = document.getElementById("brightness-hud");
  var bhVal = document.getElementById("bh-val");
  var bhFill = document.getElementById("bh-fill");
  var bhIcon = document.getElementById("bh-icon");
  var hudTimer = null;
  var suppressClickUntil = 0;

  function updateDimUI() {
    dimOverlay.style.opacity = state.dim / 100;
    dimSlider.value = state.dim;
    dimVal.textContent = state.dim + "%";
  }

  function showBrightnessHud() {
    if (!brightnessHud) return;
    var brightness = 100 - state.dim;
    bhVal.textContent = brightness + "%";
    bhFill.style.height = brightness + "%";
    bhIcon.textContent = brightness <= 45 ? "🌙" : "☀️";
    brightnessHud.classList.add("visible");
    clearTimeout(hudTimer);
    hudTimer = setTimeout(function () {
      brightnessHud.classList.remove("visible");
    }, 1100);
  }

  function applyState() {
    document.body.className = state.theme;
    var themeBtns = document.querySelectorAll("[data-theme]");
    for (var i = 0; i < themeBtns.length; i++) {
      themeBtns[i].classList.toggle("active", themeBtns[i].getAttribute("data-theme") === state.theme);
    }

    var citySelect = document.getElementById("city-select");
    citySelect.value = state.city;
    if (citySelect.selectedIndex === -1 && citySelect.options.length > 0) {
      state.city = citySelect.options[0].value;
      citySelect.value = state.city;
    }

    document.getElementById("memo-input").value = state.memo;

    var hour12Btn = document.getElementById("btn-hour12");
    hour12Btn.textContent = state.hour12 ? "🕒 12 小時制" : "🕒 24 小時制";
    hour12Btn.classList.toggle("active", state.hour12);

    var chimeBtn = document.getElementById("btn-chime");
    chimeBtn.textContent = state.chime ? "🔔 整點報時：開" : "🔔 整點報時：關";
    chimeBtn.classList.toggle("active", state.chime);

    var stage = document.getElementById("clock-stage");
    stage.style.transform = "scale(" + (state.scale / 100) + ")";
    document.getElementById("scale-slider").value = state.scale;
    document.getElementById("scale-val").textContent = state.scale + "%";

    updateDimUI();

    var toggleBtns = document.querySelectorAll("[data-toggle]");
    var anyDateOn = false;
    for (var j = 0; j < toggleBtns.length; j++) {
      var key = toggleBtns[j].getAttribute("data-toggle");
      var isOn = state.toggles[key];
      toggleBtns[j].classList.toggle("active", isOn);
      var targetEl = document.getElementById("disp-" + key);
      if (targetEl) targetEl.classList.toggle("hidden-item", !isOn);
      if (["year", "month", "day", "week", "lunar"].indexOf(key) !== -1 && isOn) anyDateOn = true;
    }

    var anyTopOn = anyDateOn || state.toggles.battery || state.toggles.weather;
    var anyBottomOn = state.toggles.pomodoro || state.toggles.memo;

    document.getElementById("date-pill").classList.toggle("hidden-item", !anyDateOn);
    document.getElementById("battery-pill").classList.toggle("hidden-item", !state.toggles.battery);
    document.getElementById("bottom-widgets").classList.toggle("hidden-item", !anyBottomOn);
    if (!state.toggles.weather) setWeatherPopoverOpen(false);

    var appContainer = document.getElementById("app-container");
    appContainer.classList.toggle("mode-clock-only", !state.toggles.weather);
    appContainer.classList.toggle("mode-clean", !anyTopOn && !anyBottomOn);
  }

  var hideTimer = null;
  var panel = document.getElementById("control-panel");
  function showPanel() {
    panel.classList.remove("hidden");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { panel.classList.add("hidden"); }, 7000);
  }

  document.body.addEventListener("click", function (e) {
    if (Date.now() < suppressClickUntil) {
      return;
    }
    if (weatherAnchor && !weatherAnchor.contains(e.target)) {
      setWeatherPopoverOpen(false);
    }
    if (weatherAnchor && weatherAnchor.contains(e.target)) {
      return;
    }
    if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON" || e.target.tagName === "SELECT") {
      if (panel.contains(e.target)) showPanel();
      return;
    }
    if (!panel.contains(e.target)) {
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden")) showPanel();
    }
  });

  var themeBtns = document.querySelectorAll("[data-theme]");
  for (var i = 0; i < themeBtns.length; i++) {
    themeBtns[i].addEventListener("click", function () {
      state.theme = this.getAttribute("data-theme");
      localStorage.setItem("ipad_clock_theme_v6", state.theme);
      applyState();
    });
  }

  var toggleBtns = document.querySelectorAll("[data-toggle]");
  for (var j = 0; j < toggleBtns.length; j++) {
    toggleBtns[j].addEventListener("click", function () {
      var key = this.getAttribute("data-toggle");
      state.toggles[key] = !state.toggles[key];
      localStorage.setItem("ipad_clock_toggles_v6", JSON.stringify(state.toggles));
      applyState();
    });
  }

  document.getElementById("city-select").addEventListener("change", function () {
    state.city = this.value;
    localStorage.setItem("ipad_clock_city_v6", state.city);
    window.StandByServices.fetchWeather(state.city);
  });

  document.getElementById("memo-input").addEventListener("input", function () {
    state.memo = this.value;
    localStorage.setItem("ipad_clock_memo_v6", state.memo);
  });

  document.getElementById("btn-hour12").addEventListener("click", function () {
    state.hour12 = !state.hour12;
    localStorage.setItem("ipad_clock_hour12_v6", state.hour12);
    applyState();
    updateClock(true);
  });

  document.getElementById("btn-noise").addEventListener("click", function () {
    window.StandByServices.toggleRainNoise(this);
  });

  document.getElementById("btn-chime").addEventListener("click", function () {
    state.chime = !state.chime;
    localStorage.setItem("ipad_clock_chime_v6", state.chime);
    if (state.chime) window.StandByServices.playChime();
    applyState();
  });

  document.getElementById("scale-slider").addEventListener("input", function () {
    state.scale = parseInt(this.value, 10);
    localStorage.setItem("ipad_clock_scale_v6", state.scale);
    applyState();
    showPanel();
  });

  document.getElementById("dim-slider").addEventListener("input", function () {
    state.dim = parseInt(this.value, 10);
    localStorage.setItem("ipad_clock_dim_v6", state.dim);
    updateDimUI();
    showPanel();
  });

  // 上下滑動直接調整螢幕亮度（上滑變亮、下滑變暗）
  (function initBrightnessSwipe() {
    var swipeActive = false;
    var swipeLocked = false;
    var swipeRejected = false;
    var swipeStartX = 0;
    var swipeStartY = 0;
    var swipeStartDim = 0;
    var lastTouchTime = 0;
    var MOVE_THRESHOLD = 12;

    var supportsPassive = false;
    try {
      var opts = Object.defineProperty({}, "passive", {
        get: function () { supportsPassive = true; return false; }
      });
      window.addEventListener("test-passive", null, opts);
      window.removeEventListener("test-passive", null, opts);
    } catch (e) {}

    function isIgnoredTarget(el) {
      if (!el) return true;
      if (panel && panel.contains(el)) return true;
      if (weatherPopover && weatherPopover.contains(el)) return true;
      var cur = el;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        var tag = cur.tagName;
        if (tag === "INPUT" || tag === "BUTTON" || tag === "SELECT" || tag === "TEXTAREA" || tag === "A" || tag === "LABEL") {
          return true;
        }
        cur = cur.parentNode;
      }
      return false;
    }

    function beginSwipe(x, y, target) {
      if (isIgnoredTarget(target)) return;
      swipeActive = true;
      swipeLocked = false;
      swipeRejected = false;
      swipeStartX = x;
      swipeStartY = y;
      swipeStartDim = state.dim;
    }

    function moveSwipe(x, y, e) {
      if (!swipeActive || swipeRejected) return;
      var dx = x - swipeStartX;
      var dy = y - swipeStartY;

      if (!swipeLocked) {
        if (Math.abs(dx) < MOVE_THRESHOLD && Math.abs(dy) < MOVE_THRESHOLD) return;
        if (Math.abs(dy) >= Math.abs(dx)) {
          swipeLocked = true;
          dimOverlay.classList.add("dragging");
          setWeatherPopoverOpen(false);
        } else {
          swipeRejected = true;
          return;
        }
      }

      if (e && e.cancelable !== false && e.preventDefault) {
        e.preventDefault();
      }

      var rangePx = Math.max(240, window.innerHeight * 0.55);
      var nextDim = Math.round(swipeStartDim + (dy / rangePx) * 80);
      if (nextDim < 0) nextDim = 0;
      if (nextDim > 80) nextDim = 80;

      if (nextDim !== state.dim) {
        state.dim = nextDim;
        updateDimUI();
      }
      showBrightnessHud();
    }

    function endSwipe() {
      if (!swipeActive) return;
      if (swipeLocked) {
        dimOverlay.classList.remove("dragging");
        localStorage.setItem("ipad_clock_dim_v6", state.dim);
        suppressClickUntil = Date.now() + 350;
      }
      swipeActive = false;
      swipeLocked = false;
      swipeRejected = false;
    }

    var touchMoveOpt = supportsPassive ? { passive: false } : false;

    document.addEventListener("touchstart", function (e) {
      lastTouchTime = Date.now();
      if (!e.touches || e.touches.length !== 1) {
        endSwipe();
        return;
      }
      beginSwipe(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }, false);

    document.addEventListener("touchmove", function (e) {
      if (!swipeActive || !e.touches || e.touches.length !== 1) return;
      moveSwipe(e.touches[0].clientX, e.touches[0].clientY, e);
    }, touchMoveOpt);

    document.addEventListener("touchend", function () {
      lastTouchTime = Date.now();
      endSwipe();
    }, false);

    document.addEventListener("touchcancel", function () {
      endSwipe();
    }, false);

    // 桌面滑鼠上下拖曳支援（方便電腦預覽與操作）
    document.addEventListener("mousedown", function (e) {
      if (e.button !== 0 || Date.now() - lastTouchTime < 600) return;
      beginSwipe(e.clientX, e.clientY, e.target);
    }, false);

    document.addEventListener("mousemove", function (e) {
      if (!swipeActive || Date.now() - lastTouchTime < 600) return;
      moveSwipe(e.clientX, e.clientY, e);
    }, false);

    document.addEventListener("mouseup", function () {
      if (Date.now() - lastTouchTime < 600) return;
      endSwipe();
    }, false);

    window.addEventListener("blur", function () {
      endSwipe();
    }, false);
  })();

  // 螢幕恆亮（優先使用 Screen Wake Lock API，並保留舊版 iOS 影片防休眠備援）
  var wakeLockEnabled = false;
  var wakeLockSentinel = null;
  var wakeLockBtn = document.getElementById("btn-wakelock");
  var wakeVideo = document.getElementById("wake-video");

  function acquireWakeLock() {
    if (navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request("screen").then(function (sentinel) {
        wakeLockSentinel = sentinel;
      }).catch(function () {});
    }
    if (wakeVideo && wakeVideo.play) {
      try {
        var playPromise = wakeVideo.play();
        if (playPromise && playPromise.catch) playPromise.catch(function () {});
      } catch (e) {}
    }
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) {
      try { wakeLockSentinel.release(); } catch (e) {}
      wakeLockSentinel = null;
    }
    if (wakeVideo && wakeVideo.pause) {
      try { wakeVideo.pause(); } catch (e) {}
    }
  }

  wakeLockBtn.addEventListener("click", function () {
    wakeLockEnabled = !wakeLockEnabled;
    if (wakeLockEnabled) {
      acquireWakeLock();
      this.textContent = "⚡ 恆亮已啟動";
      this.classList.add("active");
    } else {
      releaseWakeLock();
      this.textContent = "⚡ 螢幕恆亮";
      this.classList.remove("active");
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (wakeLockEnabled && document.visibilityState === "visible") {
      acquireWakeLock();
    }
  });

  setInterval(function () {
    var rx = Math.floor(Math.random() * 7) - 3;
    var ry = Math.floor(Math.random() * 7) - 3;
    document.getElementById("app-container").style.transform = "translate(" + rx + "px, " + ry + "px)";
  }, 90000);

  applyState();
  updateClock(true);
  renderPomo();
  initBattery();
  window.StandByServices.fetchWeather(state.city);
  setInterval(function () { updateClock(false); }, 1000);
  setInterval(function () { window.StandByServices.fetchWeather(state.city); }, 1800000);
  showPanel();
})();