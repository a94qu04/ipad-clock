(function () {
  var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
  var weekDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  var lastHour = "";

  var state = {
    theme: localStorage.getItem("ipad_clock_theme_v6") || "theme-flip",
    city: localStorage.getItem("ipad_clock_city_v6") || "25.066,121.662,汐止區",
    scale: parseInt(localStorage.getItem("ipad_clock_scale_v6") || "100", 10),
    dim: parseInt(localStorage.getItem("ipad_clock_dim_v6") || "0", 10),
    chime: localStorage.getItem("ipad_clock_chime_v6") === "true",
    memo: localStorage.getItem("ipad_clock_memo_v6") || "",
    toggles: JSON.parse(localStorage.getItem("ipad_clock_toggles_v6") || '{"year":true,"month":true,"day":true,"week":true,"lunar":true,"battery":true,"weather":true,"pomodoro":true,"memo":true}')
  };

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
  function updateClock() {
    var now = new Date();
    var h24 = now.getHours();
    var hStr = pad(h24);
    var mStr = pad(now.getMinutes());
    var sStr = pad(now.getSeconds());

    if (hStr !== lastHour) {
      document.getElementById("hours").textContent = hStr;
      if (lastHour !== "" && state.chime && now.getMinutes() === 0) {
        window.StandByServices.playChime();
      }
      lastHour = hStr;
    }
    document.getElementById("minutes").textContent = mStr;
    document.getElementById("seconds").textContent = sStr;
    document.getElementById("ampm").textContent = h24 >= 12 ? "PM" : "AM";

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

  function applyState() {
    document.body.className = state.theme;
    var themeBtns = document.querySelectorAll("[data-theme]");
    for (var i = 0; i < themeBtns.length; i++) {
      themeBtns[i].classList.toggle("active", themeBtns[i].getAttribute("data-theme") === state.theme);
    }

    document.getElementById("city-select").value = state.city;
    document.getElementById("memo-input").value = state.memo;

    var chimeBtn = document.getElementById("btn-chime");
    chimeBtn.textContent = state.chime ? "🔔 整點報時：開" : "🔔 整點報時：關";
    chimeBtn.classList.toggle("active", state.chime);

    var stage = document.getElementById("clock-stage");
    stage.style.transform = "scale(" + (state.scale / 100) + ")";
    document.getElementById("scale-slider").value = state.scale;
    document.getElementById("scale-val").textContent = state.scale + "%";

    document.getElementById("dim-overlay").style.opacity = state.dim / 100;
    document.getElementById("dim-slider").value = state.dim;
    document.getElementById("dim-val").textContent = state.dim + "%";

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
    document.getElementById("date-pill").classList.toggle("hidden-item", !anyDateOn);
    document.getElementById("battery-pill").classList.toggle("hidden-item", !state.toggles.battery);
    document.getElementById("bottom-widgets").classList.toggle("hidden-item", !state.toggles.pomodoro && !state.toggles.memo);
    document.getElementById("app-container").classList.toggle("mode-clock-only", !state.toggles.weather);
  }

  var hideTimer = null;
  var panel = document.getElementById("control-panel");
  function showPanel() {
    panel.classList.remove("hidden");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { panel.classList.add("hidden"); }, 7000);
  }

  document.body.addEventListener("click", function (e) {
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
  });

  document.getElementById("dim-slider").addEventListener("input", function () {
    state.dim = parseInt(this.value, 10);
    localStorage.setItem("ipad_clock_dim_v6", state.dim);
    applyState();
  });

  document.getElementById("btn-wakelock").addEventListener("click", function () {
    document.getElementById("wake-video").play();
    this.textContent = "⚡ 恆亮已啟動";
    this.classList.add("active");
  });

  setInterval(function () {
    var rx = Math.floor(Math.random() * 7) - 3;
    var ry = Math.floor(Math.random() * 7) - 3;
    document.getElementById("app-container").style.transform = "translate(" + rx + "px, " + ry + "px)";
  }, 90000);

  applyState();
  updateClock();
  renderPomo();
  initBattery();
  window.StandByServices.fetchWeather(state.city);
  setInterval(updateClock, 1000);
  setInterval(function () { window.StandByServices.fetchWeather(state.city); }, 1800000);
  showPanel();
})();