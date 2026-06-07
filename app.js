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
console.log("Запуск Дусі v4.0: Повний інтелектуальний фарш для траси активовано!");

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

// ТАЙМЕРИ ОЧІКУВАННЯ КОМАНДИ ТА РОЗУМНИХ РЕЖИМІВ
let isWaitingForCommand = false;
let waitingTimer = null;
let isAutoGuideActive = false; // Стан автоматичного екскурсовода
let lastPlaceName = "";        // Для відстеження зміни населених пунктів
let antiSleepTimer = null;     // Таймер для режиму Анти-сон
let antiSleepCounter = 0;      // Лічильник хвилин для нагадування про каву

let currentLat = null;
let currentLon = null;
let currentPlaceName = "невідома місцевість";
let isInCityZone = false; 
let isFirstLocationCheck = true;
let locationTimer = null;
let gpsSpeed = 0;              // Глобальне відстеження швидкості для фільтрів

let liveRadioPlayer = new Audio();
const radioStations = {
    "рокс": "https://online.radioroks.ua/RadioROKS",
    "хіт": "https://online.hitfm.ua/HitFM",
    "люкс": "https://icecast.luxnet.ua/lux",
    "байрактар": "https://online.radiobayraktar.com.ua/RadioBayraktar",
    "ера": "https://icecast.nv.ua/NV", 
    "нв": "https://icecast.nv.ua/NV",
    "промінь": "https://radio.nrcu.gov.ua:8000/promin-mp3",
    "п'ятниця": "https://radio.radiopyatnica.com.ua:8000/radiopyatnica",
    "kiss": "https://online.kissfm.ua/KissFM",
    "мелодія": "https://online.melodiafm.ua/MelodiaFM",
    "комерціал": "https://wms.escuta.com/comercial",
    "comercial": "https://wms.escuta.com/comercial",
    "рфм": "https://streaming-live.rtp.pt/liveradio/rfm/hd/live.m3u8",
    "rfm": "https://streaming-live.rtp.pt/liveradio/rfm/hd/live.m3u8",
    "м80": "https://wms.escuta.com/m80",
    "m80": "https://wms.escuta.com/m80",
    "антена": "https://streaming-live.rtp.pt/liveradio/antena1/hd/live.m3u8",
    "ренасенса": "https://rrstreaming.rr.sapo.pt/rr_hd"
};

// ==========================================
// 2. МОНІТОРИНГ ІНТЕРНЕТУ
// ==========================================
window.addEventListener('online', () => { speak("Інтернет відновлено. Я знову на зв'язку!"); });
window.addEventListener('offline', () => { speak("Зник інтернет. Тимчасово не зможу відповідати на запитання, але спідометр працює."); });

window.addEventListener('DOMContentLoaded', () => {
    try { const savedKey = localStorage.getItem('gemini_api_key'); if (savedKey) apiKeyInput.value = savedKey; } catch (e) { }
    if (speedElement) {
        speedElement.style.fontSize = "25vh"; speedElement.style.lineHeight = "1.2"; speedElement.style.fontWeight = "900";
    }
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

// ==========================================
// 3. ЗВУКОВІ МАЯКИ ТА СИНТЕЗ МОВЛЕННЯ 
// ==========================================
function playPing() { // Сигнал "Дінь" (Почула водія / Відправка)
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

function playChime() { // Сигнал "Блум-блум" (Закінчила відповідь / Відкрила мікрофон)
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

function speak(text) {
    if ('speechSynthesis' in window) {
        if (recognition) { try { recognition.stop(); } catch(e){} }
        window.speechSynthesis.cancel(); 

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'uk-UA';

        const voices = window.speechSynthesis.getVoices();
        let bestVoice = voices.find(v => v.lang.includes('uk'));
        if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('ru') && (v.name.toLowerCase().includes('female') || v.name.includes('Google') || v.name.includes('Milena')));
        if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('ru'));

        if (bestVoice) utterance.voice = bestVoice;

        utterance.onend = () => {
            playChime(); // Граємо сигнал завершення мовлення
            if (isListening && !window.speechSynthesis.speaking) {
                try { recognition.start(); statusElement.innerText = "Дуся: Слухаю..."; } catch(e) { }
            }
        };
        utterance.onerror = () => { if (isListening) { try { recognition.start(); } catch(e) { } } };

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
// 5. GPS КАРТИ ТА ЗОНИ (З ФІЛЬТРОМ ОБ'ЇЗНИХ ДОКІЛ)
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

            // Автоматичний Аудіо-гід (Екскурсовод) при зміні локацій
            if (isAutoGuideActive && place && place !== lastPlaceName) {
                lastPlaceName = place;
                statusElement.innerText = "Дуся: Авто-гід розповідає...";
                let guideResponse = await askDusyaAI(`Ми зараз проїжджаємо або в'їжджаємо в населений пункт ${place}. Розкажи один короткий, але дуже цікавий історичний факт, легенду або про головну пам'ятку цього місця. Обмеження: максимум 2-3 речення. Якщо реальних історичних фактів немає - не вигадуй дурниць.`);
                speak(guideResponse);
                return;
            }

            // ФІЛЬТР ТРАСИ ТА ОБ'ЇЗНИХ ДОРОГ (Якщо летимо > 80 км/год, не вимагаємо скидати до 50)
            if (gpsSpeed > 80) {
                isInCityZone = false; 
                return;
            }

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
// 6. МІЗКИ ШІ (ДИНАМІЧНИЙ КАЛЕНДАР ТА ТАЙМАУТИ)
// ==========================================
async function askDusyaAI(userQuestion) {
    if (!navigator.onLine) return "Немає зв'язку з інтернетом.";

    let apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return "Будь ласка, введіть API ключ у налаштуваннях.";
    
    // ВШИВАЄМО ЖИВИЙ КАЛЕНДАР ТА ГОДИННИК ТЕЛЕФОНУ В ШІ
    const now = new Date();
    const currentDateStr = now.toLocaleDateString('uk-UA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTimeStr = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    
    let systemInstruction = "";
    if (currentMode === "DEFAULT") {
        systemInstruction = `Ти - Дуся, автомобільний помічник. Сьогодні: ${currentDateStr}, час: ${currentTimeStr}. Місце: ${currentPlaceName}. Відповідай коротко, одним реченням. Якщо просять радіо/музику - [RADIO: назва] або [WATCH: запит].`;
    } else if (currentMode === "TALKATIVE") {
        systemInstruction = `Ти - супер-ерудована Дуся, розумний дорожній пасажир. Сьогодні: ${currentDateStr}, час: ${currentTimeStr}. 
        Твої знання безмежні: детальний технічний ремонт авто (причини стуків, поломок), математика, психологія, філософія, кулінарія. 
        На питання з медицини чи ветеринарії відповідай експертно, але ОБОВ'ЯЗКОВО додай дисклеймер: "Я ШІ, тому обов'язково проконсультуйся з лікарем".
        Веди дискусії, висловлюй глибоку думку. СУВОРЕ ПРАВИЛО: Якщо ти не знаєш реальних історичних чи географічних фактів про місцевість — не вигадуй легенд! Так і скажи: 'Це тихе місце, але великих історичних подій тут не зафіксовано'.`;
    } else if (currentMode === "ANTI_SLEEP") {
        systemInstruction = `Ти - Дуся в агресивному режимі Енергетика-Будильника! Твоя мета - врятувати засинаючого водія від аварії на трасі. 
        Говори бадьоро, емоційно, став несподівані, каверзні або провокаційні питання (про стан дороги, куди їдемо, яка погода навколо, чи знає він абсурдні факти). 
        Пропонуй увімкнути жорсткий важкий рок чи треш-метал через YouTube. Залучай водія до постійної бесіди, змушуй його мозок працювати!`;
    } else if (currentMode === "ENGLISH") {
        systemInstruction = `Ти - вчителька англійської. Назви ОДНЕ слово українською, чекай переклад. Хвали або виправляй.`;
    } else if (currentMode === "GAMES_CITIES") {
        systemInstruction = `Ми граємо у 'Міста'. Назви місто на потрібну літеру. Тільки назва та коротка репліку.`;
    }

    if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === "user") { chatHistory.pop(); }
    chatHistory.push({ role: "user", parts: [{ text: userQuestion }] });
    if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

    // Контроль слабкого інтернету через AbortController (7 секунд таймаут)
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
        if (error.name === 'AbortError') return "Інтернет занадто слабкий, не можу завантажити відповідь.";
        return "Тимчасові проблеми зі зв'язком з інтернетом.";
    }
}

// ==========================================
// 7. РОЗПІЗНАВАННЯ ТА ОБРОБКА КОМАНД
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

function playBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = 880; 
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); 
        oscillator.connect(gainNode); gainNode.connect(audioCtx.destination);
        oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.15); 
    } catch (e) {}
}

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'uk-UA'; recognition.continuous = true; recognition.interimResults = false;

    recognition.onresult = async (event) => {
        const last = event.results.length - 1;
        const transcript = event.results[last][0].transcript.toLowerCase().trim();
        console.log("Дуся почула: ", transcript);

        // --- АВАРІЙНИЙ СТОП-КРАН (Пріоритет #1) ---
        if (transcript.includes("стоп") || transcript.includes("завершити") || transcript.includes("хватить") || transcript.includes("закрийся") || transcript.includes("не пизди") || transcript.includes("все нормально")) {
            if (antiSleepTimer) { clearInterval(antiSleepTimer); antiSleepTimer = null; }
            window.speechSynthesis.cancel(); 
            liveRadioPlayer.pause(); 
            currentMode = "DEFAULT"; 
            chatHistory = []; 
            isWaitingForCommand = false;
            playBeep();
            statusElement.innerText = "Дуся: Режим Штурмана";
            if (recognition) { try { recognition.stop(); } catch(e){} }
            speak("Зрозуміла. Мовчу, режим штурмана повернуто.");
            return;
        }

        // ЖИВИЙ ПІНГ (Почула водія - подає сигнал)
        if (transcript.includes("дуся") || isWaitingForCommand) {
            playPing();
        }

        if (window.speechSynthesis.speaking) return; 

        if (transcript.includes("дуся слухай")) {
            window.speechSynthesis.cancel(); playBeep();
            statusElement.innerText = "Дуся: Слухаю...";
            try { recognition.start(); } catch(e) {} return;
        }

        // МИТТЄВІ КОМАНДИ ШВИДКОСТІ ТА ВІДСТАНІ ДО ЛЬВОВА
        if (transcript.includes("яка швидкість") || transcript.includes("яка зараз швидкість") || transcript.includes("швидкість зараз")) {
            if (recognition) recognition.stop();
            speak(`Зараз наша швидкість ${gpsSpeed} кілометрів на годину.`);
            return;
        }

        if (transcript.includes("відстань до львова") || transcript.includes("скільки до львова") || transcript.includes("далеко до львова")) {
            if (recognition) recognition.stop();
            statusElement.innerText = "Дуся: Рахую кілометри...";
            let distanceRes = await askDusyaAI(`Ми зараз знаходимося в локації ${currentPlaceName} (координати: ${currentLat}, ${currentLon}). Обчесли приблизну відстань до міста Львів по трасі. Дай дуже коротку відповідь в один рядок.`);
            speak(distanceRes);
            return;
        }

        // УВІМКНЕННЯ / ВИМКНЕННЯ АВТО-ГІДА
        if (transcript.includes("увімкни авто-гіда") || transcript.includes("увімкни автогіда")) {
            isAutoGuideActive = true; lastPlaceName = currentPlaceName;
            if (recognition) recognition.stop();
            speak("Автоматичний аудіо-гід увімкнено. Я буду сама розповідати про цікаві місця вздовж дороги.");
            return;
        }
        if (transcript.includes("вимкни авто-гіда") || transcript.includes("вимкни автогіда")) {
            isAutoGuideActive = false;
            if (recognition) recognition.stop();
            speak("Автоматичний аудіо-гід вимкнено.");
            return;
        }

        // АКТИВАЦІЯ РЕЖИМУ АНТИ-СОН (Штурман-Енергетик)
        if (transcript.includes("я хочу спати") || transcript.includes("я сонний") || transcript.includes("хочу спати") || transcript.includes("засинаю")) {
            currentMode = "ANTI_SLEEP"; antiSleepCounter = 0;
            if (antiSleepTimer) clearInterval(antiSleepTimer);
            if (recognition) recognition.stop();
            speak("Увага! Водій засинає! Вмикаю режим анти-сон. Я буду діставати тебе запитаннями кожні дві хвилини і не дам закрити очі!");
            
            antiSleepTimer = setInterval(async () => {
                if (!isListening || currentMode !== "ANTI_SLEEP") { clearInterval(antiSleepTimer); return; }
                antiSleepCounter += 2;
                
                let sleepPrompt = "Згенеруй одну бадьору, інтерактивну, каверзну репліку для засинаючого водія, запитай його про щось або запропонуй рок. ";
                if (antiSleepCounter % 10 === 0) {
                    sleepPrompt += "Обов'язково суворо та серйозно нагадай йому, що безпека головне, і пора з'їхати на заправку випити кави. ";
                }
                
                statusElement.innerText = "Дуся: Штрикаю водія...";
                let sleepResponse = await askDusyaAI(sleepPrompt);
                speak(sleepResponse);
                
                // Примусово відкриваємо вікно мікрофона на 10 секунд після того, як вона запитала водія
                setTimeout(() => {
                    if (currentMode === "ANTI_SLEEP" && isListening) {
                        isWaitingForCommand = true;
                        clearTimeout(waitingTimer);
                        waitingTimer = setTimeout(() => { isWaitingForCommand = false; }, 10000);
                    }
                }, 4000);

            }, 120000); // Кожні 2 хвилини
            return;
        }

        // 2. МИТТЄВІ КОМАНДИ КОЛЬОРУ
        if (transcript.includes("колір червоний")) { speedElement.style.color = "red"; if(recognition) recognition.stop(); speak("Зробила червоним."); return; }
        if (transcript.includes("колір зелений")) { speedElement.style.color = "#00FF00"; if(recognition) recognition.stop(); speak("Встановила зелений колір."); return; }
        if (transcript.includes("колір жовтий")) { speedElement.style.color = "yellow"; if(recognition) recognition.stop(); speak("Готово, колір жовтий."); return; }
        if (transcript.includes("колір білий")) { speedElement.style.color = "white"; if(recognition) recognition.stop(); speak("Змінила на білий."); return; }
        if (transcript.includes("колір синій")) { speedElement.style.color = "#00BFFF"; if(recognition) recognition.stop(); speak("Встановила синій."); return; }
        if (transcript.includes("колір коричневий")) { speedElement.style.color = "#8B4513"; if(recognition) recognition.stop(); speak("Зробила коричневим."); return; }

        if (transcript.includes("погода")) {
            let city = null; let match = transcript.match(/погода\s+(?:в|у)\s+([а-яєіїґ-]+)/i);
            if (match) city = match[1]; handleWeatherCommand(city); return;
        }

        if (transcript.includes("що ти вмієш") || transcript.includes("нагадай команди")) {
            if (recognition) recognition.stop();
            speak("Я показую швидкість, маю автоматичний авто-гід, режим Ерудита, анти-сон, міняю кольори, вмикаю радіо та знаю відстань до Львова. Зупинити мене - скажи стоп.");
            return;
        }

        if (transcript.includes("давай поговоримо") || transcript.includes("поспілкуємось")) { currentMode = "TALKATIVE"; if (recognition) recognition.stop(); speak("Вмикаю режим Ерудита. Про що хочеш поговорити?"); return; }
        if (transcript.includes("вчити англійську") || transcript.includes("навчання")) { currentMode = "ENGLISH"; if (recognition) recognition.stop(); speak("Вчитель англійської активований. Як перекладається слово: Дорога?"); return; }
        if (transcript.includes("грати в міста") || transcript.includes("гра міста")) { currentMode = "GAMES_CITIES"; if (recognition) recognition.stop(); speak("Починаймо. Називай перше місто."); return; }

        if (transcript.includes("ні щось інше") || transcript.includes("давай інше") || transcript.includes("включи інше")) {
            if (lastMusicQuery !== "") { if (recognition) recognition.stop(); speak("Шукаю альтернативу."); openYouTubeApp(lastMusicQuery + " інший мікс популярне"); return; }
        }

        if (transcript.includes("розкажи про це місце") || transcript.includes("що тут цікавого")) {
            if (recognition) recognition.stop(); statusElement.innerText = "Дуся: Згадую історію...";
            let guideResponse = await askDusyaAI(`Розкажи цікавий історичний факт про населений пункт ${currentPlaceName}. Максимум 3 речення.`);
            speak(guideResponse); return;
        }

        // =========================================================
        // ГОЛОВНИЙ БЛОК ШІ (З ТАЙМЕРОМ ДЛЯ ДВОКРОКОВОГО ДІАЛОГУ)
        // =========================================================
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
        
        isFirstLocationCheck = true; 
        if (locationTimer) clearInterval(locationTimer);
        locationTimer = setInterval(checkLocationAndZone, 60000); 
        setTimeout(checkLocationAndZone, 1500);
    } else {
        isListening = false; dusyaBtn.classList.remove('active'); dusyaBtn.innerText = "Запустити Дусю";
        statusElement.innerText = "Вимкнена"; window.speechSynthesis.cancel();
        if (antiSleepTimer) { clearInterval(antiSleepTimer); antiSleepTimer = null; }
        if (recognition) recognition.stop(); keepAliveAudio.pause();
        liveRadioPlayer.pause(); liveRadioPlayer.src = "";
        currentMode = "DEFAULT"; chatHistory = []; isWaitingForCommand = false; isAutoGuideActive = false;
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
                speedElement.innerText = speedKmh; 
                gpsSpeed = speedKmh; // Синхронізуємо у глобальну змінну для команд та фільтрів
            }
            if (speedKmh >= 100 && !said100) { speak("Попереду можуть бути камери, скинь швидкість!"); said100 = true; } 
            else if (speedKmh >= 70 && speedKmh < 100 && !said70) { speak("Тримай швидкість під контролем."); said70 = true; } 
            if (speedKmh < 50) { said70 = false; said100 = false; }
        },
        function(error) { }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
}
