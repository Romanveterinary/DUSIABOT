// ==========================================
// 0. ПАРОЛЬ НА ВХІД (Залишаємо твій рідний)
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
// 1. НАЛАШТУВАННЯ ТА ЗМІННІ СТАНУ (АРХІТЕКТУРА РЕЖИМІВ)
// ==========================================
console.log("Запуск Дусі v3.0: Повний фарш для поїздки у Львів!");

const speedElement = document.getElementById('speed-display');
const statusElement = document.getElementById('status-text');
const dusyaBtn = document.getElementById('dusya-btn');
const keepAliveAudio = document.getElementById('keep-alive-audio');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');

// Системні змінні режимів (State Machine)
let currentMode = "DEFAULT"; // Режими: DEFAULT, TALKATIVE, ENGLISH, GAMES_CITIES
let chatHistory = [];        // Історія діалогу для ігор та розумного діджея
let lastMusicQuery = "";     // Для команди "Ні, щось інше"

let isListening = false;      
let said70 = false;
let said100 = false;
let currentAiRequestTime = 0; 
let wakeLock = null;

// Геолокація та зони (Місто / Траса)
let currentLat = null;
let currentLon = null;
let currentPlaceName = "невідома місцевість";
let isInCityZone = false; 
let isFirstLocationCheck = true;
let locationTimer = null;

// ПЛЕЄР ДЛЯ ПРЯМИХ РАДІОСТАНЦІЙ (УКРАЇНА + ПОРТУГАЛІЯ)
let liveRadioPlayer = new Audio();
const radioStations = {
    // Україна
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
    // Португалія
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
window.addEventListener('online', () => {
    speak("Інтернет відновлено. Я знову на зв'язку!");
});
window.addEventListener('offline', () => {
    speak("Зник інтернет. Тимчасово не зможу відповідати на запитання, але спідометр працює.");
});

// Ініціалізація інтерфейсу
window.addEventListener('DOMContentLoaded', () => {
    try {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) apiKeyInput.value = savedKey; 
    } catch (e) { }

    if (speedElement) {
        speedElement.style.fontSize = "25vh"; 
        speedElement.style.lineHeight = "1.2";
        speedElement.style.fontWeight = "900";
    }
});

settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
saveSettingsBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        saveSettingsBtn.innerText = "✅ Збережено!";
        setTimeout(() => { settingsModal.classList.add('hidden'); saveSettingsBtn.innerText = "Зберегти"; }, 1000);
    }
});

document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e) {}
    }
});

// ==========================================
// 3. СИНТЕЗ МОВЛЕННЯ (ЗАХИСТ ВІД ЗАВИСАННЯ)
// ==========================================
function speak(text) {
    if ('speechSynthesis' in window) {
        // Примусово глушимо мікрофон перед реплікою, щоб не було самовідлуння
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
            if (isListening && !window.speechSynthesis.speaking) {
                try { recognition.start(); statusElement.innerText = "Дуся: Слухаю..."; } catch(e) { }
            }
        };
        utterance.onerror = () => {
            if (isListening) { try { recognition.start(); } catch(e) { } }
        };

        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
// 4. КЕРУВАННЯ МУЛЬТИМЕДІА ТА ЗОВНІШНІМ ЮТУБОМ
// ==========================================
function openYouTubeApp(query) {
    liveRadioPlayer.pause();
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
}

function playLiveRadio(stationName) {
    let streamUrl = "";
    const lowerName = stationName.toLowerCase();
    for (let key in radioStations) {
        if (lowerName.includes(key)) { streamUrl = radioStations[key]; break; }
    }
    if (streamUrl) {
        liveRadioPlayer.src = streamUrl;
        liveRadioPlayer.play().catch(e => {});
        return true;
    }
    return false; 
}

// ==========================================
// 5. РОБОТА З GPS КАРТАМИ ТА ЗОНАМИ (МІСТО/ТРАСА)
// ==========================================
async function checkLocationAndZone() {
    if (!currentLat || !currentLon) return;

    try {
        // Використовуємо безкоштовне геокодування OpenStreetMap (Беремо раз на хвилину)
        let res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${currentLat}&lon=${currentLon}&format=json&accept-language=uk`);
        let data = await res.json();
        
        if (data && data.address) {
            // Визначаємо назву місця (місто, смт або село)
            let place = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.address.suburb;
            let isCurrentlyInCity = (data.address.city || data.address.town || data.address.village) ? true : false;
            
            if (place) currentPlaceName = place;

            // Логіка розумного старту при першому увімкненні кнопки
            if (isFirstLocationCheck) {
                isFirstLocationCheck = false;
                isInCityZone = isCurrentlyInCity;
                if (isInCityZone) {
                    speak(`Привіт! Ми зараз у місті ${currentPlaceName}. Дозволена швидкість 50 кілометрів на годину. Пристебни пасок і будь уважним.`);
                } else {
                    speak(`Вітаю! Ми на трасі, навколо ${currentPlaceName}. Обмеження швидкості 90. Не забудь пристебнутися, поїхали!`);
                }
                return;
            }

            // Логіка зміни зон під час руху на трасі Львів-Хмельницький
            if (isCurrentlyInCity && !isInCityZone) {
                isInCityZone = true;
                speak(`Попереду населений пункт ${currentPlaceName}. Скидаємо швидкість до 50.`);
            } else if (!isCurrentlyInCity && isInCityZone) {
                isInCityZone = false;
                speak(`Населений пункт закінчився. Попереду відкрита траса, можна 90.`);
            }
        }
    } catch(e) { console.log("Помилка моніторингу карт."); }
}

// Погода на завтра
async function handleWeatherCommand(city) {
    statusElement.innerText = "Дуся: Шукаю погоду...";
    if (recognition) recognition.stop();
    let lat = currentLat; let lon = currentLon; let cityName = currentPlaceName;

    if (city) {
        try {
            let geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=uk`);
            let geoData = await geoRes.json();
            if (geoData.results && geoData.results.length > 0) {
                lat = geoData.results[0].latitude; lon = geoData.results[0].longitude;
                cityName = "місті " + geoData.results[0].name;
            } else { speak(`Не змогла знайти місто ${city}.`); return; }
        } catch(e) { speak("Помилка пошуку міста."); return; }
    }

    if (!lat || !lon) { speak("Координати не визначено. Увімкніть GPS."); return; }

    try {
        let wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`);
        let wData = await wRes.json();
        
        if (wData && wData.current && wData.daily) {
            let tempNow = Math.round(wData.current.temperature_2m);
            let code = wData.current.weather_code;
            let tempMinTom = Math.round(wData.daily.temperature_2m_min[1]);
            let tempMaxTom = Math.round(wData.daily.temperature_2m_max[1]);
            
            let desc = "гарна погода";
            if (code === 0) desc = "ясно і сонячно";
            else if (code >= 1 && code <= 3) desc = "мінлива хмарність";
            else if (code === 45 || code === 48) desc = "туманно";
            else if (code >= 61 && code <= 65) desc = "йде дощ";
            else if (code >= 71 && code <= 75) desc = "йде сніг";
            else if (code >= 95) desc = "гроза";

            speak(`Зараз тут ${tempNow} градусів, ${desc}. На завтра прогноз: від ${tempMinTom} до ${tempMaxTom} градусів.`);
        } else { speak("Не вдалося отримати метеодані."); }
    } catch(e) { speak("Проблеми з метеосервером."); }
}

// ==========================================
// 6. МІЗКИ ШІ (ДИНАМІЧНИЙ КОНТЕКСТ ТА РЕЖИМИ)
// ==========================================
async function askDusyaAI(userQuestion) {
    let apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return "Будь ласка, введіть API ключ у налаштуваннях.";
    
    const currentTime = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    
    // Базова інструкція залежно від обраного стану
    let systemInstruction = "";
    
    if (currentMode === "DEFAULT") {
        systemInstruction = `Ти - автомобільний голосовий помічник Дуся. Ти строгий штурман. Час: ${currentTime}. Зараз машина їде біля: ${currentPlaceName}. 
        Твоє головне правило: відповідай дуже коротко, рівно ОДНИМ реченням. Не відволікай водія.
        Якщо просять радіо, почни з [RADIO: назва]. Якщо просять будь-яку музику, жанр (джаз, поп, рок, дитячі пісні) чи настрій (веселе) - працюй як діджей: вибери тему і почни з [WATCH: пошуковий запит для ютуба].`;
    } 
    else if (currentMode === "TALKATIVE") {
        systemInstruction = `Ти - Дуся в режимі розмови. Ти весела, дружня та говірка дівчина-співбесідник. Тобі дозволено говорити розгорнуто, жартувати, розповідати дорожні байки чи короткі анекдоти. Політики уникай. Якщо просять увімкнути музику - використовуй тег [WATCH: запит] або [RADIO: назва].`;
    } 
    else if (currentMode === "ENGLISH") {
        systemInstruction = `Ти - вчителька англійської мови в дорозі. Веди короткий інтерактивний урок у форматі вікторини. Назви ОДНЕ просте слово українською і запитай водія переклад. Коли водій відповідає, похвали його або виправ, а потім дай наступне ОДНЕ слово. Говори дуже лаконічно.`;
    } 
    else if (currentMode === "GAMES_CITIES") {
        systemInstruction = `Ми граємо у гру 'Міста'. Зараз твоя черга. Назви ОДНЕ реальне місто України або світу, яке починається на потрібну літеру, зважаючи на попередні відповіді. Пиши тільки назву міста та коротку репліку, без довгих текстів. Грай чесно, не використовуй неіснуючі назви.`;
    }

    // Формуємо історію повідомлень (контекст) для утримання гри або діджея
    chatHistory.push({ role: "user", parts: [{ text: userQuestion }] });
    if (chatHistory.length > 10) chatHistory.shift(); // Тримаємо останні 10 реплік

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents: chatHistory 
            })
        });
        const data = await response.json();
        let aiText = data.candidates[0].content.parts[0].text;
        
        chatHistory.push({ role: "model", parts: [{ text: aiText }] });
        return aiText;
    } catch (error) { return "Тимчасові проблеми зі зв'язком з космосом."; }
}

// ==========================================
// 7. ГОЛОСОВЕ РОЗПІЗНАВАННЯ ТА ОБРОБКА КОМАНД
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
        if (window.speechSynthesis.speaking) return; 

        const last = event.results.length - 1;
        const transcript = event.results[last][0].transcript.toLowerCase().trim();
        console.log("Дуся почула: ", transcript);

        // === 1. МИТТЄВА РЕАКЦІЯ НА ЖОРСТКІ СТОП-СЛОВА ===
        if (transcript.includes("завершити") || transcript.includes("хватить") || 
            transcript.includes("закрийся") || transcript.includes("не пизди") || transcript.includes("стоп")) {
            
            liveRadioPlayer.pause(); liveRadioPlayer.src = "";
            window.speechSynthesis.cancel(); 
            currentMode = "DEFAULT"; // Скидаємо будь-яку гру чи балакучість до Штурмана
            chatHistory = [];
            playBeep();
            statusElement.innerText = "Дуся: Режим Штурмана";
            if (recognition) { try { recognition.stop(); } catch(e){} }
            speak("Зрозуміла. Мовчу, режим штурмана повернуто.");
            return;
        }

        // Кнопка паніки / Скидання
        if (transcript.includes("дуся слухай")) {
            window.speechSynthesis.cancel(); currentAiRequestTime = Date.now(); playBeep();
            statusElement.innerText = "Дуся: Слухаю (Скинуто)...";
            try { recognition.start(); } catch(e) {} return;
        }

        // === 2. МИТТЄВА ЗМІНА КОЛЬОРІВ ШВИДКОСТІ ===
        if (transcript.includes("колір червоний")) { speedElement.style.color = "red"; if(recognition) recognition.stop(); speak("Зробила червоним."); return; }
        if (transcript.includes("колір зелений")) { speedElement.style.color = "#00FF00"; if(recognition) recognition.stop(); speak("Встановила зелений колір."); return; }
        if (transcript.includes("колір жовтий")) { speedElement.style.color = "yellow"; if(recognition) recognition.stop(); speak("Готово, колір жовтий."); return; }
        if (transcript.includes("колір білий")) { speedElement.style.color = "white"; if(recognition) recognition.stop(); speak("Змінила на білий."); return; }
        if (transcript.includes("колір синій")) { speedElement.style.color = "#00BFFF"; if(recognition) recognition.stop(); speak("Встановила синій."); return; }
        if (transcript.includes("колір коричневий")) { speedElement.style.color = "#8B4513"; if(recognition) recognition.stop(); speak("Зробила коричневим."); return; }

        // === 3. МИТТЄВА ПОГОДА ===
        if (transcript.includes("погода")) {
            let city = null;
            let match = transcript.match(/погода\s+(?:в|у)\s+([а-яєіїґ-]+)/i);
            if (match) city = match[1];
            handleWeatherCommand(city);
            return;
        }

        // === 4. ГОЛОВНА ШПАРГАЛКА ===
        if (transcript.includes("що ти вмієш") || transcript.includes("нагадай команди")) {
            if (recognition) recognition.stop();
            speak("Я вмію показувати швидкість, вмикати українське та португальське радіо, міняти кольори цифр, повідомляти про в'їзд у місто. Також ти можеш сказати: давай поговоримо, давай грати в міста або давай вчити англійську. А щоб зупинити мене, просто скажи: хватить або не пизди.");
            return;
        }

        // === 5. ПЕРЕМИКАННЯ РЕЖИМІВ ХАРАКТЕРУ ТА ІГОР ===
        if (transcript.includes("давай поговоримо") || transcript.includes("поспілкуємось")) {
            currentMode = "TALKATIVE";
            if (recognition) recognition.stop();
            speak("О, з радістю потеревеню з тобою! Вмикаю режим бесіди. Про що поговоримо? Можу розказати свіжий анекдот або історію.");
            return;
        }
        if (transcript.includes("вчити англійську") || transcript.includes("навчання")) {
            currentMode = "ENGLISH";
            if (recognition) recognition.stop();
            speak("Welcome! Вмикаю режим вчительки. Давай потренуємо слова. Як перекладається слово: Дорога?");
            return;
        }
        if (transcript.includes("грати в міста") || transcript.includes("гра міста")) {
            currentMode = "GAMES_CITIES";
            if (recognition) recognition.stop();
            speak("Чудова гра для водія! Починаймо. Називай перше місто.");
            return;
        }

        // === 6. КОМАНДА СКАСУВАННЯ МУЗИКИ ("Ні, щось інше") ===
        if (transcript.includes("ні щось інше") || transcript.includes("давай інше") || transcript.includes("включи інше")) {
            if (lastMusicQuery !== "") {
                if (recognition) recognition.stop();
                speak("Зрозуміла, це вимикаю, шукаю альтернативний варіант.");
                openYouTubeApp(lastMusicQuery + " інший мікс популярне");
                return;
            }
        }

        // === 7. ГОЛОСОВИЙ ГІД ЗА ГЕОЛОКАЦІЄЮ ===
        if (transcript.includes("розкажи про це місце") || transcript.includes("що тут цікавого") || transcript.includes("де ми їдемо")) {
            if (recognition) recognition.stop();
            statusElement.innerText = "Дуся: Згадую історію...";
            let guideResponse = await askDusyaAI(`Розкажи короткий цікавий історичний факт або легенду про населений пункт ${currentPlaceName}, який ми зараз проїжджаємо. Обмеження: максимум 2-3 речення.`);
            speak(guideResponse);
            return;
        }

        // === 8. СТАНДАРТНИЙ ЗАПИТ ДО ДУСІ (ОБРОБКА ТЕГІВ ШІ) ===
        if (transcript === "дуся" || transcript.startsWith("дуся ") || transcript.startsWith("дуся,")) {
            playBeep();
            dusyaBtn.style.backgroundColor = "#FFA500"; 
            const cleanQuery = transcript.replace("дуся", "").trim();
            
            if (cleanQuery.length > 0) {
                statusElement.innerText = "Дуся: Думаю...";
                if (recognition) recognition.stop(); 
                
                const thisRequestTime = Date.now(); currentAiRequestTime = thisRequestTime;
                const aiResponse = await askDusyaAI(cleanQuery);
                if (currentAiRequestTime !== thisRequestTime) return; 
                
                dusyaBtn.style.backgroundColor = "#00FF00"; 

                // Перевірка на тег Радіо
                if (aiResponse.includes("[RADIO:")) {
                    const match = aiResponse.match(/\[RADIO:\s*(.*?)\s*\]/);
                    let cleanText = aiResponse.replace(/\[RADIO:.*?\]/, "").trim();
                    if (match && match[1]) {
                        let success = playLiveRadio(match[1]);
                        if (!success) {
                            cleanText = "Цієї станції немає в базі, але я відкриваю її пошук на Ютубі.";
                            openYouTubeApp(`${match[1]} прямий ефір радіо`);
                        }
                    }
                    statusElement.innerText = "Дуся: Прямий ефір...";
                    speak(cleanText);
                }
                // Перевірка на тег Ютуба (Розумний Діджей під настрій/категорію)
                else if (aiResponse.includes("[WATCH:")) {
                    const match = aiResponse.match(/\[WATCH:\s*(.*?)\s*\]/);
                    let cleanText = aiResponse.replace(/\[WATCH:.*?\]/, "").trim();
                    if (match && match[1]) {
                        lastMusicQuery = match[1]; // Запам'ятовуємо запит для команди "Ні, щось інше"
                        openYouTubeApp(match[1]);
                    }
                    statusElement.innerText = "Дуся: Відкриваю YouTube...";
                    speak(cleanText + ". Перемикаю на додаток Ютуб.");
                } 
                else {
                    statusElement.innerText = "Дуся: Говорю...";
                    speak(aiResponse);
                }
            } else {
                statusElement.innerText = "Дуся: Слухаю...";
                dusyaBtn.style.backgroundColor = "#00FF00"; 
                if (recognition) recognition.stop(); 
                speak("Слухаю");
            }
        }
    };

    recognition.onend = () => {
        if (isListening && !window.speechSynthesis.speaking) {
            try { recognition.start(); } catch(e) {}
        }
    };
}

// ==========================================
// 8. ГОЛОВНА КНОПКА ТА ОНОВЛЕННЯ ТАЙМЕРІВ GPS
// ==========================================
dusyaBtn.addEventListener('click', async () => {
    if (!isListening) {
        isListening = true; dusyaBtn.classList.add('active'); dusyaBtn.innerText = "Дуся Активна";
        statusElement.innerText = "Дуся: Слухаю..."; keepAliveAudio.play().catch(e => {});
        try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
        
        isFirstLocationCheck = true; 
        // Запускаємо щохвилинну фонову перевірку зони міста/траси
        if (locationTimer) clearInterval(locationTimer);
        locationTimer = setInterval(checkLocationAndZone, 60000); 
        
        // Робимо одну миттєву перевірку локації відразу при старті для привітання водія
        setTimeout(checkLocationAndZone, 1500);
    } else {
        isListening = false; dusyaBtn.classList.remove('active'); dusyaBtn.innerText = "Запустити Дусю";
        statusElement.innerText = "Вимкнена"; window.speechSynthesis.cancel();
        if (recognition) recognition.stop(); keepAliveAudio.pause();
        liveRadioPlayer.pause(); liveRadioPlayer.src = "";
        currentMode = "DEFAULT";
        chatHistory = [];
        if (locationTimer) { clearInterval(locationTimer); locationTimer = null; }
        if (wakeLock !== null) { wakeLock.release(); wakeLock = null; }
    }
});

// Безперервний трекінг швидкості по супутниках GPS
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        function(position) {
            currentLat = position.coords.latitude;
            currentLon = position.coords.longitude;
            let speedKmh = Math.round(position.coords.speed * 3.6);
            if (speedKmh >= 0) {
                speedElement.innerText = speedKmh;
            }
            // Попередження про перевищення (базовий захист)
            if (speedKmh >= 100 && !said100) { speak("Куди женеш? Попереду можуть бути камери, скинь швидкість!"); said100 = true; } 
            else if (speedKmh >= 70 && speedKmh < 100 && !said70) { speak("Пригальмуй трохи, тримай швидкість під контролем."); said70 = true; } 
            
            if (speedKmh < 50) { said70 = false; said100 = false; }
        },
        function(error) { console.log("GPS сигнал недоступний."); }, 
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
}
