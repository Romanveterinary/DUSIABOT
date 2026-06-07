// ==========================================
// 0. ПАРОЛЬ НА ВХІД
// ==========================================
(function() {
    const isAuth = localStorage.getItem('dusya_auth');
    if (isAuth !== '2811') {
        let pass = prompt("Введіть пароль для доступу до Дусі:");
        if (pass === "2811") {
            localStorage.setItem('dusya_auth', '2811');
        } else {
            document.body.innerHTML = "<h2 style='color:red; text-align:center; padding-top:20vh; font-family:sans-serif;'>Доступ заборонено. Оновіть сторінку.</h2>";
            throw new Error("Зупинка скрипта: невірний пароль.");
        }
    }
})();

window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

// ==========================================
// 1. НАЛАШТУВАННЯ ТА ЗМІННІ СТАНУ 
// ==========================================
console.log("Запуск Дусі v5.2: Стабільна версія, замітки з живим таймером та вільний вибір міст!");

const speedElement = document.getElementById('speed-display');
const statusElement = document.getElementById('status-text');
const dusyaBtn = document.getElementById('dusya-btn');
const keepAliveAudio = document.getElementById('keep-alive-audio');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');

let currentMode = "DEFAULT"; 
let chatHistory = [];        
let lastMusicQuery = "";     

let isListening = false;      
let said70 = false;
let said100 = false;
let currentAiRequestTime = 0; 
let wakeLock = null;

// ТАЙМЕРИ ОЧІКУВАННЯ ТА РОЗУМНИХ РЕЖИМІВ
let isWaitingForCommand = false;
let waitingTimer = null;
let isAutoGuideActive = false; 
let lastPlaceName = "";        
let antiSleepTimer = null;     
let antiSleepCounter = 0;      

// ЗМІННІ ДЛЯ СЕЙФІВ ТА СПЕЦРЕЖИМІВ
let isRecordingNote = false;   
let currentNoteText = "";      
let noteTimerInterval = null;  // Інтервал для живого секундоміра
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

let liveRadioPlayer = new Audio();
const radioStations = {
    "рокс": "https://online.radioroks.ua/RadioROKS", "хіт": "https://online.hitfm.ua/HitFM",
    "люкс": "https://icecast.luxnet.ua/lux", "байрактар": "https://online.radiobayraktar.com.ua/RadioBayraktar",
    "ера": "https://icecast.nv.ua/NV", "нв": "https://icecast.nv.ua/NV",
    "промінь": "https://radio.nrcu.gov.ua:8000/promin-mp3", "п'ятниця": "https://radio.radiopyatnica.com.ua:8000/radiopyatnica",
    "kiss": "https://online.kissfm.ua/KissFM", "мелодія": "https://online.melodiafm.ua/MelodiaFM",
    "комерціал": "https://wms.escuta.com/comercial", "comercial": "https://wms.escuta.com/comercial",
    "рфм": "https://streaming-live.rtp.pt/liveradio/rfm/hd/live.m3u8", "rfm": "https://streaming-live.rtp.pt/liveradio/rfm/hd/live.m3u8",
    "м80": "https://wms.escuta.com/m80", "m80": "https://wms.escuta.com/m80",
    "антена": "https://streaming-live.rtp.pt/liveradio/antena1/hd/live.m3u8", "ренасенса": "https://rrstreaming.rr.sapo.pt/rr_hd"
};

// ==========================================
// 2. МОНІТОРИНГ ІНТЕРНЕТУ ТА ІНТЕРФЕЙСУ
// ==========================================
window.addEventListener('online', () => { speak("Інтернет відновлено. Я знову на зв'язку!"); });
window.addEventListener('offline', () => { speak("Зник інтернет. Тимчасово не зможу відповідати на запитання, але спідометр працює."); });

window.addEventListener('DOMContentLoaded', () => {
    try { const savedKey = localStorage.getItem('gemini_api_key'); if (savedKey) apiKeyInput.value = savedKey; } catch (e) { }
    if (speedElement) { speedElement.style.fontSize = "25vh"; speedElement.style.lineHeight = "1.2"; speedElement.style.fontWeight = "900"; }
});

settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
saveSettingsBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('gemini_api_key', key); saveSettingsBtn.innerText = "✅ Збережено!";
        setTimeout(() => { settingsModal.classList.add('hidden'); saveSettingsBtn.innerText = "Зберегти"; }, 1000);
    }
});

document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') { try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e) {} }
});

function resetVisuals() {
    document.body.style.backgroundColor = "";
    speedElement.style.color = "white";
    speedElement.style.fontFamily = "";
    speedElement.style.textShadow = "none";
}

// ==========================================
// 3. ЗВУКОВІ МАЯКИ ТА СИНТЕЗ МОВЛЕННЯ 
// ==========================================
function playPing() { 
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(1200, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.15);
    } catch(e){}
}

function playChime() { 
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const gain = ctx.createGain(); gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.connect(ctx.destination);
        const osc1 = ctx.createOscillator(); osc1.frequency.setValueAtTime(520, ctx.currentTime);
        osc1.connect(gain); osc1.start(); osc1.stop(ctx.currentTime + 0.08);
        const osc2 = ctx.createOscillator(); osc2.frequency.setValueAtTime(420, ctx.currentTime + 0.08);
        osc2.connect(gain); osc2.start(ctx.currentTime + 0.08); osc2.stop(ctx.currentTime + 0.22);
    } catch(e){}
}

function playSciFiAcceleration() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 1.2);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 1.2);
    } catch(e) {}
}

function speak(text) {
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
            if (isListening && !window.speechSynthesis.speaking && !isRecordingNote) {
                try { recognition.start(); statusElement.innerText = "Дуся: Слухаю..."; } catch(e) { }
            }
        };
        utterance.onerror = () => { if (isListening && !isRecordingNote) { try { recognition.start(); } catch(e) { } } };
        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
// 4. МУЛЬТИМЕДІА
// ==========================================
function openYouTubeApp(query) {
    liveRadioPlayer.pause();
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
}

function playLiveRadio(stationName) {
    let streamUrl = ""; const lowerName = stationName.toLowerCase();
    for (let key in radioStations) { if (lowerName.includes(key)) { streamUrl = radioStations[key]; break; } }
    if (streamUrl) { liveRadioPlayer.src = streamUrl; liveRadioPlayer.play().catch(e => {}); return true; }
    return false; 
}

// ==========================================
// 5. GPS КАРТИ, ПОГОДА ТА ЗОНИ 
// ==========================================
async function checkLocationAndZone() {
    if (!currentLat || !currentLon) return;
    try {
        let res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${currentLat}&lon=${currentLon}&format=json&accept-language=uk`);
        let data = await res.json();
        
        if (data && data.address) {
            let place = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.address.suburb;
            let isCurrentlyInCity = (data.address.city || data.address.town || data.address.village) ? true : false;
            if (place) currentPlaceName = place;

            if (isFirstLocationCheck) {
                isFirstLocationCheck = false; isInCityZone = isCurrentlyInCity;
                if (isInCityZone) { speak(`Привіт! Ми зараз у місті ${currentPlaceName}. Дозволена швидкість 50 кілометрів на годину. Пристебни пасок і будь уважним.`); } 
                else { speak(`Вітаю! Ми на трасі, навколо ${currentPlaceName}. Обмеження швидкості 90. Не забудь пристебнутися, поїхали!`); }
                return;
            }

            if (isAutoGuideActive && place && place !== lastPlaceName) {
                lastPlaceName = place;
                statusElement.innerText = "Дуся: Авто-гід розповідає...";
                let guideResponse = await askDusyaAI(`Ми зараз проїжджаємо або в'їжджаємо в населений пункт ${place}. Розкажи один короткий, але дуже цікавий історичний факт. Обмеження: максимум 2-3 речення. Якщо реальних фактів немає - не вигадуй.`);
                speak(guideResponse);
                return;
            }

            if (gpsSpeed > 80) { isInCityZone = false; return; }
            if (isCurrentlyInCity && !isInCityZone) { isInCityZone = true; speak(`Попереду населений пункт ${currentPlaceName}. Скидаємо швидкість до 50.`); } 
            else if (!isCurrentlyInCity && isInCityZone) { isInCityZone = false; speak(`Населений пункт закінчився. Попереду відкрита траса, можна 90.`); }
        }
    } catch(e) { }
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
// 6. МІЗКИ ШІ
// ==========================================
async function askDusyaAI(userQuestion) {
    if (!navigator.onLine) return "Немає зв'язку з інтернетом.";
    let apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return "Будь ласка, введіть API ключ у налаштуваннях.";
    
    const now = new Date();
    const currentDateStr = now.toLocaleDateString('uk-UA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTimeStr = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    
    let systemInstruction = "";
    if (currentMode === "DEFAULT") {
        systemInstruction = `Ти - Дуся, авто-штурман. Сьогодні: ${currentDateStr}, час: ${currentTimeStr}. Місце: ${currentPlaceName}. Відповідай коротко.`;
    } else if (currentMode === "TALKATIVE") {
        systemInstruction = `Ти - супер-ерудована Дуся. Сьогодні: ${currentDateStr}, час: ${currentTimeStr}. Знаєш: авто, математику, філософію. На питання з медицини - додай дисклеймер ШІ.`;
    } else if (currentMode === "CHATTERBOX") {
        systemInstruction = `Ти - Дуся в режимі "Балабол". Твоя мета - розважати водія (ідеально для заторів). Розказуй цікаві байки, веселі історії з життя, жартуй. 
        ГОЛОВНЕ ПРАВИЛО: В кінці кожної своєї репліки ти ОБОВ'ЯЗКОВО ставиш водію питання, щоб продовжити бесіду.`;
    } else if (currentMode === "ANTI_SLEEP") {
        systemInstruction = `Ти - Дуся в режимі Будильника! Рятуй водія від сну. Говори бадьоро, став каверзні питання про дорогу. Пропонуй важкий рок. Залучай до бесіди!`;
    } else if (currentMode === "ENGLISH") {
        systemInstruction = `Ти - вчителька англійської. Назви ОДНЕ слово українською, чекай переклад.`;
    } else if (currentMode === "GAMES_CITIES") {
        systemInstruction = `Ми граємо у 'Міста'. Назви місто на потрібну літеру.`;
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
        if (error.name === 'AbortError') return "Інтернет занадто слабкий.";
        return "Тимчасові проблеми зі зв'язком з інтернетом.";
    }
}

// ==========================================
// 7. РОЗПІЗНАВАННЯ ТА ОБРОБКА КОМАНД
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

        // --- 1. АВАРІЙНИЙ СТОП-КРАН ТА ОЧИЩЕННЯ ТАЙМЕРІВ ---
        if (transcript.includes("стоп") || transcript.includes("завершити") || transcript.includes("хватить") || transcript.includes("закрийся") || transcript.includes("не пизди") || transcript.includes("все нормально")) {
            if (antiSleepTimer) { clearInterval(antiSleepTimer); antiSleepTimer = null; }
            if (noteTimerInterval) { clearInterval(noteTimerInterval); noteTimerInterval = null; }
            window.speechSynthesis.cancel(); 
            liveRadioPlayer.pause(); 
            currentMode = "DEFAULT"; chatHistory = []; 
            isWaitingForCommand = false; isRecordingNote = false; isTimeMachineActive = false;
            resetVisuals(); 
            playPing(); statusElement.innerText = "Дуся: Режим Штурмана";
            if (recognition) { try { recognition.stop(); } catch(e){} }
            speak("Зрозуміла. Мовчу, режим штурмана повернуто.");
            return;
        }

        // --- 2. ПЕРЕХОПЛЕННЯ НЕОБМЕЖЕНИХ ЗАМІТОК СЕЙФА ---
        if (isRecordingNote) {
            if (transcript.includes("зберегти замітку") || transcript.includes("зберегти")) {
                isRecordingNote = false;
                if (noteTimerInterval) { clearInterval(noteTimerInterval); noteTimerInterval = null; }
                let existingNotes = localStorage.getItem('dusya_notes') || "";
                if (currentNoteText.trim() !== "") {
                    localStorage.setItem('dusya_notes', existingNotes + (existingNotes ? " | " : "") + currentNoteText.trim());
                    speak("Замітку надійно збережено у сейф.");
                } else { speak("Запис порожній."); }
                statusElement.innerText = "Дуся: Слухаю...";
                if (recognition) { try { recognition.stop(); } catch(e){} }
            } else {
                currentNoteText += " " + transcript;
            }
            return; 
        }

        if (transcript.includes("дуся") || isWaitingForCommand) { playPing(); }
        if (window.speechSynthesis.speaking) return; 

        // --- ЛОКАЛЬНІ МИТТЄВІ КОМАНДИ ЧАСУ ТА ДАТИ (БЕЗ ІНТЕРНЕТУ) ---
        if (transcript.includes("котра година") || transcript.includes("який зараз час") || transcript.includes("який час")) {
            if (recognition) recognition.stop();
            let localT = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
            speak(`Зараз ${localT}.`); return;
        }
        if (transcript.includes("яке сьогодні число") || transcript.includes("який сьогодні день") || transcript.includes("яка дата")) {
            if (recognition) recognition.stop();
            let localD = new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
            speak(`Сьогодні ${localD}.`); return;
        }

        // --- ЖИВА ПЕРЕВІРКА ЯКОСТІ ІНТЕРНЕТУ (ПІНГ-ТЕСТ) ---
        if (transcript.includes("як зв'язок") || transcript.includes("який інтернет") || transcript.includes("перевір інтернет")) {
            if (recognition) recognition.stop();
            statusElement.innerText = "Дуся: Перевіряю лінію...";
            if (!navigator.onLine) {
                speak("Мережа відсутня, ми в глухій зоні.");
            } else {
                const startTime = Date.now();
                try {
                    await fetch("https://api.open-meteo.com/v1/forecast?latitude=50&longitude=30&current=temperature_2m", { mode: 'no-cors' });
                    const duration = Date.now() - startTime;
                    if (duration < 600) speak("Зв'язок відмінний, інтернет літає.");
                    else speak("Зв'язок слабкий, можливі затримки у відповідях.");
                } catch (e) { speak("Зв'язок нестабільний."); }
            }
            return;
        }

        // --- ПРЯМА КАНАЛІЗАЦІЯ НА YOUTUBE БЕЗ ШІ ---
        if (transcript.includes("знайди в ютубі") || transcript.includes("включи в ютубі") || transcript.includes("пошук в ютубі")) {
            let ytQuery = transcript.replace(/(?:знайди в ютубі|включи в ютубі|пошук в ютубі)/gi, "").trim();
            if (recognition) recognition.stop();
            speak(`Шукаю ${ytQuery} на Ютубі.`);
            openYouTubeApp(ytQuery); return;
        }

        // --- СЕЙФ ЗАМІТОК З ЖИВИМ СЕКУНДОМІРОМ ---
        if (transcript.includes("запиши замітку") || transcript.includes("додай замітку")) {
            isRecordingNote = true; currentNoteText = "";
            let noteStartTime = Date.now();
            if (noteTimerInterval) clearInterval(noteTimerInterval);
            
            // Запуск живого секундоміра на екрані
            noteTimerInterval = setInterval(() => {
                let elapsedSecs = Math.floor((Date.now() - noteStartTime) / 1000);
                let mins = String(Math.floor(elapsedSecs / 60)).padStart(2, '0');
                let secs = String(elapsedSecs % 60).padStart(2, '0');
                statusElement.innerText = `Дуся: 🔴 Запис [${mins}:${secs}]... Скажіть 'Зберегти'`;
            }, 1000);

            if (recognition) recognition.stop();
            speak("Слухаю. Коли закінчиш, скажи слово Зберегти.");
            return;
        }
        if (transcript.includes("прочитай замітки") || transcript.includes("що я наговорив") || transcript.includes("мої замітки")) {
            let notes = localStorage.getItem('dusya_notes');
            if (recognition) recognition.stop();
            if (notes) speak("У сейфі є такі записи: " + notes); else speak("Сейф порожній, заміток немає.");
            return;
        }
        if (transcript.includes("видали всі замітки") || transcript.includes("зітри всі замітки") || transcript.includes("очистити сейф заміток")) {
            localStorage.removeItem('dusya_notes');
            if (recognition) recognition.stop(); speak("Сейф порожній, всі замітки видалено."); return;
        }

        // --- ДИНАМІЧНИЙ ПРОРАХУНОК ВІДСТАНІ ДО БУДЬ-ЯКОГО МІСТА ---
        let distanceMatch = transcript.match(/(?:відстань до|скільки до|далеко до)\s+([а-яєіїґ-]+)/i);
        if (distanceMatch) {
            let targetCity = distanceMatch[1];
            if (recognition) recognition.stop();
            statusElement.innerText = `Дуся: Рахую до міста ${targetCity}...`;
            let distanceRes = await askDusyaAI(`Ми зараз в локації ${currentPlaceName} (координати: ${currentLat}, ${currentLon}). Обчесли приблизну відстань до міста ${targetCity} по трасах. Дай дуже коротку відповідь в один рядок.`);
            speak(distanceRes); return;
        }

        // --- ПАРКУВАЛЬНА ПАМ'ЯТЬ ---
        if (transcript.includes("запам'ятай парковку") || transcript.includes("запам'ятай машину")) {
            if (currentLat && currentLon) {
                localStorage.setItem('dusya_parking', JSON.stringify({lat: currentLat, lon: currentLon}));
                if (recognition) recognition.stop(); speak("Координати парковки надійно збережено у сейф.");
            } else { if (recognition) recognition.stop(); speak("Немає сигналу GPS."); }
            return;
        }
        if (transcript.includes("де моя машина") || transcript.includes("де я припаркувався") || transcript.includes("знайди машину")) {
            let parkingData = localStorage.getItem('dusya_parking');
            if (recognition) recognition.stop();
            if (parkingData) {
                let p = JSON.parse(parkingData);
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking`, '_blank');
                speak("Відкриваю пішохідний маршрут до вашого авто на картах.");
            } else { speak("Я не пам'ятаю, де ви припаркувалися."); }
            return;
        }

        // --- ВІЗУАЛЬНІ РЕЖИМИ ТА МАШИНА ЧАСУ ---
        if (transcript.includes("нічний режим")) {
            document.body.style.backgroundColor = "#000000"; speedElement.style.color = "#8B0000"; speedElement.style.textShadow = "none";
            if (recognition) recognition.stop(); speak("Нічний екран увімкнено."); return;
        }
        if (transcript.includes("денний режим")) {
            resetVisuals(); if (recognition) recognition.stop(); speak("Денний екран увімкнено."); return;
        }
        if (transcript.includes("машина часу") || transcript.includes("назад у майбутнє")) {
            isTimeMachineActive = true; said88mph = false;
            document.body.style.backgroundColor = "#000000";
            speedElement.style.fontFamily = "'Courier New', Courier, monospace";
            speedElement.style.color = "#00FF00";
            speedElement.style.textShadow = "0 0 20px #00FF00";
            if (recognition) recognition.stop(); speak("Конденсатор потоку увімкнено! Готові до стрибка в часі."); return;
        }

        if (transcript.includes("яка швидкість") || transcript.includes("швидкість зараз")) {
            if (recognition) recognition.stop(); speak(`Зараз наша швидкість ${gpsSpeed} кілометрів на годину.`); return;
        }

        if (transcript.includes("увімкни авто-гіда") || transcript.includes("увімкни автогіда")) {
            isAutoGuideActive = true; lastPlaceName = currentPlaceName;
            if (recognition) recognition.stop(); speak("Автоматичний аудіо-гід увімкнено."); return;
        }
        if (transcript.includes("вимкни авто-гіда") || transcript.includes("вимкни автогіда")) {
            isAutoGuideActive = false; if (recognition) recognition.stop(); speak("Автоматичний аудіо-гід вимкнено."); return;
        }

        if (transcript.includes("режим балабола") || transcript.includes("режим балабол") || transcript.includes("будь балаболом")) {
            currentMode = "CHATTERBOX";
            if (recognition) recognition.stop();
            speak("О, це мій улюблений режим! Вмикаю Балабола. Ну що, розкажи, як настрій сьогодні в дорозі?");
            isWaitingForCommand = true; clearTimeout(waitingTimer);
            waitingTimer = setTimeout(() => { isWaitingForCommand = false; }, 10000); return;
        }

        if (transcript.includes("я хочу спати") || transcript.includes("я сонний") || transcript.includes("засинаю")) {
            currentMode = "ANTI_SLEEP"; antiSleepCounter = 0;
            if (antiSleepTimer) clearInterval(antiSleepTimer);
            if (recognition) recognition.stop();
            speak("Увага! Вмикаю режим анти-сон. Буду діставати тебе запитаннями кожні дві хвилини!");
            
            antiSleepTimer = setInterval(async () => {
                if (!isListening || currentMode !== "ANTI_SLEEP") { clearInterval(antiSleepTimer); return; }
                antiSleepCounter += 2;
                let sleepPrompt = "Згенеруй одну бадьору репліку для засинаючого водія, запитай його про щось або запропонуй рок. ";
                if (antiSleepCounter % 10 === 0) sleepPrompt += "Нагадай йому з'їхати на заправку випити кави. ";
                
                statusElement.innerText = "Дуся: Штрикаю водія...";
                let sleepResponse = await askDusyaAI(sleepPrompt);
                speak(sleepResponse);
                
                setTimeout(() => {
                    if (currentMode === "ANTI_SLEEP" && isListening) {
                        isWaitingForCommand = true; clearTimeout(waitingTimer);
                        waitingTimer = setTimeout(() => { isWaitingForCommand = false; }, 10000);
                    }
                }, 4000);
            }, 120000); return;
        }

        if (transcript.includes("погода")) {
            let city = null; let match = transcript.match(/погода\s+(?:в|у)\s+([а-яєіїґ-]+)/i);
            if (match) city = match[1]; handleWeatherCommand(city); return;
        }

        if (transcript.includes("давай поговоримо") || transcript.includes("поспілкуємось")) { currentMode = "TALKATIVE"; if (recognition) recognition.stop(); speak("Вмикаю режим Ерудита. Про що хочеш поговорити?"); return; }

        let isAddressed = transcript.includes("дуся") || isWaitingForCommand;

        if (isAddressed) {
            dusyaBtn.style.backgroundColor = "#FFA500"; 
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

                if (aiResponse.includes("[RADIO:")) {
                    const match = aiResponse.match(/\[RADIO:\s*(.*?)\s*\]/);
                    let cleanText = aiResponse.replace(/\[RADIO:.*?\]/, "").trim();
                    if (match && match[1]) {
                        let success = playLiveRadio(match[1]);
                        if (!success) { cleanText = "Відкриваю на Ютубі."; openYouTubeApp(`${match[1]} прямий ефір радіо`); }
                    }
                    statusElement.innerText = "Дуся: Прямий ефір..."; speak(cleanText);
                }
                else if (aiResponse.includes("[WATCH:")) {
                    const match = aiResponse.match(/\[WATCH:\s*(.*?)\s*\]/);
                    let cleanText = aiResponse.replace(/\[WATCH:.*?\]/, "").trim();
                    if (match && match[1]) { lastMusicQuery = match[1]; openYouTubeApp(match[1]); }
                    statusElement.innerText = "Дуся: Відкриваю YouTube..."; speak(cleanText);
                } 
                else {
                    statusElement.innerText = "Дуся: Говорю..."; speak(aiResponse);
                    if (currentMode === "CHATTERBOX" || currentMode === "ANTI_SLEEP") {
                        isWaitingForCommand = true; clearTimeout(waitingTimer);
                        waitingTimer = setTimeout(() => { isWaitingForCommand = false; }, 10000);
                    }
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

    recognition.onend = () => { if (isListening && !window.speechSynthesis.speaking) { try { recognition.start(); } catch(e) {} } };
}

// ==========================================
// 8. КНОПКА ТА GPS ТРЕКІНГ
// ==========================================
dusyaBtn.addEventListener('click', async () => {
    if (!isListening) {
        isListening = true; dusyaBtn.classList.add('active'); dusyaBtn.innerText = "Дуся Активна";
        statusElement.innerText = "Дуся: Слухаю..."; keepAliveAudio.play().catch(e => {});
        try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
        
        isFirstLocationCheck = true; jamStartTime = 0; isJamZenActive = false;
        if (locationTimer) clearInterval(locationTimer);
        locationTimer = setInterval(checkLocationAndZone, 60000); 
        setTimeout(checkLocationAndZone, 1500);
    } else {
        isListening = false; dusyaBtn.classList.remove('active'); dusyaBtn.innerText = "Запустити Дусю";
        statusElement.innerText = "Вимкнена"; window.speechSynthesis.cancel();
        if (antiSleepTimer) { clearInterval(antiSleepTimer); antiSleepTimer = null; }
        if (noteTimerInterval) { clearInterval(noteTimerInterval); noteTimerInterval = null; }
        if (recognition) recognition.stop(); keepAliveAudio.pause();
        liveRadioPlayer.pause(); liveRadioPlayer.src = "";
        currentMode = "DEFAULT"; chatHistory = []; isWaitingForCommand = false; isAutoGuideActive = false;
        isTimeMachineActive = false; isRecordingNote = false; resetVisuals();
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
                if (isTimeMachineActive && speedKmh >= 141 && !said88mph) {
                    said88mph = true; playPing(); speak("88 миль на годину! Стрибок у часі!");
                }
                speedElement.innerText = speedKmh; 
                gpsSpeed = speedKmh; 
            }

            // МІСЬКИЙ ЗАТОР (Traffic Jam Zen)
            if (gpsSpeed <= 7) {
                if (jamStartTime === 0) jamStartTime = Date.now();
                else if (Date.now() - jamStartTime > 180000 && !isJamZenActive) { 
                    isJamZenActive = true; currentMode = "CHATTERBOX";
                    speak("Схоже, ми застрягли у заторі. Щоб не нудьгувати, я вмикаю режим балабола. Розкажи, як настрій?");
                }
            } else { jamStartTime = 0; isJamZenActive = false; }

            if (speedKmh >= 100 && !said100) { speak("Попереду можуть быть камери, скинь швидкість!"); said100 = true; } 
            else if (speedKmh >= 70 && speedKmh < 100 && !said70) { speak("Тримай швидкість під контролем."); said70 = true; } 
            if (speedKmh < 50) { said70 = false; said100 = false; }
        },
        function(error) { }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
}
