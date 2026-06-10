// ==========================================
// 0. ПАРОЛЬ НА ВХІД ТА PWA (ОФЛАЙН РЕЖИМ)
// ==========================================
(function() {
    const isAuth = localStorage.getItem('dusya_auth');
    if (isAuth !== '2811') {
        let pass = prompt("Введіть пароль для доступу до Дусі:");
        if (pass === "2811") { localStorage.setItem('dusya_auth', '2811'); } 
        else {
            document.body.innerHTML = "<h2 style='color:red; text-align:center; padding-top:20vh; font-family:sans-serif;'>Доступ заборонено.</h2>";
            throw new Error("Зупинка скрипта: невірний пароль.");
        }
    }
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
    }
})();

window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

// ==========================================
// 1. НАЛАШТУВАННЯ ТА ЗМІННІ СТАНУ 
// ==========================================
console.log("Запуск Дусі v6.0: ШІ-Радар, Сон Мікрофона та Локальні Перехоплювачі!");

const speedElement = document.getElementById('speed-display');
const statusElement = document.getElementById('status-text');
const dusyaBtn = document.getElementById('dusya-btn');
const keepAliveAudio = document.getElementById('keep-alive-audio');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');

// --- ЗМІННІ ДЛЯ ШІ РАДАРА ---
const aiRadarToggle = document.getElementById('ai-radar-toggle');
const aiSensSlider = document.getElementById('ai-sens-slider');
const aiFocalSlider = document.getElementById('ai-focal-slider');
const aiSensVal = document.getElementById('ai-sens-val');
const aiFocalVal = document.getElementById('ai-focal-val');

let isRadarActive = false;
let aiStream = null;
let aiSens = 60;
let aiFocal = 1.0;
let aiModel = null;
let lastBeepTime = 0;

const TARGET_CLASSES = ['person', 'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'cat', 'dog', 'stop sign'];
const REAL_HEIGHTS = { 'person': 1.7, 'car': 1.5, 'truck': 3.0, 'bus': 3.0, 'motorcycle': 1.2, 'bicycle': 1.2, 'cat': 0.3, 'dog': 0.5, 'stop sign': 1.0 };

let currentMode = "DEFAULT"; 
let chatHistory = [];        

let isListening = false;      
let said70 = false;
let said100 = false;
let wakeLock = null;

let isWaitingForCommand = false;
let waitingTimer = null;
let isAutoGuideActive = false; 
let lastPlaceName = "";        

let isRecordingNote = false;   
let currentNoteText = "";      
let noteTimerInterval = null;  
let isWaitingForCleanupConfirm = false;
let isTimeMachineActive = false;
let said88mph = false;
let jamStartTime = 0;          
let isJamZenActive = false;    

let currentLat = null;
let currentLon = null;
let currentPlaceName = "невідома місцевість";
let isInCityZone = false; 
let isFirstLocationCheck = true;
let locationTimer = null;
let gpsSpeed = 0;              

// ЗМІННІ ДЛЯ ВЕЛОСИПЕДА ТА НОВИХ ЗВУКІВ
let isBikeMode = false;
let saidBikeFast = false;
let activeLoopOscillators = []; 
let activeIntervals = [];

// ==========================================
// 2. ДИНАМІЧНИЙ ІНТЕРФЕЙС ТА НАЛАШТУВАННЯ
// ==========================================
const styleInject = document.createElement('style');
styleInject.innerHTML = `
    #net-indicator { position:fixed; top:20px; right:20px; width:15px; height:15px; border-radius:50%; background:gray; z-index:9999; box-shadow: 0 0 8px rgba(0,0,0,0.8); transition: background 0.5s; }
    #note-overlay { position:fixed; top:20px; left:20px; background:rgba(220,20,60,0.9); color:white; padding:10px 20px; border-radius:20px; font-size:20px; font-family:sans-serif; font-weight:bold; z-index:9999; display:none; align-items:center; box-shadow: 0 0 15px rgba(220,20,60,0.8); }
    .blink-dot { width:12px; height:12px; background:white; border-radius:50%; margin-right:10px; animation: blinker 1s linear infinite; }
    @keyframes blinker { 50% { opacity: 0; } }
`;
document.head.appendChild(styleInject);

const netIndicator = document.createElement('div');
netIndicator.id = 'net-indicator';
document.body.appendChild(netIndicator);

const noteOverlay = document.createElement('div');
noteOverlay.id = 'note-overlay';
noteOverlay.innerHTML = `<div class="blink-dot"></div> <span id="note-time">00:00</span>`;
document.body.appendChild(noteOverlay);

setInterval(async () => {
    if (!navigator.onLine) { netIndicator.style.background = 'red'; return; }
    let start = Date.now();
    try {
        await fetch("https://api.open-meteo.com/v1/forecast?latitude=50&longitude=30&current=temperature_2m", {mode: 'no-cors', cache: 'no-store'});
        let duration = Date.now() - start;
        netIndicator.style.background = duration < 800 ? '#00FF00' : 'yellow'; 
    } catch(e) { netIndicator.style.background = 'red'; }
}, 30000); 

window.addEventListener('DOMContentLoaded', () => {
    try { 
        const savedKey = localStorage.getItem('gemini_api_key'); 
        if (savedKey) apiKeyInput.value = savedKey; 
        
        const savedSens = localStorage.getItem('dusya_ai_sens');
        if (savedSens && aiSensSlider) { aiSensSlider.value = savedSens; aiSensVal.innerText = savedSens + "%"; aiSens = parseInt(savedSens); }
        
        const savedFocal = localStorage.getItem('dusya_ai_focal');
        if (savedFocal && aiFocalSlider) { aiFocalSlider.value = savedFocal; aiFocalVal.innerText = savedFocal; aiFocal = parseFloat(savedFocal); }
        
        const savedHood = localStorage.getItem('dusya_hood_y');
        if (savedHood && document.getElementById('hood-line')) {
            document.getElementById('hood-line').style.top = savedHood + "%";
        }
    } catch (e) { }
    
    if (speedElement) { speedElement.style.fontSize = "25vh"; speedElement.style.lineHeight = "1.2"; speedElement.style.fontWeight = "900"; }
});

// Живе оновлення тексту повзунків на екрані
if (aiSensSlider) aiSensSlider.oninput = (e) => {
    aiSensVal.innerText = e.target.value + "%";
    aiSens = parseInt(e.target.value);
    localStorage.setItem('dusya_ai_sens', e.target.value);
};
if (aiFocalSlider) aiFocalSlider.oninput = (e) => {
    aiFocalVal.innerText = e.target.value;
    aiFocal = parseFloat(e.target.value);
    localStorage.setItem('dusya_ai_focal', e.target.value);
};

settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

saveSettingsBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) { localStorage.setItem('gemini_api_key', key); }

    if (aiRadarToggle && aiRadarToggle.checked !== isRadarActive) {
        toggleRadar(aiRadarToggle.checked);
    }

    saveSettingsBtn.innerText = "✅ Збережено!"; 
    setTimeout(() => { settingsModal.classList.add('hidden'); saveSettingsBtn.innerText = "Зберегти"; }, 1000);
});

// ==========================================
// ЛОГІКА "ЛІНІЇ КАПОТА" ТА КЕРУВАННЯ РАДАРОМ
// ==========================================
const hoodLine = document.getElementById('hood-line');
const radarControls = document.getElementById('radar-controls');
const exitRadarBtn = document.getElementById('exit-radar-btn');

let hideLineTimeout = null;
let isDraggingLine = false;

// Вихід з радара по кнопці
if (exitRadarBtn) {
    exitRadarBtn.addEventListener('click', () => {
        if(aiRadarToggle) aiRadarToggle.checked = false;
        toggleRadar(false);
    });
}

function wakeUpHoodLine() {
    if (!hoodLine || !isRadarActive) return;
    hoodLine.style.opacity = '1';
    if (radarControls) radarControls.classList.add('visible');
    
    if (hideLineTimeout) clearTimeout(hideLineTimeout);
    
    hideLineTimeout = setTimeout(() => {
        if (!isDraggingLine) {
            hoodLine.style.opacity = '0';
            if (radarControls) radarControls.classList.remove('visible');
        }
    }, 5000);
}

document.addEventListener('touchstart', wakeUpHoodLine);
document.addEventListener('mousedown', wakeUpHoodLine);

if (hoodLine) {
    hoodLine.addEventListener('touchstart', (e) => { isDraggingLine = true; wakeUpHoodLine(); });
    document.addEventListener('touchmove', (e) => {
        if (!isDraggingLine) return;
        let touchY = e.touches[0].clientY;
        if (touchY > 50 && touchY < window.innerHeight - 50) {
            let perc = (touchY / window.innerHeight) * 100;
            hoodLine.style.top = perc + '%';
            localStorage.setItem('dusya_hood_y', perc);
        }
        wakeUpHoodLine();
    });
    document.addEventListener('touchend', () => { isDraggingLine = false; wakeUpHoodLine(); });
}

function resetVisuals() {
    if(!isRadarActive) document.body.style.backgroundColor = "";
    speedElement.style.color = "white";
    speedElement.style.fontFamily = "";
    speedElement.style.textShadow = "none";
}

function stopAllSounds() {
    activeLoopOscillators.forEach(osc => { try { osc.stop(); osc.disconnect(); } catch(e){} });
    activeLoopOscillators = [];
    activeIntervals.forEach(int => clearInterval(int));
    activeIntervals = [];
}

// ==========================================
// ШІ-РАДАР ТА ВІДЕО-АНАЛІЗ
// ==========================================
async function loadAILibraries() {
    return new Promise((resolve) => {
        if (window.cocoSsd) return resolve();
        statusElement.innerText = "Дуся: Завантажую ШІ (1/2)...";
        const tfScript = document.createElement('script');
        tfScript.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs";
        tfScript.onload = () => {
            statusElement.innerText = "Дуся: Завантажую ШІ (2/2)...";
            const cocoScript = document.createElement('script');
            cocoScript.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd";
            cocoScript.onload = () => {
                statusElement.innerText = "Дуся: ШІ Готовий!";
                resolve();
            };
            document.head.appendChild(cocoScript);
        };
        document.head.appendChild(tfScript);
    });
}

async function toggleRadar(turnOn) {
    isRadarActive = turnOn;
    const radarLayer = document.getElementById('ai-radar-layer');
    const video = document.getElementById('ai-video');
    
    if (turnOn) {
        document.body.classList.add('radar-active');
        radarLayer.style.display = 'block';
        
        // ЗУПИНЯЄМО ДУСЮ (Мікрофон спить для економії ресурсів)
        if (recognition) { try { recognition.stop(); } catch(e){} }
        statusElement.innerText = "Радар активний (Мікрофон вимкнено)";
        
        try {
            aiStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: "environment"}});
            video.srcObject = aiStream;
            wakeUpHoodLine();
            
            await loadAILibraries();
            if (!aiModel) aiModel = await cocoSsd.load();
            detectAI(); 
        } catch(e) {
            speak("Немає доступу до камери");
            toggleRadar(false);
            if(aiRadarToggle) aiRadarToggle.checked = false;
        }
    } else {
        document.body.classList.remove('radar-active');
        radarLayer.style.display = 'none';
        if (aiStream) { aiStream.getTracks().forEach(t => t.stop()); aiStream = null; }
        if (video) video.srcObject = null;
        
        const canvas = document.getElementById('ai-canvas');
        if(canvas) canvas.getContext('2d').clearRect(0,0, canvas.width, canvas.height);
        
        // БУДИМО ДУСЮ
        if (isListening && recognition) { 
            try { recognition.start(); statusElement.innerText = "Дуся: Слухаю..."; } catch(e){} 
        } else if (!isListening) {
            statusElement.innerText = "Вимкнена";
        }
    }
}

async function detectAI() {
    if (!isRadarActive || !aiModel || !aiStream) return;
    const video = document.getElementById('ai-video');
    const canvas = document.getElementById('ai-canvas');
    const ctx = canvas.getContext('2d');
    
    if (video.readyState === 4) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const predictions = await aiModel.detect(video);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        let hoodYPercent = parseFloat(localStorage.getItem('dusya_hood_y')) || 70;
        let hoodYPixel = (hoodYPercent / 100) * canvas.height;

        let isDanger = false;

        predictions.forEach(p => {
            if (p.score < (aiSens / 100)) return; 
            if (!TARGET_CLASSES.includes(p.class)) return; 

            const [x, y, w, h] = p.bbox;
            let realH = REAL_HEIGHTS[p.class];
            let dist = (realH * (canvas.height * aiFocal)) / h; 
            
            let bottomY = y + h; 
            let color = "#00FF00"; 
            
            if (bottomY >= hoodYPixel) {
                color = "#FF0000"; 
                isDanger = true;
            } else if (bottomY >= hoodYPixel - (canvas.height * 0.15)) {
                color = "#FFFF00"; 
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);
            
            ctx.fillStyle = color;
            ctx.font = "bold 24px monospace";
            ctx.fillText(`${p.class.toUpperCase()} ~${Math.round(dist)}m`, x, y - 10);
        });

        if (isDanger) {
            let now = Date.now();
            if (now - lastBeepTime > 1500) { 
                playDangerBeep();
                if (isBikeMode) playBikeBellAlert(); 
                lastBeepTime = now;
            }
        }
    }
    
    if (isRadarActive) requestAnimationFrame(detectAI);
}

// ==========================================
// 3. ЗВУКОВІ МАЯКИ ТА СПЕЦЕФЕКТИ 
// ==========================================
function playDangerBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(1.0, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
}

function playBikeBellAlert() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const gain = ctx.createGain(); gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.5, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        const osc1 = ctx.createOscillator(); osc1.type = 'sine'; osc1.frequency.setValueAtTime(2000, ctx.currentTime);
        const osc2 = ctx.createOscillator(); osc2.type = 'triangle'; osc2.frequency.setValueAtTime(2050, ctx.currentTime);
        osc1.connect(gain); osc2.connect(gain);
        osc1.start(); osc2.start(); osc1.stop(ctx.currentTime + 0.8); osc2.stop(ctx.currentTime + 0.8);
    } catch(e){}
}

function playPing() { 
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(1200, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.15);
    } catch(e){}
}

function playChime() { 
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const gain = ctx.createGain(); gain.gain.setValueAtTime(0.06, ctx.currentTime); gain.connect(ctx.destination);
        const osc1 = ctx.createOscillator(); osc1.frequency.setValueAtTime(520, ctx.currentTime); osc1.connect(gain); osc1.start(); osc1.stop(ctx.currentTime + 0.08);
        const osc2 = ctx.createOscillator(); osc2.frequency.setValueAtTime(420, ctx.currentTime + 0.08); osc2.connect(gain); osc2.start(ctx.currentTime + 0.08); osc2.stop(ctx.currentTime + 0.22);
    } catch(e){}
}

function playSciFiAcceleration() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 1.2);
        gain.gain.setValueAtTime(0.05, ctx.currentTime); gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 1.2);
    } catch(e) {}
}

function playMagicSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const gain = ctx.createGain(); gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.05, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);
        [800, 1000, 1200, 1500, 2000].forEach((freq, i) => {
            let osc = ctx.createOscillator(); osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + i*0.15);
            osc.connect(gain); osc.start(ctx.currentTime + i*0.15); osc.stop(ctx.currentTime + i*0.15 + 0.5);
        });
    } catch(e){}
}

function playBikeBellLoop() {
    stopAllSounds();
    const ring = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const gain = ctx.createGain(); gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            const osc1 = ctx.createOscillator(); osc1.type = 'sine'; osc1.frequency.setValueAtTime(2000, ctx.currentTime);
            const osc2 = ctx.createOscillator(); osc2.type = 'triangle'; osc2.frequency.setValueAtTime(2050, ctx.currentTime);
            osc1.connect(gain); osc2.connect(gain);
            osc1.start(); osc2.start(); osc1.stop(ctx.currentTime + 0.5); osc2.stop(ctx.currentTime + 0.5);
        } catch(e){}
    };
    ring();
    activeIntervals.push(setInterval(ring, 2500));
}

function playUFOLoop() {
    stopAllSounds();
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(80, ctx.currentTime);
        
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(1.5, ctx.currentTime); 
        
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(30, ctx.currentTime); 
        
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
        
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        osc.connect(gain); gain.connect(ctx.destination);
        
        osc.start(); lfo.start();
        activeLoopOscillators.push(osc); activeLoopOscillators.push(lfo);
    } catch(e){}
}

function speak(text, onEndCallback = null) {
    if (isRadarActive) {
        if (onEndCallback) onEndCallback();
        return; 
    }

    if ('speechSynthesis' in window) {
        if (recognition) { try { recognition.stop(); } catch(e){} }
        window.speechSynthesis.cancel(); 
        const cleanText = text.replace(/[*#_]/g, '').trim();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'uk-UA';

        const voices = window.speechSynthesis.getVoices();
        let bestVoice = voices.find(v => v.lang.includes('uk'));
        if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('ru') && (v.name.toLowerCase().includes('female') || v.name.includes('Google') || v.name.includes('Milena')));
        if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('ru'));
        if (bestVoice) utterance.voice = bestVoice;

        utterance.onend = () => {
            playChime(); 
            if (onEndCallback) {
                onEndCallback();
            } else if (isListening && !isRadarActive && !window.speechSynthesis.speaking && !isRecordingNote && !isWaitingForCleanupConfirm) {
                try { 
                    recognition.start(); 
                    statusElement.innerText = "Дуся: Слухаю..."; 
                    dusyaBtn.style.backgroundColor = "#00FF00"; 
                } catch(e) { }
            }
        };
        utterance.onerror = () => { if (isListening && !isRadarActive && !isRecordingNote) { try { recognition.start(); dusyaBtn.style.backgroundColor = "#00FF00"; } catch(e) { } } };
        window.speechSynthesis.speak(utterance);
    }
}

function openYouTubeApp(query) {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
}

// ==========================================
// 4. GPS КАРТИ, ПОГОДА ТА ЗОНИ 
// ==========================================
async function checkLocationAndZone() {
    if (!currentLat || !currentLon) {
        if (isAutoGuideActive && lastPlaceName !== "") { speak(`Сигнал GPS слабкий, але ми все ще в районі ${lastPlaceName}.`); }
        return;
    }
    try {
        let res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${currentLat}&lon=${currentLon}&format=json&accept-language=uk`);
        let data = await res.json();
        
        if (data && data.address) {
            let place = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.address.suburb;
            let isCurrentlyInCity = (data.address.city || data.address.town || data.address.village) ? true : false;
            if (place) currentPlaceName = place;

            if (isFirstLocationCheck) {
                isFirstLocationCheck = false; isInCityZone = isCurrentlyInCity;
                if (!isBikeMode) {
                    if (isInCityZone) { speak(`Привіт! Ми зараз у місті ${currentPlaceName}. Дозволена швидкість 50. Пристебни пасок.`); } 
                    else { speak(`Вітаю! Ми на трасі, навколо ${currentPlaceName}. Обмеження 90. Не забудь пристебнутися!`); }
                }
                return;
            }

            if (isAutoGuideActive && place && place !== lastPlaceName) {
                lastPlaceName = place;
                statusElement.innerText = "Дуся: Авто-гід розповідає...";
                let guideResponse = await askDusyaAI(`Ми зараз проїжджаємо населений пункт ${place}. Розкажи короткий цікавий історичний факт. 2-3 речення.`);
                speak(guideResponse); return;
            }

            if (!isBikeMode) {
                if (gpsSpeed > 80) { isInCityZone = false; return; }
                if (isCurrentlyInCity && !isInCityZone) { isInCityZone = true; speak(`Попереду населений пункт ${currentPlaceName}. Скидаємо швидкість до 50.`); } 
                else if (!isCurrentlyInCity && isInCityZone) { isInCityZone = false; speak(`Населений пункт закінчився. Можна 90.`); }
            }
        }
    } catch(e) { 
        if (isAutoGuideActive && lastPlaceName !== "") { speak(`Не маю доступу до карти, але ми приблизно біля ${lastPlaceName}.`); }
    }
}

async function handleWeatherCommand(city) {
    statusElement.innerText = "Дуся: Шукаю погоду...";
    if (recognition) recognition.stop();
    let lat = currentLat; let lon = currentLon; let cityName = currentPlaceName;

    if (city) {
        try {
            let geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=uk`);
            let geoData = await geoRes.json();
            if (geoData.results && geoData.results.length > 0) { lat = geoData.results[0].latitude; lon = geoData.results[0].longitude; cityName = "місті " + geoData.results[0].name; } 
            else { speak(`Не змогла знайти місто ${city}.`); return; }
        } catch(e) { speak("Помилка пошуку міста."); return; }
    }
    if (!lat || !lon) { speak("Координати не визначено."); return; }

    try {
        let wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`);
        let wData = await wRes.json();
        if (wData && wData.current && wData.daily) {
            let tempNow = Math.round(wData.current.temperature_2m);
            let code = wData.current.weather_code;
            let tempMinTom = Math.round(wData.daily.temperature_2m_min[1]);
            let tempMaxTom = Math.round(wData.daily.temperature_2m_max[1]);
            let desc = "гарна погода";
            if (code === 0) desc = "ясно і сонячно"; else if (code >= 1 && code <= 3) desc = "мінлива хмарність"; else if (code === 45 || code === 48) desc = "туманно"; else if (code >= 61 && code <= 65) desc = "йде дощ"; else if (code >= 71 && code <= 75) desc = "йде сніг"; else if (code >= 95) desc = "гроза";
            speak(`Зараз тут ${tempNow} градусів, ${desc}. На завтра прогноз: від ${tempMinTom} до ${tempMaxTom} градусів.`);
        } else { speak("Не вдалося отримати метеодані."); }
    } catch(e) { speak("Проблеми з метеосервером."); }
}

// ==========================================
// 5. МІЗКИ ШІ
// ==========================================
async function askDusyaAI(userQuestion) {
    if (!navigator.onLine) { return "Інтернет відсутній. Працюю як офлайн-спідометр."; }
    let apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return "Будь ласка, введіть API ключ у налаштуваннях.";
    
    const now = new Date();
    const currentDateStr = now.toLocaleDateString('uk-UA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTimeStr = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    
    let systemInstruction = "";
    if (isBikeMode) {
        systemInstruction = `Ти - Дуся, спортивний вело-штурман. Сьогодні: ${currentDateStr}. Місце: ${currentPlaceName}. Відповідай коротко. Знаєш все про велосипеди, калорії, здоров'я та рекорди.`;
    } else if (currentMode === "DEFAULT") {
        systemInstruction = `Ти - Дуся, авто-штурман. Сьогодні: ${currentDateStr}, час: ${currentTimeStr}. Місце: ${currentPlaceName}. Відповідай коротко.`;
    } else if (currentMode === "TALKATIVE") {
        systemInstruction = `Ти - супер-ерудована Дуся. Сьогодні: ${currentDateStr}, час: ${currentTimeStr}. Знаєш: авто, математику, філософію. На питання з медицини - додай дисклеймер ШІ.`;
    } else if (currentMode === "CHATTERBOX") {
        systemInstruction = `Ти - Дуся в режимі "Балабол". Твоя мета - розважати водія в заторах. Розказуй цікаві байки, жартуй. В кінці кожної репліки ти ОБОВ'ЯЗКОВО ставиш водію питання.`;
    }

    if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === "user") { chatHistory.pop(); }
    chatHistory.push({ role: "user", parts: [{ text: userQuestion }] });
    if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), 7000);

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ systemInstruction: { parts: [{ text: systemInstruction }] }, contents: chatHistory }),
            signal: abortCtrl.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        let aiText = data.candidates[0].content.parts[0].text;
        chatHistory.push({ role: "model", parts: [{ text: aiText }] });
        return aiText;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') return "Інтернет занадто слабкий. Переходжу в офлайн режим.";
        return "Тимчасові проблеми зі зв'язком з інтернетом.";
    }
}

// ==========================================
// 6. РОЗПІЗНАВАННЯ ТА ОБРОБКА КОМАНД
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'uk-UA'; recognition.continuous = true; recognition.interimResults = false;

    recognition.onresult = async (event) => {
        const last = event.results.length - 1;
        const transcript = event.results[last][0].transcript.toLowerCase().trim();
        console.log("Дуся почула: ", transcript);

        if (transcript.includes("дуся") || isWaitingForCommand) { 
            dusyaBtn.style.backgroundColor = "#FFA500"; 
            playPing(); 
        }

        if (isWaitingForCleanupConfirm) {
            if (transcript.includes("так") || transcript.includes("очистити") || transcript.includes("видалити")) {
                localStorage.removeItem('dusya_notes'); localStorage.removeItem('dusya_parking');
                localStorage.setItem('dusya_last_cleanup', Date.now());
                isWaitingForCleanupConfirm = false; speak("Сейф повністю очищено.");
            } else if (transcript.includes("ні") || transcript.includes("залишити") || transcript.includes("не треба")) {
                localStorage.setItem('dusya_last_cleanup', Date.now());
                isWaitingForCleanupConfirm = false; speak("Зрозуміла, залишаю всі записи.");
            } else { speak("Скажіть Так або Ні."); }
            return;
        }

        // --- 1. АВАРІЙНИЙ СТОП-КРАН (СКИДАЄ ВСЕ) ---
        if (transcript.includes("стоп") || transcript.includes("завершити") || transcript.includes("хватить") || transcript.includes("закрийся") || transcript.includes("все нормально") || transcript.includes("тихо") || transcript.includes("вимкни звук")) {
            stopAllSounds();
            isBikeMode = false;
            if (isRadarActive) { toggleRadar(false); if(aiRadarToggle) aiRadarToggle.checked = false; }
            if (noteTimerInterval) { clearInterval(noteTimerInterval); noteTimerInterval = null; }
            window.speechSynthesis.cancel(); 
            currentMode = "DEFAULT"; chatHistory = []; 
            isWaitingForCommand = false; isRecordingNote = false; isTimeMachineActive = false;
            resetVisuals(); document.getElementById('note-overlay').style.display = 'none';
            dusyaBtn.style.backgroundColor = "#00FF00"; 
            playPing(); statusElement.innerText = "Дуся: Режим Штурмана";
            if (recognition) { try { recognition.stop(); } catch(e){} }
            speak("Зрозуміла. Всі ефекти вимкнено, режим авто-штурмана повернуто.");
            return;
        }

        // --- ШПАРГАЛКА КОМАНД (Локальна) ---
        if (transcript.match(/(що ти вмієш|розкажи команди|команди|що ти можеш|допомога|функції|як тобою керувати)/i)) {
            if (recognition) recognition.stop(); 
            speak("Я працюю локально. Скажи 'Включи Ютуб' для музики. Скажи 'Запам'ятай парковку', щоб знайти авто. Скажи 'Покажи заправки' для мапи. Скажи 'Запиши замітку' для сейфа. Або скажи 'Режим балабола' для розваг."); 
            return;
        }

        // --- YOUTUBE ТА МУЗИКА (Жорсткий локальний перехоплювач) ---
        let ytMatch = transcript.match(/(?:включи|відкрий|знайди)\s+(?:пісню|музику|в ютубі|на ютубі|ютуб)?\s*(.*)/i);
        if (ytMatch && (transcript.includes("ютуб") || transcript.includes("включи") || transcript.includes("пісню") || transcript.includes("відкрий"))) {
            let ytQuery = ytMatch[1] ? ytMatch[1].trim() : ""; 
            if (recognition) recognition.stop(); 
            if (ytQuery) {
                speak(`Відкриваю ${ytQuery} на Ютубі.`); 
                openYouTubeApp(ytQuery); 
            } else {
                speak("Відкриваю Ютуб."); 
                window.open(`https://www.youtube.com`, '_blank');
            }
            return;
        }

        // --- ЛОКАЛЬНИЙ ПОШУК ОБ'ЄКТІВ НА МАПІ ---
        let mapMatch = transcript.match(/(?:покажи|знайди)\s+(заправки|заправку|кафе|макдональдс|пам'ятки|ресторани|магазини|аптеки|аптеку|туалет|парковки)/i);
        if (mapMatch && mapMatch[1]) {
            if (recognition) recognition.stop();
            let query = mapMatch[1].trim();
            speak(`Відкриваю результати пошуку: ${query}.`);
            window.open(`http://maps.google.com/maps?q=${encodeURIComponent(query)}`, '_blank');
            return;
        }

        // --- ПАРКУВАЛЬНА ПАМ'ЯТЬ (Розширена) ---
        if (transcript.match(/(запам'ятай парковку|запам'ятай машину|я припаркувався|тут залишаю машину|відміть точку парковки|запам'ятай місце)/i)) {
            if (currentLat && currentLon) {
                localStorage.setItem('dusya_parking', JSON.stringify({lat: currentLat, lon: currentLon}));
                if (recognition) recognition.stop(); speak("Зрозуміла, координати збережено. Машина під наглядом!");
            } else { if (recognition) recognition.stop(); speak("Немає сигналу GPS."); }
            return;
        }
        if (transcript.match(/(де моя машина|знайди машину|де машина|де стоянка|дорогу до машини|покажи дорогу назад)/i)) {
            let parkingData = localStorage.getItem('dusya_parking'); if (recognition) recognition.stop();
            if (parkingData) {
                let p = JSON.parse(parkingData); 
                window.open(`http://maps.google.com/maps?daddr=${p.lat},${p.lon}&dirflg=w`, '_blank');
                speak("Будую пішохідний маршрут до машини.");
            } else { speak("Я не пам'ятаю, де ви припаркувалися."); }
            return;
        }

        // --- 2. ВЕЛО-ФІШКИ ТА ТРАНСПОРТНІ ПАСХАЛКИ ---
        if (transcript.includes("режим велосипеда") || transcript.includes("я на велику")) {
            isBikeMode = true;
            document.body.style.backgroundColor = "#004d00"; 
            speedElement.style.color = "#00FF00";
            if(recognition) recognition.stop();
            speak("Вело-штурман активований! Крути педалі, я слідкую за маршрутом і швидкістю."); return;
        }

        if (transcript.includes("багато людей")) {
            if(recognition) recognition.stop(); speak("Вмикаю попереджувальний сигнал.", playBikeBellLoop); return;
        }

        if (transcript.includes("режим нло") || transcript.includes("космічний корабель")) {
            document.body.style.backgroundColor = "#191970"; 
            speedElement.style.color = "#00FFFF"; 
            if(recognition) recognition.stop(); speak("Гіпер-двигун активовано.", playUFOLoop); return;
        }

        let routeMatch = transcript.match(/(?:маршрут до|доїхати до|найближча)\s+(.*)/i);
        if (routeMatch && routeMatch[1]) {
            let target = routeMatch[1];
            if(recognition) recognition.stop(); 
            speak(`Відкриваю карти, будую маршрут до ${target}.`);
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}${isBikeMode ? '&travelmode=bicycling' : ''}`, '_blank');
            return;
        }

        // --- 3. ЗАМІТКИ ---
        if (isRecordingNote) {
            if (transcript.includes("кінець") || transcript.includes("зберегти") || transcript.includes("кінець замітки")) {
                isRecordingNote = false;
                if (noteTimerInterval) { clearInterval(noteTimerInterval); noteTimerInterval = null; }
                document.getElementById('note-overlay').style.display = 'none';
                let existingNotes = localStorage.getItem('dusya_notes') || "";
                if (currentNoteText.trim() !== "") {
                    localStorage.setItem('dusya_notes', existingNotes + (existingNotes ? " | " : "") + currentNoteText.trim());
                    speak("Замітку надійно збережено у сейф.");
                } else { speak("Запис порожній."); }
                statusElement.innerText = "Дуся: Слухаю...";
                if (recognition) { try { recognition.stop(); } catch(e){} }
            } else { currentNoteText += " " + transcript; }
            return; 
        }

        if (window.speechSynthesis.speaking) return; 

        // --- 4. МИТТЄВІ ЛОКАЛЬНІ КОМАНДИ ---
        if (transcript.includes("котра година") || transcript.includes("який час")) {
            if (recognition) recognition.stop(); let localT = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }); speak(`Зараз ${localT}.`); return;
        }
        if (transcript.includes("яке сьогодні число") || transcript.includes("яка дата")) {
            if (recognition) recognition.stop(); let localD = new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' }); speak(`Сьогодні ${localD}.`); return;
        }
        if (transcript.includes("де ми") || transcript.includes("яке це місто")) {
            if (recognition) recognition.stop(); speak(`Ми зараз в районі ${currentPlaceName}.`); return;
        }
        if (transcript.includes("яка швидкість")) {
            if (recognition) recognition.stop(); speak(`Зараз наша швидкість ${gpsSpeed}.`); return;
        }

        // --- ПАСХАЛКА ДЛЯ УЛІ ---
        if (transcript.includes("привітай улю") || transcript.includes("привітай уля") || transcript.includes("привіт уля")) {
            if (recognition) recognition.stop();
            document.body.style.backgroundColor = "#4B0082"; speedElement.style.color = "#FF1493"; speedElement.style.textShadow = "0 0 30px #FF1493";
            playMagicSound();
            speak("Ого, який важливий пасажир на борту! Привіт, Уля! Пристебни пасок, зараз буде магія! Ти слухалась тата і маму? Тоді ось тобі весела пісенька.", () => {
                openYouTubeApp("трендові пісні для підлітків 2024");
            });
            return;
        }

        // --- ЗМІНА КОЛЬОРУ ---
        if (transcript.includes("колір червоний")) { speedElement.style.color = "red"; if(recognition) recognition.stop(); speak("Колір червоний."); return; }
        if (transcript.includes("колір зелений")) { speedElement.style.color = "#00FF00"; if(recognition) recognition.stop(); speak("Колір зелений."); return; }
        if (transcript.includes("колір жовтий")) { speedElement.style.color = "yellow"; if(recognition) recognition.stop(); speak("Колір жовтий."); return; }
        if (transcript.includes("колір білий")) { speedElement.style.color = "white"; if(recognition) recognition.stop(); speak("Колір білий."); return; }
        if (transcript.includes("колір синій")) { speedElement.style.color = "#00BFFF"; if(recognition) recognition.stop(); speak("Колір синій."); return; }

        // --- ЗАМІТКИ ТА СЕКУНДОМІР ---
        if (transcript.includes("запиши замітку") || transcript.includes("додай замітку")) {
            isRecordingNote = true; currentNoteText = "";
            let noteStartTime = Date.now();
            if (noteTimerInterval) clearInterval(noteTimerInterval);
            const overlay = document.getElementById('note-overlay'); const timeSpan = document.getElementById('note-time');
            overlay.style.display = 'flex';
            noteTimerInterval = setInterval(() => {
                let elapsedSecs = Math.floor((Date.now() - noteStartTime) / 1000);
                let mins = String(Math.floor(elapsedSecs / 60)).padStart(2, '0');
                let secs = String(elapsedSecs % 60).padStart(2, '0');
                timeSpan.innerText = `${mins}:${secs}`;
            }, 1000);
            if (recognition) recognition.stop(); speak("Слухаю. Коли закінчиш, скажи Кінець."); return;
        }
        if (transcript.includes("прочитай замітки") || transcript.includes("мої замітки")) {
            let notes = localStorage.getItem('dusya_notes'); if (recognition) recognition.stop();
            if (notes) speak("У сейфі є такі записи: " + notes); else speak("Сейф порожній."); return;
        }
        if (transcript.includes("видали всі замітки") || transcript.includes("очистити сейф")) {
            localStorage.removeItem('dusya_notes'); if (recognition) recognition.stop(); speak("Сейф порожній, всі замітки видалено."); return;
        }

        // --- МАШИНА ЧАСУ ---
        if (transcript.includes("машина часу") || transcript.includes("назад у майбутнє")) {
            isTimeMachineActive = true; said88mph = false; document.body.style.backgroundColor = "#000000";
            speedElement.style.fontFamily = "'Courier New', Courier, monospace"; speedElement.style.color = "#00FF00"; speedElement.style.textShadow = "0 0 20px #00FF00";
            if (recognition) recognition.stop(); speak("Конденсатор потоку увімкнено! Готові до стрибка в часі."); return;
        }

        // --- РЕЖИМИ ТА ПОГОДА ---
        if (transcript.includes("режим балабола") || transcript.includes("будь балаболом")) {
            currentMode = "CHATTERBOX"; if (recognition) recognition.stop();
            speak("О, це мій улюблений режим! Вмикаю Балабола. Ну що, розкажи, як настрій сьогодні в дорозі?");
            isWaitingForCommand = true; clearTimeout(waitingTimer); waitingTimer = setTimeout(() => { isWaitingForCommand = false; }, 10000); return;
        }
        if (transcript.includes("погода")) { let city = null; let match = transcript.match(/погода\s+(?:в|у)\s+([а-яєіїґ-]+)/i); if (match) city = match[1]; handleWeatherCommand(city); return; }

        let isAddressed = transcript.includes("дуся") || isWaitingForCommand;

        if (isAddressed) {
            clearTimeout(waitingTimer);
            isWaitingForCommand = false;

            let cleanQuery = transcript;
            if (transcript.includes("дуся")) {
                cleanQuery = transcript.substring(transcript.indexOf("дуся") + 4).trim();
                cleanQuery = cleanQuery.replace(/^[,.!?\s]+/, "").trim();
            }

            if (cleanQuery.length > 0) {
                statusElement.innerText = "Дуся: Думаю...";
                if (recognition) recognition.stop(); 
                
                const aiResponse = await askDusyaAI(cleanQuery);
                dusyaBtn.style.backgroundColor = "#00FF00"; 
                statusElement.innerText = "Дуся: Говорю..."; speak(aiResponse);

                if (currentMode === "CHATTERBOX") {
                    isWaitingForCommand = true; clearTimeout(waitingTimer);
                    waitingTimer = setTimeout(() => { isWaitingForCommand = false; }, 10000);
                }
            } else {
                statusElement.innerText = "Дуся: Слухаю...";
                dusyaBtn.style.backgroundColor = "#00FF00"; 
                isWaitingForCommand = true;
                waitingTimer = setTimeout(() => { isWaitingForCommand = false; }, 10000); 
                if (recognition) recognition.stop(); 
                speak("Слухаю");
            }
        }
    };

    recognition.onend = () => { 
        if (isListening && !isRadarActive && !window.speechSynthesis.speaking && !isRecordingNote && !isWaitingForCleanupConfirm) { 
            try { recognition.start(); } catch(e) {} 
        } 
    };
}

// ==========================================
// 7. КНОПКА ТА GPS ТРЕКІНГ
// ==========================================
dusyaBtn.addEventListener('click', async () => {
    if (!isListening) {
        isListening = true; dusyaBtn.classList.add('active'); dusyaBtn.innerText = "Дуся Активна";
        dusyaBtn.style.backgroundColor = "#00FF00"; 
        statusElement.innerText = "Дуся: Слухаю..."; keepAliveAudio.play().catch(e => {});
        try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
        
        isFirstLocationCheck = true; jamStartTime = 0; isJamZenActive = false;
        if (locationTimer) clearInterval(locationTimer);
        locationTimer = setInterval(checkLocationAndZone, 60000); 
        setTimeout(checkLocationAndZone, 1500);

        let lastCleanup = localStorage.getItem('dusya_last_cleanup');
        let nowTime = Date.now();
        if (!lastCleanup) { localStorage.setItem('dusya_last_cleanup', nowTime); } 
        else if (nowTime - parseInt(lastCleanup) > 30 * 24 * 60 * 60 * 1000) {
            isWaitingForCleanupConfirm = true;
            if (recognition) recognition.stop();
            setTimeout(() => { speak("Минув місяць. Бажаєте очистити сейф заміток та парковку? Скажіть Так або Ні."); }, 1000);
        }

    } else {
        isListening = false; dusyaBtn.classList.remove('active'); dusyaBtn.innerText = "Запустити Дусю";
        dusyaBtn.style.backgroundColor = ""; 
        statusElement.innerText = "Вимкнена"; window.speechSynthesis.cancel(); stopAllSounds();
        if (isRadarActive) { toggleRadar(false); if(aiRadarToggle) aiRadarToggle.checked = false; }
        if (noteTimerInterval) { clearInterval(noteTimerInterval); noteTimerInterval = null; }
        if (recognition) recognition.stop(); keepAliveAudio.pause();
        currentMode = "DEFAULT"; chatHistory = []; isWaitingForCommand = false; isAutoGuideActive = false;
        isTimeMachineActive = false; isRecordingNote = false; isWaitingForCleanupConfirm = false; isBikeMode = false; resetVisuals();
        document.getElementById('note-overlay').style.display = 'none';
        if (locationTimer) { clearInterval(locationTimer); locationTimer = null; }
        if (wakeLock !== null) { wakeLock.release(); wakeLock = null; }
    }
});

if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        function(position) {
            currentLat = position.coords.latitude; currentLon = position.coords.longitude;
            let speedKmh = Math.round(position.coords.speed * 3.6);
            
            if (speedKmh >= 0) { 
                if (isTimeMachineActive && speedKmh > gpsSpeed + 3) { playSciFiAcceleration(); }
                if (isTimeMachineActive && speedKmh >= 90 && !said88mph) {
                    said88mph = true; playPing(); speak("90 кілометрів на годину! Стрибок у часі!");
                }
                speedElement.innerText = speedKmh; 
                gpsSpeed = speedKmh; 
            }

            // Велосипедний ліміт
            if (isBikeMode) {
                if (speedKmh >= 40 && !saidBikeFast) {
                    speak("Не спіши, будь уважний!!! Агов!!"); saidBikeFast = true;
                } else if (speedKmh < 35 && saidBikeFast) {
                    speak("Молодець. Так краще."); saidBikeFast = false;
                }
            } else {
                // Автомобільний ліміт
                if (gpsSpeed <= 7) {
                    if (jamStartTime === 0) jamStartTime = Date.now();
                    else if (Date.now() - jamStartTime > 180000 && !isJamZenActive) { 
                        isJamZenActive = true; currentMode = "CHATTERBOX";
                        speak("Схоже, ми застрягли у заторі. Щоб не нудьгувати, я вмикаю режим балабола.");
                    }
                } else { jamStartTime = 0; isJamZenActive = false; }

                if (speedKmh >= 100 && !said100) { speak("Попереду можуть бути камери, скинь швидкість!"); said100 = true; } 
                else if (speedKmh >= 70 && speedKmh < 100 && !said70) { speak("Тримай швидкість під контролем."); said70 = true; } 
                if (speedKmh < 50) { said70 = false; said100 = false; }
            }
        },
        function(error) { }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
}
