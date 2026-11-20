(function (window) {
  var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
  var audioCtx = null;
  var rainNode = null;
  var isRaining = false;

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

  function toggleRainNoise(btnEl) {
    ensureAudioCtx();
    if (!audioCtx) return;
    if (isRaining && rainNode) {
      rainNode.disconnect();
      rainNode = null;
      isRaining = false;
      btnEl.textContent = "🌧️ 助眠雨聲：關";
      btnEl.classList.remove("active");
    } else {
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
      rainNode = filter;
      isRaining = true;
      btnEl.textContent = "🌧️ 助眠雨聲：開";
      btnEl.classList.add("active");
    }
  }

  function getWeatherIconAndDesc(code, isDay) {
    if (code >= 51) return { icon: "🌧️", desc: "陣雨 / 陰雨", sky: "sky-rain" };
    if (code >= 1 && code <= 3) return { icon: isDay ? "⛅" : "☁️", desc: "多雲時晴", sky: isDay ? "" : "sky-night" };
    if (code > 3) return { icon: "☁️", desc: "陰天", sky: "sky-rain" };
    return { icon: isDay ? "☀️" : "🌙", desc: isDay ? "晴朗" : "晴朗夜晚", sky: isDay ? "" : "sky-night" };
  }

  function fetchWeather(cityStr) {
    var parts = cityStr.split(",");
    document.getElementById("w-city-name").textContent = parts[2];
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + parts[0] + "&longitude=" + parts[1] +
              "&current=temperature_2m,is_day,weather_code&hourly=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FTaipei&forecast_days=2";

    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          var cur = data.current;
          var daily = data.daily;
          var hourly = data.hourly;
          var info = getWeatherIconAndDesc(cur.weather_code, cur.is_day === 1);

          var widgetEl = document.getElementById("disp-weather");
          widgetEl.classList.remove("sky-night", "sky-rain");
          if (info.sky) widgetEl.classList.add(info.sky);

          document.getElementById("w-temp").textContent = Math.round(cur.temperature_2m) + "°";
          document.getElementById("w-icon").textContent = info.icon;
          document.getElementById("w-desc").textContent = info.desc;
          document.getElementById("w-hl").textContent = "最高 " + Math.round(daily.temperature_2m_max[0]) + "°  最低 " + Math.round(daily.temperature_2m_min[0]) + "°";

          var nowHour = new Date().getHours();
          var html = "";
          for (var i = 1; i <= 6; i++) {
            var idx = nowHour + i;
            if (idx < hourly.time.length) {
              var hInfo = getWeatherIconAndDesc(hourly.weather_code[idx], hourly.is_day[idx] === 1);
              html += '<div class="w-hour-col"><span class="w-h-time">' + pad(idx % 24) + '時</span><span class="w-h-icon">' + hInfo.icon + '</span><span class="w-h-temp">' + Math.round(hourly.temperature_2m[idx]) + '°</span></div>';
            }
          }
          if (html) document.getElementById("w-hourly-list").innerHTML = html;
        } catch (e) {}
      }
    };
    xhr.send();
  }

  window.StandByServices = {
    playChime: playChime,
    toggleRainNoise: toggleRainNoise,
    fetchWeather: fetchWeather
  };
})(window);