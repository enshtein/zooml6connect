const layers = {
  high: { label: "EQ HIGH", default: 64 },
  midfreq: { label: "MID FREQ", default: 64 },
  mid: { label: "EQ MID", default: 64 },
  low: { label: "EQ LOW", default: 64 },
  aux1: { label: "AUX 1", default: 0 },
  aux2: { label: "AUX 2", default: 0 },
  efx: { label: "EFX SEND", default: 0 },
  pan: { label: "PAN", default: 64 }
};

const channels = [
  { number: 1, kind: "MONO", route: "48V", level: 102 },
  { number: 2, kind: "MONO", route: "48V", level: 91 },
  { number: 3, kind: "STEREO", route: "MONO ×2", level: 108 },
  { number: 4, kind: "STEREO", route: "MONO ×2", level: 84 },
  { number: 5, kind: "STEREO", route: "USB 1/2", level: 98 },
  { number: 6, kind: "STEREO", route: "USB 3/4", level: 76 }
].map((channel, index) => ({
  ...channel,
  muted: false,
  values: Object.fromEntries(Object.entries(layers).map(([key, layer]) => [key, Math.max(0, Math.min(127, layer.default + [0, 8, -12, 17, -5, 5][index]))]))
}));

let activeLayer = "high";
const channelsRoot = document.querySelector("#channels");
const template = document.querySelector("#channelTemplate");

channels.forEach((channel, index) => {
  const fragment = template.content.cloneNode(true);
  const strip = fragment.querySelector(".channel-strip");
  strip.dataset.channel = channel.number;
  fragment.querySelector(".channel-number").textContent = channel.number;
  fragment.querySelector(".channel-kind").textContent = channel.kind;
  const routeButton = fragment.querySelector(".route-button");
  routeButton.textContent = channel.route;
  routeButton.setAttribute("aria-pressed", "false");
  routeButton.addEventListener("click", event => {
    const active = event.currentTarget.classList.toggle("active");
    event.currentTarget.setAttribute("aria-pressed", String(active));
  });
  const meters = fragment.querySelector(".channel-meters");
  const meterLevels = [[72], [54], [82, 74], [38, 46], [65, 58], [46, 51]][index];
  if (meterLevels.length === 2) meters.append(meters.firstElementChild.cloneNode(true));
  meters.querySelectorAll(".channel-meter").forEach((meter, meterIndex) => {
    meter.style.setProperty("--meter", `${meterLevels[meterIndex]}%`);
    meter.setAttribute("aria-label", `${channel.number} ${meterIndex === 0 ? "L" : "R"}`);
  });

  const parameterFader = fragment.querySelector(".parameter-fader");
  parameterFader.value = channel.values[activeLayer];
  parameterFader.addEventListener("input", event => {
    channel.values[activeLayer] = Number(event.target.value);
    updateStrip(strip, channel);
  });

  const levelFader = fragment.querySelector(".level-fader");
  levelFader.value = channel.level;
  levelFader.addEventListener("input", event => {
    channel.level = Number(event.target.value);
    updateStrip(strip, channel);
  });

  fragment.querySelector(".mute-button").addEventListener("click", event => {
    channel.muted = !channel.muted;
    event.currentTarget.classList.toggle("active", channel.muted);
  });

  fragment.querySelector(".lfo-button").addEventListener("click", event => {
    event.currentTarget.classList.toggle("active");
  });

  channelsRoot.append(fragment);
  updateStrip(strip, channel);
});

document.querySelectorAll(".layer-button").forEach(button => {
  button.addEventListener("click", () => {
    activeLayer = button.dataset.layer;
    document.querySelectorAll(".layer-button").forEach(item => item.classList.toggle("active", item === button));
    channels.forEach(channel => {
      const strip = document.querySelector(`[data-channel="${channel.number}"]`);
      strip.querySelector(".parameter-fader").value = channel.values[activeLayer];
      updateStrip(strip, channel);
    });
  });
});

document.querySelectorAll(".scene-buttons button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".scene-buttons button").forEach(item => item.classList.toggle("active", item === button));
  });
});

function updateStrip(strip, channel) {
  const layer = layers[activeLayer];
  strip.querySelector(".parameter-name").textContent = layer.label;
  strip.querySelector(".parameter-value").textContent = Math.round(channel.values[activeLayer]);
  strip.querySelector(".level-value").textContent = Math.round(channel.level);
  strip.querySelector(".upper-fader-wrap").style.setProperty("--fader-value", channel.values[activeLayer] / 127);
  strip.querySelector(".level-fader-wrap").style.setProperty("--fader-value", channel.level / 127);
}

const masterFader = document.querySelector(".master-fader");
const masterValue = document.querySelector(".master-value");
masterFader.addEventListener("input", event => {
  const value = Number(event.target.value);
  masterValue.textContent = Math.round(value);
  event.target.closest(".fader-wrap").style.setProperty("--fader-value", value / 127);
});
masterFader.closest(".fader-wrap").style.setProperty("--fader-value", Number(masterFader.value) / 127);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
