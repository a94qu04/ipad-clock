(function (window) {
  var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
  var audioCtx = null;
  var rainSource = null;
  var rainFilter = null;
  var isRaining = false;
  var activeWeatherXhr = null;
  var CACHE_KEY = "ipad_clock_weather_cache_v6";

  function ensureAudioCtx() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function playChime() {
    ensureAudioCtx();
    if (!audioCtx) return;
    var notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach(function (freq, idx) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      var start = audioCtx.currentTime + idx * 0.22;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 1.45);
    });
  }

  function stopRainNodes() {
    if (rainSource) {
      try { rainSource.stop(0); } catch (e) {}
      try { rainSource.disconnect(); } catch (e) {}
      rainSource = null;
    }
    if (rainFilter) {
      try { rainFilter.disconnect(); } catch (e) {}
      rainFilter = null;
    }
  }

  function toggleRainNoise(btnEl) {
    ensureAudioCtx();
    if (!audioCtx) return;
    if (isRaining) {
      stopRainNodes();
      isRaining = false;
      btnEl.textContent = "🌧️ 助眠雨聲：關";
      btnEl.classList.remove("active");
    } else {
      stopRainNodes();
      var bufferSize = 2 * audioCtx.sampleRate;
      var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      var output = noiseBuffer.getChannelData(0);
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (var i = 0; i < bufferSize; i++) {
        var white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.035;
        b6 = white * 0.115926;
      }
      var whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;
      var filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 650;
      whiteNoise.connect(filter);
      filter.connect(audioCtx.destination);
      whiteNoise.start(0);
      rainSource = whiteNoise;
      rainFilter = filter;
      isRaining = true;
      btnEl.textContent = "🌧️ 助眠雨聲：開";
      btnEl.classList.add("active");
    }
  }

  function getWeatherIconAndDesc(code, isDay) {
    if (code >= 95) return { icon: "⛈️", desc: "雷陣雨", sky: "sky-rain" };
    if (code >= 71 && code <= 77) return { icon: "❄️", desc: "降雪", sky: "sky-rain" };
    if (code >= 80 && code <= 82) return { icon: "🌧️", desc: "短暫陣雨", sky: "sky-rain" };
    if (code >= 61 && code <= 67) return { icon: "🌧️", desc: "降雨", sky: "sky-rain" };
    if (code >= 51 && code <= 57) return { icon: "🌦️", desc: "毛毛雨", sky: "sky-rain" };
    if (code === 45 || code === 48) return { icon: "🌫️", desc: "起霧", sky: "sky-rain" };
    if (code === 3) return { icon: "☁️", desc: "陰天", sky: isDay ? "sky-rain" : "sky-night" };
    if (code === 1 || code === 2) return { icon: isDay ? "⛅" : "☁️", desc: isDay ? "多雲時晴" : "多雲夜空", sky: isDay ? "" : "sky-night" };
    return { icon: isDay ? "☀️" : "🌙", desc: isDay ? "晴朗" : "晴朗夜晚", sky: isDay ? "" : "sky-night" };
  }

  function formatTimeHM(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function readWeatherCache(cityStr) {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var map = JSON.parse(raw);
      return map && map[cityStr] ? map[cityStr] : null;
    } catch (e) {
      return null;
    }
  }

  function writeWeatherCache(cityStr, data) {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var map = raw ? JSON.parse(raw) : {};
      if (!map || typeof map !== "object") map = {};
      map[cityStr] = { ts: Date.now(), data: data };
      localStorage.setItem(CACHE_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  function findStartHourIndex(hourlyTimes, currentTimeStr) {
    if (!hourlyTimes || !hourlyTimes.length) return -1;
    if (currentTimeStr && currentTimeStr.length >= 13) {
      var prefix = currentTimeStr.slice(0, 13);
      for (var k = 0; k < hourlyTimes.length; k++) {
        if (hourlyTimes[k].slice(0, 13) === prefix) return k;
      }
    }
    return new Date().getHours();
  }

  function renderWeatherData(cityName, data, statusText) {
    var cur = data.current;
    var daily = data.daily;
    var hourly = data.hourly;
    if (!cur || !daily || !hourly) return;

    var info = getWeatherIconAndDesc(cur.weather_code, cur.is_day === 1);
    var curTemp = Math.round(cur.temperature_2m) + "°";
    var hiTemp = Math.round(daily.temperature_2m_max[0]) + "°";
    var loTemp = Math.round(daily.temperature_2m_min[0]) + "°";

    var popoverEl = document.getElementById("weather-popover");
    if (popoverEl) {
      popoverEl.classList.remove("sky-night", "sky-rain");
      if (info.sky) popoverEl.classList.add(info.sky);
    }

    document.getElementById("w-city-name").textContent = cityName;
    document.getElementById("w-icon").textContent = info.icon;
    document.getElementById("w-temp").textContent = curTemp;
    document.getElementById("w-hl-short").textContent = hiTemp + " / " + loTemp;

    document.getElementById("w-city-full").textContent = cityName;
    document.getElementById("w-temp-full").textContent = curTemp;
    document.getElementById("w-icon-full").textContent = info.icon;
    document.getElementById("w-desc").textContent = info.desc;
    document.getElementById("w-hl").textContent = "最高 " + hiTemp + "  最低 " + loTemp;
    document.getElementById("w-status").textContent = statusText;

    var baseIdx = findStartHourIndex(hourly.time, cur.time);
    var html = "";
    for (var i = 1; i <= 6; i++) {
      var idx = baseIdx + i;
      if (idx >= 0 && idx < hourly.time.length) {
        var hLabel = hourly.time[idx].slice(11, 13) + "時";
        var hInfo = getWeatherIconAndDesc(hourly.weather_code[idx], hourly.is_day[idx] === 1);
        html += '<div class="w-hour-col"><span class="w-h-time">' + hLabel + '</span><span class="w-h-icon">' + hInfo.icon + '</span><span class="w-h-temp">' + Math.round(hourly.temperature_2m[idx]) + '°</span></div>';
      }
    }
    if (html) document.getElementById("w-hourly-list").innerHTML = html;
  }

  function renderWeatherError(cityStr, cityName, reason) {
    var cached = readWeatherCache(cityStr);
    if (cached && cached.data) {
      renderWeatherData(cityName, cached.data, "離線快取 · " + formatTimeHM(cached.ts));
      return;
    }
    document.getElementById("w-city-name").textContent = cityName;
    document.getElementById("w-city-full").textContent = cityName;
    document.getElementById("w-icon").textContent = "⚠️";
    document.getElementById("w-icon-full").textContent = "⚠️";
    document.getElementById("w-temp").textContent = "--°";
    document.getElementById("w-temp-full").textContent = "--°";
    document.getElementById("w-hl-short").textContent = "離線";
    document.getElementById("w-desc").textContent = reason || "無法取得氣象";
    document.getElementById("w-hl").textContent = "最高 --°  最低 --°";
    document.getElementById("w-status").textContent = "請檢查網路連線後重試";
  }

  function fetchWeather(cityStr) {
    var parts = cityStr.split(",");
    var cityName = parts[2] || "目前位置";
    document.getElementById("w-city-name").textContent = cityName;
    document.getElementById("w-city-full").textContent = cityName;
    document.getElementById("w-status").textContent = "更新氣象中...";

    if (activeWeatherXhr) {
      activeWeatherXhr._aborted = true;
      try { activeWeatherXhr.abort(); } catch (e) {}
      activeWeatherXhr = null;
    }

    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + parts[0] + "&longitude=" + parts[1] +
              "&current=temperature_2m,is_day,weather_code&hourly=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2";

    var xhr = new XMLHttpRequest();
    activeWeatherXhr = xhr;
    xhr.open("GET", url, true);
    xhr.timeout = 10000;

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4 || xhr._aborted || xhr !== activeWeatherXhr) return;
      if (xhr.status === 0) return;
      activeWeatherXhr = null;
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          writeWeatherCache(cityStr, data);
          renderWeatherData(cityName, data, "更新於 " + formatTimeHM(Date.now()));
        } catch (e) {
          renderWeatherError(cityStr, cityName, "資料解析失敗");
        }
      } else {
        renderWeatherError(cityStr, cityName, "氣象服務異常 (" + xhr.status + ")");
      }
    };

    xhr.onerror = function () {
      if (xhr._aborted || xhr !== activeWeatherXhr) return;
      activeWeatherXhr = null;
      renderWeatherError(cityStr, cityName, "無法連線");
    };

    xhr.ontimeout = function () {
      if (xhr._aborted || xhr !== activeWeatherXhr) return;
      activeWeatherXhr = null;
      renderWeatherError(cityStr, cityName, "連線逾時");
    };

    xhr.send();
  }

  window.StandByServices = {
    playChime: playChime,
    toggleRainNoise: toggleRainNoise,
    fetchWeather: fetchWeather
  };
})(window);