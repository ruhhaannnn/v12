// --- TAB SWITCHING & FULLSCREEN LOGIC ---
function switchTab(tabId, el) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active-tab');
        setTimeout(() => tab.classList.add('hidden-tab'), 300); 
    });
    
    setTimeout(() => {
        const target = document.getElementById(tabId);
        target.classList.remove('hidden-tab');
        void target.offsetWidth; 
        target.classList.add('active-tab');
        if(tabId === 'map-section' && map) map.resize();
    }, 300);
    
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active-nav'));
    if(el) el.classList.add('active-nav');
}

function toggleFullScreen(elem) {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (elem.requestFullscreen) { elem.requestFullscreen(); }
        else if (elem.webkitRequestFullscreen) { elem.webkitRequestFullscreen(); } // Safari/Mobile support
    } else {
        if (document.exitFullscreen) { document.exitFullscreen(); }
        else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
    }
}

// --- GLOBAL DYNAMIC ALERT ENGINE ---
function triggerGlobalAlert(eventType) {
    const els = document.querySelectorAll('.panel, #main-nav');
    els.forEach(el => el.classList.remove('alert-missile', 'alert-siren', 'alert-drone', 'alert-intercept'));

    let duration = 10000; let cName = 'alert-missile';
    if(eventType === 'siren') { duration = 20000; cName = 'alert-siren'; }
    else if(eventType === 'drone') { duration = 10000; cName = 'alert-drone'; }
    else if(eventType === 'intercept') { duration = 10000; cName = 'alert-intercept'; }

    els.forEach(el => el.classList.add(cName));
    setTimeout(() => { els.forEach(el => el.classList.remove(cName)); }, duration);
}

// --- INSTANT CACHE ENGINE ---
function loadFromCache(id) {
    try {
        let cached = localStorage.getItem('iqwr_cache_' + id);
        if(cached && cached.trim() !== "") { 
            document.getElementById(id).innerHTML = cached; 
            return true; 
        }
    } catch(e) {}
    return false;
}
function saveToCache(id, html) { 
    if(html && html.trim() !== "") localStorage.setItem('iqwr_cache_' + id, html); 
}

// --- FAST PROXY ENGINE ---
async function fetchWithFastestProxy(targetUrl, type = 'json') {
    const timeWindow = Math.floor(Date.now() / 60000); 
    const sep = targetUrl.includes('?') ? '&' : '?';
    const freshUrl = `${targetUrl}${sep}_cb=${timeWindow}`;
    
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(freshUrl)}`,
        `https://corsproxy.io/?url=${encodeURIComponent(freshUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(freshUrl)}`
    ];

    for (let proxy of proxies) {
        try {
            const res = await fetch(proxy, { cache: "no-store", mode: 'cors' });
            if (res.ok) return type === 'json' ? await res.json() : await res.text();
        } catch(e) {}
    }
    throw new Error("Proxies failed");
}

setInterval(() => { document.getElementById('clock').innerText = new Date().toUTCString(); }, 1000);

async function scrapeTelegramChannel(channel, extractMedia = false) {
    try {
        const htmlText = await fetchWithFastestProxy(`https://t.me/s/${channel}`, 'html');
        if(!htmlText) return [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const messages = doc.querySelectorAll('.tgme_widget_message');
        let posts = [];
        
        for(let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const textEl = msg.querySelector('.tgme_widget_message_text');
            const dateEl = msg.querySelector('time.time');
            
            if(textEl && dateEl) {
                const dateStr = dateEl.getAttribute('datetime');
                const msgDate = new Date(dateStr);
                let text = textEl.innerText.replace(/(<([^>]+)>)/gi, "").replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim(); 
                const link = msg.getAttribute('data-post') ? 'https://t.me/' + msg.getAttribute('data-post') : `https://t.me/s/${channel}`;
                
                let mediaHTML = '';
                if (extractMedia) {
                    const photoWrap = msg.querySelector('.tgme_widget_message_photo_wrap');
                    if (photoWrap && photoWrap.style.backgroundImage) {
                        const urlMatch = photoWrap.style.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/);
                        if (urlMatch && urlMatch[1]) mediaHTML = `<img src="${urlMatch[1]}" style="width:100%; border-radius:4px; margin-top:8px; border: 1px solid var(--border-color);" />`;
                    }
                    const videoWrap = msg.querySelector('video');
                    // Side panel feeds retain standard controls and do NOT autoplay
                    if (videoWrap && videoWrap.src) {
                        mediaHTML = `<video src="${videoWrap.src}" controls playsinline style="width:100%; max-height:400px; border-radius:4px; margin-top:8px; background: #000; border: 1px solid var(--border-color);"></video>`;
                    }
                }
                posts.push({ channel, text, date: msgDate, link, mediaHTML });
            }
        }
        return posts;
    } catch (error) { return []; }
}

async function fetchTicker() {
    try {
        const posts = await scrapeTelegramChannel('presstv', false);
        if(!posts || !posts.length) return;
        let validPosts = posts.filter(p => (Date.now() - p.date.getTime()) <= 3600000).slice(0, 10);
        if(validPosts.length === 0) validPosts = posts.slice(0, 3); 
        let htmlString = '';
        validPosts.forEach(p => { htmlString += `<span class="ticker-item">🚨 [PRESS TV] ${p.text.replace(/\n/g, ' - ').toUpperCase()}</span>`; });
        if(htmlString) {
            const tickerEl = document.getElementById('live-ticker');
            tickerEl.style.animationDuration = `${Math.max(htmlString.length * 0.12, 30)}s`;
            tickerEl.innerHTML = htmlString + htmlString;
        }
    } catch(e) {}
}

const kineticKeywords = ['missile', 'siren', 'alert', 'strike', 'attack', 'intercept', 'drone', 'uav', 'rocket', 'bomb', 'explosion'];

async function fetchSummary() {
    try {
        const elId = 'summary-feed';
        const [presstv, meObs, rnintel] = await Promise.all([
            scrapeTelegramChannel('presstv', false), scrapeTelegramChannel('me_observer_TG', false), scrapeTelegramChannel('rnintel', false)
        ]);
        
        // Strict Summary Filtering applied here
        let recent = [...(presstv||[]), ...(meObs||[]), ...(rnintel||[])]
            .filter(p => (Date.now() - p.date.getTime()) < 3600000 && p.text.length <= 160)
            .filter(p => kineticKeywords.some(kw => p.text.toLowerCase().includes(kw))) 
            .sort((a,b) => b.date - a.date);
        
        if (!recent.length) return;
        let html = '';
        recent.slice(0, 10).forEach(p => { html += `<li><a href="${p.link}" target="_blank" style="color: #e5e5e5; text-decoration: none;">${p.text}</a></li>`; });
        document.getElementById(elId).innerHTML = html;
        saveToCache(elId, html);
    } catch (e) {}
}

async function fetchNews() {
    try {
        const elId = 'news-feed';
        const [meObs, rnintel] = await Promise.all([scrapeTelegramChannel('me_observer_TG', true), scrapeTelegramChannel('rnintel', true)]);
        let posts = [...(meObs||[]), ...(rnintel||[])].filter(p => (Date.now() - p.date.getTime()) <= 16 * 3600000).sort((a,b) => b.date - a.date);
        if (!posts.length) return;
        let html = ''; 
        posts.slice(0, 30).forEach(p => {
            const diffMins = Math.max(0, Math.floor((Date.now() - p.date.getTime()) / 60000));
            let tStr = `<span style="color: #22c55e; font-weight: bold;">${diffMins < 1 ? "Just now" : diffMins < 60 ? diffMins + "m ago" : Math.floor(diffMins/60) + "h ago"}</span>`;
            html += `<div class="sc-list-item" style="flex-direction: column;">
                        <div style="display:flex; gap:10px;"><div class="icon-warn">~</div><div class="sc-content" style="width: 100%;">
                        <div style="font-weight: 600; color: #fff;">${p.channel.replace('_TG','').toUpperCase()} · ${tStr}</div>
                        <div style="margin-top: 4px;"><a href="${p.link}" target="_blank">${p.text}</a></div>${p.mediaHTML}</div></div></div>`;
        });
        document.getElementById(elId).innerHTML = html;
        saveToCache(elId, html);
    } catch (e) {}
}

async function fetchIranNews() {
    try {
        const elId = 'iran-news-feed';
        let posts = await scrapeTelegramChannel('presstv', true);
        if(!posts) return;
        posts = posts.filter(p => (Date.now() - p.date.getTime()) <= 16 * 3600000).sort((a,b) => b.date - a.date);
        let html = '';
        posts.slice(0, 30).forEach(p => {
            const diffMins = Math.max(0, Math.floor((Date.now() - p.date.getTime()) / 60000));
            let tStr = `<span style="color: #22c55e; font-weight: bold;">${diffMins < 1 ? "Just now" : diffMins < 60 ? diffMins + "m ago" : Math.floor(diffMins/60) + "h ago"}</span>`;
            html += `<div class="sc-list-item" style="flex-direction: column;">
                        <div style="display:flex; gap:10px;"><div class="icon-alert">!</div><div class="sc-content" style="width: 100%;">
                        <div style="font-weight: 600; color: #fff;">PRESS TV · ${tStr}</div>
                        <div style="margin-top: 4px;"><a href="${p.link}" target="_blank">${p.text}</a></div>${p.mediaHTML}</div></div></div>`;
        });
        document.getElementById(elId).innerHTML = html || '<div style="padding:20px; text-align:center; color:#888;">No recent broadcasts.</div>';
        saveToCache(elId, html);
    } catch (e) {}
}

const airspaceDB = [
    { country: "IRAN", status: "CLOSED", detail: "ALL CIVILIAN FLIGHTS SUSPENDED (NOTAM ACTIVE)" }, 
    { country: "ISRAEL", status: "CLOSED", detail: "BEN GURION OPERATIONS HALTED" },
    { country: "LEBANON", status: "CLOSED", detail: "BEY AIRSPACE COMPLETELY CLOSED" }, 
    { country: "SYRIA", status: "CLOSED", detail: "MILITARY OPERATIONS ONLY" },
    { country: "IRAQ", status: "CLOSED", detail: "CIVIL AVIATION HALTED OVER SAFETY CONCERNS" }, 
    { country: "JORDAN", status: "CLOSED", detail: "AMM AIRSPACE CLOSED TEMPORARILY" },
    { country: "SAUDI ARABIA", status: "RESTRICTED USE", detail: "NORTH/EAST SECTORS RESTRICTED" }, 
    { country: "YEMEN", status: "CLOSED", detail: "NO CIVILIAN FLIGHTS PERMITTED" },
    { country: "UAE", status: "RESTRICTED USE", detail: "DXB/AUH SEVERE REROUTING & DELAYS" }, 
    { country: "BAHRAIN", status: "RESTRICTED USE", detail: "BAH DELAYS DUE TO MILITARY OPS" }
];

async function fetchAirspaceStatus() {
    const elId = 'airspace-grid';
    if(!loadFromCache(elId)) {
        let html = '';
        airspaceDB.forEach(ap => {
            let statusClass = ap.status === "OPEN" ? "air-open" : ap.status.includes("RESTRICTED") ? "air-restricted" : "air-closed";
            let hex = ap.status === "OPEN" ? "#22c55e" : ap.status.includes("RESTRICTED") ? "#f59e0b" : "#ef4444";
            html += `<div class="airspace-card ${statusClass}"><div class="country">${ap.country}</div><div class="status"><div style="width: 10px; height: 10px; border-radius: 50%; background: ${hex}; box-shadow: 0 0 8px ${hex};"></div><span style="color: ${hex};">${ap.status}</span></div><div class="detail">${ap.detail}</div><div class="sub-data"><span>THREAT: HIGH</span><span>DATA: OSINT/ADSB</span></div></div>`;
        });
        document.getElementById(elId).innerHTML = html;
    }

    try {
        // Added Intel_sky for aviation reporting
        const [flightEmerg, osint, intelSky] = await Promise.all([
            scrapeTelegramChannel('FlightEmergency', false), scrapeTelegramChannel('osintdefender', false), scrapeTelegramChannel('Intel_sky', false)
        ]);
        let posts = [...(flightEmerg||[]), ...(osint||[]), ...(intelSky||[])].sort((a,b) => b.date - a.date);
        
        airspaceDB.forEach(ap => {
            const mention = posts.find(p => p.text.toLowerCase().includes(ap.country.toLowerCase()) && (Date.now() - p.date.getTime()) < 24 * 3600000);
            if(mention) {
                const t = mention.text.toLowerCase();
                // Stricter keyword logic
                if(t.includes('reopen') || t.includes('resume') || t.includes('clear')) {
                    ap.status = "OPEN"; ap.detail = "OPERATIONS RESUMING VIA LATEST OSINT";
                } else if (t.includes('close') || t.includes('suspend') || t.includes('shut') || t.includes('halt')) {
                    ap.status = "CLOSED"; ap.detail = "AIRSPACE CLOSED VIA LATEST OSINT";
                }
            }
        });
        
        let html = '';
        airspaceDB.forEach(ap => {
            let statusClass = ap.status === "OPEN" ? "air-open" : ap.status.includes("RESTRICTED") ? "air-restricted" : "air-closed";
            let hex = ap.status === "OPEN" ? "#22c55e" : ap.status.includes("RESTRICTED") ? "#f59e0b" : "#ef4444";
            html += `<div class="airspace-card ${statusClass}"><div class="country">${ap.country}</div><div class="status"><div style="width: 10px; height: 10px; border-radius: 50%; background: ${hex}; box-shadow: 0 0 8px ${hex};"></div><span style="color: ${hex};">${ap.status}</span></div><div class="detail">${ap.detail}</div><div class="sub-data"><span>THREAT: HIGH</span><span>DATA: OSINT/ADSB</span></div></div>`;
        });
        document.getElementById(elId).innerHTML = html;
        saveToCache(elId, html);
    } catch(e) {}
}

// ==========================================
// KINETIC MAP TRACKER: LOCKED VIEW
// ==========================================
let currentFilterHours = 24; 
let activeMapMarkers = [];
let activePopup = null;
let markerInstances = {}; 

const regionMapping = {
    "TEHRAN": "IRAN", "ISFAHAN": "IRAN", "SHIRAZ": "IRAN", "KARAJ": "IRAN", "KERMANSHAH": "IRAN", "TABRIZ": "IRAN",
    "TEL AVIV": "ISRAEL", "JERUSALEM": "ISRAEL", "BEIT SHEMESH": "ISRAEL", "CENTRAL ISRAEL": "ISRAEL", "NORTHERN ISRAEL": "ISRAEL", "HAIFA": "ISRAEL",
    "BEIRUT": "LEBANON", "DAMASCUS": "SYRIA", "BAGHDAD": "IRAQ", "SANAA": "YEMEN", 
    "DUBAI": "UAE", "UAE": "UAE", "DOHA": "QATAR", "QATAR": "QATAR", 
    "MUSCAT": "OMAN", "DUQM (OMAN)": "OMAN", "MANAMA (BAHRAIN)": "BAHRAIN", "BAHRAIN": "BAHRAIN",
    "RIYADH": "SAUDI ARABIA", "US EMBASSY RIYADH": "SAUDI ARABIA", "SAUDI ARABIA": "SAUDI ARABIA"
};

const map = new maplibregl.Map({
    container: 'map',
    style: {
        "version": 8,
        "sources": { "carto-dark": { "type": "raster", "tiles": ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"], "tileSize": 256 } },
        "layers": [{"id": "carto-dark-layer", "type": "raster", "source": "carto-dark", "minzoom": 0, "maxzoom": 22}]
    },
    center: [46.0, 28.0], zoom: 4.2, pitch: 40, bearing: 0,
    interactive: false 
});

const nowMs = Date.now();
const baselineData = [
    { id: "iran1", title: "Heavy Airstrikes on Leadership Targets", location: "TEHRAN", lat: 35.6892, lng: 51.3890, eventType: "missile", timestamp: nowMs - (2*3600000), source: "Baseline" },
    { id: "iran2", title: "Airstrikes on Nuclear & Military Facilities", location: "ISFAHAN", lat: 32.7410, lng: 51.8650, eventType: "missile", timestamp: nowMs - (3*3600000), source: "Baseline" },
    { id: "iran3", title: "Missile Strikes on Airbase", location: "SHIRAZ", lat: 29.5918, lng: 52.5388, eventType: "missile", timestamp: nowMs - (4*3600000), source: "Baseline" },
    { id: "iran4", title: "Military Infrastructure Targeted", location: "KARAJ", lat: 35.8327, lng: 50.9915, eventType: "missile", timestamp: nowMs - (5*3600000), source: "Baseline" },
    { id: "iran5", title: "IRGC Base Struck", location: "KERMANSHAH", lat: 34.3142, lng: 47.0650, eventType: "missile", timestamp: nowMs - (6*3600000), source: "Baseline" },
    { id: "iran6", title: "Facilities targeted in Northwest", location: "TABRIZ", lat: 38.0773, lng: 46.2919, eventType: "missile", timestamp: nowMs - (7*3600000), source: "Baseline" },
    { id: "b0", title: "Air Siren - Jerusalem & Central Israel", location: "JERUSALEM", lat: 31.7683, lng: 35.2137, eventType: "siren", timestamp: nowMs - (80*3600000), source: "Baseline" },
    { id: "b1", title: "Missile Strike - Beit Shemesh Public Shelter", location: "BEIT SHEMESH", lat: 31.7470, lng: 34.9881, eventType: "missile", timestamp: nowMs - (75*3600000), source: "Baseline" },
    { id: "b2", title: "Air Siren Throughout Day", location: "TEL AVIV", lat: 32.0853, lng: 34.7818, eventType: "siren", timestamp: nowMs - (60*3600000), source: "Baseline" },
    { id: "b3", title: "Missile / Intercepted", location: "TEL AVIV", lat: 32.0953, lng: 34.7918, eventType: "intercept", timestamp: nowMs - (58*3600000), source: "Baseline" },
    { id: "b4", title: "Drone / Intercepted", location: "UAE", lat: 24.4539, lng: 54.3773, eventType: "intercept", timestamp: nowMs - (56*3600000), source: "Baseline" },
    { id: "b5", title: "Missile / Intercepted", location: "QATAR", lat: 25.2854, lng: 51.5310, eventType: "intercept", timestamp: nowMs - (55*3600000), source: "Baseline" },
    { id: "b6", title: "Drone Attack Naval Base", location: "DUQM (OMAN)", lat: 19.6643, lng: 57.7029, eventType: "drone", timestamp: nowMs - (54*3600000), source: "Baseline" },
    { id: "b7", title: "Nationwide Air Siren", location: "CENTRAL ISRAEL", lat: 31.9000, lng: 34.9000, eventType: "siren", timestamp: nowMs - (22*3600000), source: "Baseline" },
    { id: "b8", title: "Drone / Intercepted from Lebanon", location: "NORTHERN ISRAEL", lat: 32.9000, lng: 35.3000, eventType: "intercept", timestamp: nowMs - (20*3600000), source: "Baseline" },
    { id: "b9", title: "Missile Strike Mediterranean Region", location: "CYPRUS", lat: 35.1264, lng: 33.4299, eventType: "missile", timestamp: nowMs - (24*3600000), source: "Baseline" },
    { id: "b10", title: "Drone Attack Early Hours", location: "US EMBASSY RIYADH", lat: 24.6811, lng: 46.6222, eventType: "drone", timestamp: nowMs - (16*3600000), source: "Baseline" },
    { id: "b11", title: "Missile / Intercepted Just After Midnight", location: "CENTRAL ISRAEL", lat: 31.9100, lng: 34.9100, eventType: "intercept", timestamp: nowMs - (21*3600000), source: "Baseline" },
    { id: "b12", title: "Air Siren Just before 1:00 PM", location: "CENTRAL ISRAEL", lat: 31.9200, lng: 34.9200, eventType: "siren", timestamp: nowMs - (8.5*3600000), source: "Baseline" },
    { id: "b13", title: "Missile / Intercepted (Falling Shrapnel)", location: "CENTRAL ISRAEL", lat: 31.9300, lng: 34.9300, eventType: "intercept", timestamp: nowMs - (8.4*3600000), source: "Baseline" },
    { id: "b14", title: "Drone Attack Dubai Airport", location: "DUBAI", lat: 25.2532, lng: 55.3657, eventType: "drone", timestamp: nowMs - (48*3600000), source: "Baseline" },
    { id: "b15", title: "Missile Strike Salman Port", location: "MANAMA (BAHRAIN)", lat: 26.2169, lng: 50.6063, eventType: "missile", timestamp: nowMs - (14*3600000), source: "Baseline" },
    { id: "b16", title: "Burj Al Arab Strike", location: "DUBAI", lat: 25.1412, lng: 55.1852, eventType: "drone", timestamp: nowMs - (48*3600000), source: "Baseline" },
    { id: "b17", title: "Hotel Strike", location: "DUBAI HOTEL", lat: 25.1105, lng: 55.1388, eventType: "missile", timestamp: nowMs - (48*3600000), source: "Baseline" },
    { id: "b18", title: "Jebel Ali Port Attack", location: "DUBAI", lat: 24.9857, lng: 55.0273, eventType: "missile", timestamp: nowMs - (48*3600000), source: "Baseline" }
];

function getStoredIntel() { 
    try {
        let data = JSON.parse(localStorage.getItem('iqwr_intel_db')) || [];
        return data.filter(d => typeof d.timestamp === 'number' && !isNaN(d.timestamp));
    } catch(e) {
        localStorage.removeItem('iqwr_intel_db');
        return [];
    }
}

// MASSIVE LOCAL CACHE INCREASE (Up to 2500 events)
function saveStoredIntel(dataArray) { localStorage.setItem('iqwr_intel_db', JSON.stringify(dataArray.slice(-2500))); }

let globalIntelData = [];

const geoDB = {
    "tel aviv": { coords: [34.7818, 32.0853], aliases: ["tel aviv", "tel-aviv", "gush dan", "central israel", "jaffa"] },
    "jerusalem": { coords: [35.2137, 31.7683], aliases: ["jerusalem", "al-quds"] },
    "haifa": { coords: [34.9892, 32.7940], aliases: ["haifa", "carmel", "northern israel"] },
    "beirut": { coords: [35.5018, 33.8938], aliases: ["beirut", "dahieh"] },
    "damascus": { coords: [36.2913, 33.5138], aliases: ["damascus"] },
    "tehran": { coords: [51.3890, 35.6892], aliases: ["tehran"] },
    "isfahan": { coords: [51.8650, 32.7410], aliases: ["isfahan", "esfahan"] },
    "shiraz": { coords: [29.5918, 52.5388], aliases: ["shiraz"] },
    "karaj": { coords: [35.8327, 50.9915], aliases: ["karaj"] },
    "kermanshah": { coords: [34.3142, 47.0650], aliases: ["kermanshah"] },
    "tabriz": { coords: [38.0773, 46.2919], aliases: ["tabriz"] },
    "baghdad": { coords: [44.3615, 33.3128], aliases: ["baghdad"] },
    "sanaa": { coords: [44.2064, 15.3694], aliases: ["sanaa", "hodeidah", "yemen"] },
    "dubai": { coords: [55.2708, 25.2048], aliases: ["dubai", "jebel ali", "uae", "burj"] },
    "riyadh": { coords: [46.7167, 24.7136], aliases: ["riyadh", "saudi arabia", "aramco"] },
    "manama": { coords: [50.5860, 26.2285], aliases: ["bahrain", "manama", "salman port"] },
    "doha": { coords: [51.5310, 25.2854], aliases: ["qatar", "doha", "mesaieed"] },
    "muscat": { coords: [58.4059, 23.5859], aliases: ["muscat", "oman", "duqm"] },
    "cyprus": { coords: [33.4299, 35.1264], aliases: ["cyprus"] }
};

// STRICT OSINT ENGINE
function determineEventType(text) {
    let t = text.toLowerCase();
    if (t.includes("intercept")) return "intercept"; 
    if (t.includes("siren") || t.includes("red alert") || t.includes("alarm")) return "siren"; 
    if (t.includes("drone") || t.includes("uav") || t.includes("swarm")) return "drone"; 
    
    // Strict requirement: Must contain specific kinetic terminology to pass as a strike
    const strictKinetic = ['missile', 'strike', 'attack', 'rocket', 'bomb', 'explosion'];
    if (strictKinetic.some(kw => t.includes(kw))) return "missile";
    
    return null; // Return null if it's general news/noise
}

async function fetchLiveOSINT() {
    try {
        // Expanded OSINT Sources
        const [amkData, rnintelData, ddData, auroraData, clashData, intelSkyData] = await Promise.all([
            scrapeTelegramChannel('AMK_Mapping', true), scrapeTelegramChannel('rnintel', true), 
            scrapeTelegramChannel('DDGeopolitics', true), scrapeTelegramChannel('AuroraIntel', true),
            scrapeTelegramChannel('clashreport', true), scrapeTelegramChannel('Intel_sky', true)
        ]);
        
        const posts = [...(amkData||[]), ...(rnintelData||[]), ...(ddData||[]), ...(auroraData||[]), ...(clashData||[]), ...(intelSkyData||[])];
        let storedIntel = getStoredIntel();
        let newFound = false;
        let highestAlert = null;

        posts.forEach(post => {
            const title = post.text;
            const evtType = determineEventType(title);
            
            // Only proceed if it passed the strict kinetic filter
            if (evtType) {
                let detectedLoc = null, lat = null, lng = null;
                for (const [key, geoData] of Object.entries(geoDB)) {
                    if (geoData.aliases.some(alias => title.toLowerCase().includes(alias))) {
                        detectedLoc = key.toUpperCase(); lng = geoData.coords[0]; lat = geoData.coords[1]; break;
                    }
                }

                if (detectedLoc) {
                    const isDuplicate = storedIntel.some(existing => 
                        existing.location === detectedLoc && existing.eventType === evtType && Math.abs(existing.timestamp - post.date.getTime()) < (2*3600000)
                    );

                    if(!isDuplicate && (Date.now() - post.date.getTime()) < 3600000) {
                        storedIntel.push({
                            id: Math.random().toString(), title: title, eventType: evtType,
                            lat: lat + (Math.random()-0.5)*0.03, lng: lng + (Math.random()-0.5)*0.03, 
                            location: detectedLoc, timestamp: post.date.getTime(), 
                            source: post.channel.toUpperCase(),
                            mediaHTML: post.mediaHTML 
                        });
                        newFound = true;
                        if(evtType === 'missile') highestAlert = 'missile';
                        else if(evtType === 'siren' && highestAlert !== 'missile') highestAlert = 'siren';
                        else if(evtType === 'drone' && !highestAlert) highestAlert = 'drone';
                        else if(evtType === 'intercept' && !highestAlert) highestAlert = 'intercept';
                    }
                }
            }
        });

        if(newFound) {
            saveStoredIntel(storedIntel);
            if(highestAlert) triggerGlobalAlert(highestAlert);
        }

        let combinedData = [...baselineData];
        storedIntel.forEach(storedEvt => {
            const isDupBase = combinedData.some(baseEvt => 
                baseEvt.location === storedEvt.location && baseEvt.eventType === storedEvt.eventType && Math.abs(baseEvt.timestamp - storedEvt.timestamp) < (6*3600000)
            );
            if(!isDupBase) combinedData.push(storedEvt);
        });
        
        globalIntelData = combinedData;
        renderMapData();
    } catch (err) {}
}

// --- HISTORY.JSON INTEGRATION FETCH ENGINE ---
async function loadHistoryJson() {
    try {
        const res = await fetch('history.json');
        if (!res.ok) return;
        const historyData = await res.json();
        
        let storedIntel = getStoredIntel();
        let updated = false;
        
        historyData.forEach(item => {
            // Parse string dates into timestamps
            const itemTime = new Date(item.date || item.timestamp).getTime();
            if (isNaN(itemTime)) return; 
            
            // Deduplicate logic
            const isDup = storedIntel.some(ext => 
                ext.location === (item.location || "UNKNOWN") && 
                ext.eventType === (item.eventType || "missile") && 
                Math.abs(ext.timestamp - itemTime) < (2*3600000)
            );
            
            if (!isDup) {
                storedIntel.push({
                    id: item.id || Math.random().toString(),
                    title: item.title || item.text || "Historical Event",
                    eventType: item.eventType || determineEventType(item.title || item.text) || "missile",
                    lat: item.lat || 0,
                    lng: item.lng || 0,
                    location: item.location || "UNKNOWN",
                    timestamp: itemTime,
                    source: item.source || "HISTORY DB",
                    mediaHTML: item.mediaHTML || ""
                });
                updated = true;
            }
        });
        
        if (updated) {
            saveStoredIntel(storedIntel);
            // Refresh data pool with merged intel
            globalIntelData = [...baselineData, ...storedIntel];
            renderMapData();
        }
    } catch(e) { console.warn("No history.json found or invalid formatting."); }
}

function flyToLoc(lng, lat, strikeId) {
    map.flyTo({ center: [lng, lat], zoom: 9, essential: true, speed: 1.5 });
    if (activePopup) activePopup.remove();

    document.querySelectorAll('.manual-blink').forEach(el => el.classList.remove('manual-blink'));
    const targetMarkerEl = document.getElementById('marker-' + strikeId);
    
    if (targetMarkerEl) {
        targetMarkerEl.classList.add('manual-blink');
        setTimeout(() => { if(targetMarkerEl) targetMarkerEl.classList.remove('manual-blink'); }, 10000);
    }

    if (markerInstances[strikeId]) {
        markerInstances[strikeId].togglePopup();
        activePopup = markerInstances[strikeId].getPopup();
    }
}

function setFilter(hours) {
    currentFilterHours = hours;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${hours}`).classList.add('active');
    renderMapData();
}

function renderMapData() {
    activeMapMarkers.forEach(m => m.remove());
    activeMapMarkers = [];
    markerInstances = {}; 

    const feedElement = document.getElementById('feed');
    feedElement.innerHTML = '';
    
    const currMs = Date.now();
    const regionFilter = document.getElementById('region-filter').value;

    globalIntelData.forEach(d => { 
        if(d.timestamp) d.timeAgo = (currMs - d.timestamp) / 3600000; 
        else d.timeAgo = 0; 
    });
    
    const filtered = globalIntelData.filter(d => {
        if (d.timeAgo > currentFilterHours) return false;
        
        if (regionFilter !== 'ALL') {
            const mappedRegion = regionMapping[d.location] || d.location;
            if (!mappedRegion.includes(regionFilter)) return false;
        }
        return true;
    }).sort((a,b) => a.timeAgo - b.timeAgo);

    if (!filtered.length) {
        feedElement.innerHTML = '<div style="color: #666; text-align: center; padding: 20px 0;">NO DETECTIONS IN TIMEFRAME/REGION</div>';
        return;
    }

    filtered.forEach(strike => {
        let minutesAgo = Math.max(0, Math.floor(strike.timeAgo * 60));
        let timeText = minutesAgo < 1 ? "JUST NOW" : minutesAgo < 60 ? `T-MINUS ${minutesAgo}M` : strike.timeAgo < 24 ? `T-MINUS ${Math.floor(strike.timeAgo)}H` : `T-MINUS ${Math.floor(strike.timeAgo/24)}D`;
        
        let hex = '#ef4444'; if (strike.eventType === 'siren') hex = '#3b82f6'; else if (strike.eventType === 'drone') hex = '#f97316'; else if (strike.eventType === 'intercept') hex = '#9ca3af';

        const isCritical = minutesAgo <= 10;
        const criticalClassFeed = isCritical ? 'critical-blink-feed' : '';
        const criticalClassMarker = isCritical ? 'critical-blink-marker' : '';

        feedElement.insertAdjacentHTML('beforeend', `
            <div class="feed-entry ${strike.eventType} ${criticalClassFeed}" onclick="flyToLoc(${strike.lng}, ${strike.lat}, '${strike.id}')">
                <div class="entry-time"><span style="color:${hex}">[ NODE: ${strike.source} ]</span><span>${timeText}</span></div>
                <div class="entry-desc"><strong>${strike.location}:</strong> ${strike.title.substring(0,85)}${strike.title.length>85?'...':''}</div>
            </div>
        `);

        const elContainer = document.createElement('div');
        elContainer.className = 'zero-marker';
        elContainer.id = 'marker-' + strike.id;
        
        const dot = document.createElement('div');
        dot.className = `zero-dot ${criticalClassMarker}`;
        dot.style.backgroundColor = hex;
        elContainer.appendChild(dot);
        
        const ring = document.createElement('div');
        ring.className = 'zero-pulse';
        ring.style.borderColor = hex;
        if (strike.timeAgo > 6) ring.classList.add('inactive-pulse');
        elContainer.appendChild(ring);

        if (strike.eventType === 'siren') {
            const sirenRadar = document.createElement('div');
            sirenRadar.className = 'siren-radius';
            elContainer.appendChild(sirenRadar);
            
            if (minutesAgo >= 30 && minutesAgo <= 60) {
                elContainer.classList.add('siren-pulse');
            }
        }

        let formattedMedia = '';
        if (strike.mediaHTML) {
            // Map popups autoplay without controls
            formattedMedia = strike.mediaHTML.replace('<video', '<video autoplay loop muted playsinline');
            formattedMedia = `<div class="popup-media-container">${formattedMedia}</div>`;
        }

        const popupHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom: 6px; border-bottom: 1px solid #333; padding-bottom: 4px;">
                <strong style="color:${hex}; font-size:1.1em;">${strike.location}</strong>
                <span style="color:#aaa; font-size:0.8em; align-self:center;">${timeText}</span>
            </div>
            <div style="font-size:0.9em; line-height:1.4; margin-bottom: 8px; max-height: 120px; overflow-y: auto;">${strike.title}</div>
            <div style="font-size:0.7em; color:#888; text-transform:uppercase;">SOURCE: ${strike.source}</div>
            ${formattedMedia}`; 

        const popup = new maplibregl.Popup({ offset: 10, closeOnClick: false, maxWidth: '300px' }).setHTML(popupHTML);

        const marker = new maplibregl.Marker({ element: elContainer, anchor: 'center' })
            .setLngLat([strike.lng, strike.lat])
            .setPopup(popup)
            .addTo(map);

        elContainer.addEventListener('click', () => { activePopup = popup; });
        activeMapMarkers.push(marker);
        markerInstances[strike.id] = marker; 
    });
}

let secondsLeft = 600; 
function updateTimer() {
    let mins = Math.floor(secondsLeft / 60);
    let secs = secondsLeft % 60;
    document.getElementById('timer-display').innerText = `${mins < 10 ? '0'+mins : mins}:${secs < 10 ? '0'+secs : secs}`;
    if (secondsLeft <= 0) { secondsLeft = 600; fetchLiveOSINT(); fetchAirspaceStatus(); } else { secondsLeft--; }
}

window.onload = () => {
    loadFromCache('summary-feed');
    loadFromCache('news-feed');
    loadFromCache('iran-news-feed');
};

globalIntelData = [...baselineData, ...getStoredIntel()];
renderMapData(); 

map.on('load', () => {
    // Initiate historical data sync 
    loadHistoryJson();
    
    Promise.allSettled([ fetchTicker(), fetchSummary(), fetchNews(), fetchIranNews(), fetchAirspaceStatus(), fetchLiveOSINT() ]);
    
    setInterval(() => { Promise.allSettled([ fetchTicker(), fetchSummary(), fetchNews(), fetchAirspaceStatus() ]); }, 60000);
    setInterval(fetchIranNews, 65000);
    setInterval(updateTimer, 1000);
});
