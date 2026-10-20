/*
  Smart Plant Monitor
  Configure a ThingSpeak channel. Public channels need only the channel ID.
  For private channels, use the Read API Key. Never use the Write API Key here.
*/
const DEFAULT_CHANNEL_ID = ""; // Optional: put your channel ID between quotes before publishing.
const DEFAULT_READ_KEY = "";   // Optional: read key for a private channel only.
const REFRESH_MS = 20000;

const $ = (id) => document.getElementById(id);
let chart = null;
let timer = null;

function loadSavedSettings() {
  // Browser storage is used only to remember the public channel ID / read key on this device.
  $("channelId").value = localStorage.getItem("spm_channel") || DEFAULT_CHANNEL_ID;
  $("readKey").value = localStorage.getItem("spm_readkey") || DEFAULT_READ_KEY;
}

function setConnection(state, label) {
  const el = $("connectionState");
  el.className = "connection " + state;
  el.textContent = label;
}

function showStatus(text, message) {
  $("plantStatus").textContent = text;
  $("statusMessage").textContent = message;
}

function formatTime(dateString) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString([], {dateStyle:"medium", timeStyle:"short"});
}

function classifySoil(pct) {
  if (pct < 25) return ["Soil may be dry", "Moisture is low. Check the soil and water requirements for your plant."];
  if (pct < 40) return ["Soil moisture is moderate", "Check your plant species and soil before deciding whether to water."];
  if (pct <= 75) return ["Soil moisture looks good", "Moisture is within the dashboard's general range; plant needs vary by species."];
  return ["Soil is very wet", "Check drainage and avoid overwatering if the soil remains saturated."];
}

function makeChart(feeds) {
  const ctx = $("historyChart").getContext("2d");
  const labels = feeds.map(f => new Date(f.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}));
  const temp = feeds.map(f => numericOrNull(f.field1));
  const humidity = feeds.map(f => numericOrNull(f.field2));
  const soil = feeds.map(f => numericOrNull(f.field4));
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [
      {label:"Temperature (°C)",data:temp,borderColor:"#d17a3c",backgroundColor:"#d17a3c18",tension:.3,spanGaps:true,yAxisID:"y"},
      {label:"Humidity (%)",data:humidity,borderColor:"#3289c4",backgroundColor:"#3289c418",tension:.3,spanGaps:true,yAxisID:"y1"},
      {label:"Soil moisture (%)",data:soil,borderColor:"#278354",backgroundColor:"#27835418",tension:.3,spanGaps:true,yAxisID:"y1"}
    ]},
    options: {
      responsive:true, maintainAspectRatio:false, interaction:{mode:"index",intersect:false},
      plugins:{legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:7,font:{family:"DM Sans",size:11}}}},
      scales:{
        x:{grid:{display:false},ticks:{maxTicksLimit:8,color:"#7b887f"}},
        y:{position:"left",title:{display:true,text:"Temperature °C"},ticks:{color:"#7b887f"}},
        y1:{position:"right",min:0,max:100,title:{display:true,text:"Humidity / Soil %"},grid:{drawOnChartArea:false},ticks:{color:"#7b887f"}}
      }
    }
  });
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function refreshData() {
  const channel = $("channelId").value.trim();
  const key = $("readKey").value.trim();
  if (!channel) {
    setConnection("offline", "Setup required");
    showStatus("Configure your channel", "Enter your ThingSpeak channel ID in Channel settings.");
    return;
  }

  const count = $("historyCount").value;
  let url = `https://api.thingspeak.com/channels/${encodeURIComponent(channel)}/feeds.json?results=${count}`;
  if (key) url += `&api_key=${encodeURIComponent(key)}`;

  try {
    const response = await fetch(url, {cache:"no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.feeds || data.feeds.length === 0) throw new Error("No readings found. Check your channel and field setup.");
    const feeds = data.feeds.filter(f => f.created_at);
    const latest = feeds[feeds.length - 1];

    const t = numericOrNull(latest.field1);
    const h = numericOrNull(latest.field2);
    const raw = numericOrNull(latest.field3);
    const soil = numericOrNull(latest.field4);

    $("temperature").textContent = t === null ? "—" : t.toFixed(1);
    $("humidity").textContent = h === null ? "—" : h.toFixed(1);
    $("soilMoisture").textContent = soil === null ? "—" : Math.round(soil);
    $("soilBar").style.width = soil === null ? "0%" : `${Math.max(0,Math.min(100,soil))}%`;
    $("soilHint").textContent = soil === null ? `Raw reading: ${raw === null ? "—" : Math.round(raw)}. Configure field 4 for calibrated %.` : `Raw sensor reading: ${raw === null ? "—" : Math.round(raw)}.`;

    if (soil !== null) {
      const [status, message] = classifySoil(soil);
      showStatus(status, message);
    } else {
      showStatus("Readings received", "Soil moisture percentage is not available yet. Check ThingSpeak field 4.");
    }

    const ageMs = Date.now() - new Date(latest.created_at).getTime();
    $("lastUpdated").textContent = formatTime(latest.created_at);
    if (ageMs > 120000) setConnection("stale", "Data is old");
    else setConnection("online", "Receiving data");
    makeChart(feeds);
    $("settingsMessage").textContent = `Loaded ${feeds.length} reading(s).`;
  } catch (error) {
    setConnection("offline", "Unable to load data");
    showStatus("Could not load readings", error.message + " Check the channel ID, read key, internet access and ThingSpeak fields.");
    $("settingsMessage").textContent = "Could not load data: " + error.message;
  }
}

function saveSettings() {
  const channel = $("channelId").value.trim();
  const key = $("readKey").value.trim();
  localStorage.setItem("spm_channel", channel);
  localStorage.setItem("spm_readkey", key);
  $("settingsMessage").textContent = "Settings saved in this browser.";
  refreshData();
}

$("saveSettings").addEventListener("click", saveSettings);
$("historyCount").addEventListener("change", refreshData);
loadSavedSettings();
refreshData();
timer = setInterval(refreshData, REFRESH_MS);
