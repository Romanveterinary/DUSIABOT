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
            document.body.innerHTML = "<h2 style='color:red; text-align:center; padding-top:20vh; font-family:sans-serif;'>Доступ заборонено. Оновіть сторінку і спробуйте ще раз.</h2>";
            throw new Error("Зупинка скрипта: невірний пароль.");
        }
    }
})();

window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

// ==========================================
// 1. НАЛАШТУВАННЯ ТА ЗМІННІ СТАНУ
// ==========================================
console.log("Запуск app.js: Нові стоп-слова, кольори, погода на завтра та зовнішній Ютуб!");

const speedElement = document.getElementById('speed-display');
const statusElement = document.getElementById('status-text');
const dusyaBtn = document.getElementById('dusya-btn');
const keepAliveAudio = document.getElementById('keep-alive-audio');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');

let isListening = false;      
let isDusiaMuted = false;     
let currentMood = "весела, дружня та турботлива дівчина"; 

let said55 = false;
let said70 = false;
let said100 = false;
let currentAiRequestTime = 0; 
let wakeLock = null;

let currentLat = null;
let currentLon = null;

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
    "мелодія": "https://online.melodiafm.ua/MelodiaFM"
};

// ==========================================
// 2. ІНТЕРФЕЙС ТА НАЛАШТУВАННЯ
// ==========================================
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
        setTimeout(() => {
            settingsModal.classList.add('hidden');
            saveSettingsBtn.innerText = "Зберегти";
        }, 1000);
    }
});

document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e) {}
    }
});

// ==========================================
// 3. СИНТЕЗ МОВЛЕННЯ 
// ==========================================
function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'uk-UA';

        const voices = window.speechSynthesis.getVoices();
        let bestVoice = voices.find(v => v.lang.includes('uk'));
        if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('ru') && (v.name.toLowerCase().includes('female') || v.name.includes('Google') || v.name.includes('Milena')));
        if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('ru'));

        if (bestVoice) utterance.voice = bestVoice;

        utterance.onend = () => { if (isListening) try { recognition.start(); statusElement.innerText = "Дуся: Слухаю..."; } catch(e) { } };
        utterance.onerror = () => { if (isListening) try { recognition.start(); } catch(e) { } };

        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
// 4. КЕРУВАННЯ МУЛЬТИМЕДІА ТА ПОГОДОЮ
// ==========================================
function openYouTubeApp(query) {
    liveRadioPlayer.pause();
    // Відкриваємо ютуб у новій вкладці (на телефоні це часто відкриває сам додаток YouTube)
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

async function handleWeatherCommand(city) {
    statusElement.innerText = "Дуся: Шукаю погоду...";
    recognition.stop();
    let lat = currentLat; let lon = currentLon; let cityName = "вашому місці перебування";

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

    if (!lat || !lon) { speak("Не можу визначити координати. Увімкніть GPS."); return; }

    try {
        // Додано daily параметр для погоди на завтра (forecast_days=2)
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
            else if (code >= 51 && code <= 55) desc = "мряка";
            else if (code >= 61 && code <= 65) desc = "йде дощ";
            else if (code >= 71 && code <= 75) desc = "йде сніг";
            else if (code >= 80 && code <= 82) desc = "короткочасна злива";
            else if (code >= 95) desc = "гроза";

            speak(`У ${cityName} зараз ${tempNow} градусів, ${desc}. На завтра обіцяють від ${tempMinTom} до ${tempMaxTom} градусів.`);
        } else { speak("Не вдалося завантажити дані."); }
    } catch(e) { speak("Проблеми з метеосервером."); }
}

// ==========================================
// 5. ЗВ'ЯЗОК З ШІ
// ==========================================
async function askDusyaAI(userQuestion) {
    let apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return "Немає API ключа.";
    const savedMemory = localStorage.getItem('dusya_facts') || "Немає додаткових фактів.";
    const currentTime = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    
    const systemInstruction = `Ти - автомобільний голосовий помічник Дуся. Час: ${currentTime}. Пам'ятай: ${savedMemory}. Відповідай дуже коротко. 
    1. РАДІО - ОБОВ'ЯЗКОВО почни з тегу [RADIO: назва радіо].
    2. МУЗИКА чи ВІДЕО на Ютуб - ОБОВ'ЯЗКОВО почни з тегу [WATCH: запит].`;
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: systemInstruction + "\nВодій: " + userQuestion }] }] })
        });
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (error) { return "Проблеми з інтернетом."; }
}

// ==========================================
// 6. РОЗПІЗНАВАННЯ МОВИ ТА ЗВУК
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
        console.log("Почуто: ", transcript);

        // ЖОРСТКІ СТОП-СЛОВА
        if (transcript.includes("завершити") || transcript.includes("хватить") || transcript.includes("закрийся") || transcript.includes("не пизди") || transcript.includes("вимкни все")) {
            liveRadioPlayer.pause(); liveRadioPlayer.src = "";
            window.speechSynthesis.cancel(); playBeep();
            statusElement.innerText = "Дуся: Слухаю..."; return;
        }

        if (transcript.includes("дуся слухай")) {
            window.speechSynthesis.cancel(); currentAiRequestTime = Date.now(); playBeep();
            statusElement.innerText = "Дуся: Слухаю (Оновлено)...";
            try { recognition.start(); } catch(e) {} return;
        }

        // ДОДАНІ НОВІ КОЛЬОРИ
        if (transcript.includes("колір червоний")) { speedElement.style.color = "red"; recognition.stop(); speak("Зробила червоним."); return; }
        if (transcript.includes("колір зелений")) { speedElement.style.color = "#00FF00"; recognition.stop(); speak("Встановила зелений."); return; }
        if (transcript.includes("колір жовтий")) { speedElement.style.color = "yellow"; recognition.stop(); speak("Готово, колір жовтий."); return; }
        if (transcript.includes("колір білий")) { speedElement.style.color = "white"; recognition.stop(); speak("Змінила на білий."); return; }
        if (transcript.includes("колір синій")) { speedElement.style.color = "#00BFFF"; recognition.stop(); speak("Колір синій."); return; }
        if (transcript.includes("колір коричневий")) { speedElement.style.color = "#8B4513"; recognition.stop(); speak("Зробила коричневим."); return; }

        if (transcript.includes("погода")) {
            let city = null;
            let match = transcript.match(/погода\s+(?:в|у)\s+([а-яєіїґ-]+)/i);
            if (match) city = match[1];
            handleWeatherCommand(city);
            return;
        }

        if (transcript === "дуся" || transcript.startsWith("дуся ") || transcript.startsWith("дуся,")) {
            playBeep();
            dusyaBtn.style.backgroundColor = "#FFA500"; 
            const cleanQuery = transcript.replace("дуся", "").trim();
            
            if (cleanQuery.length > 0) {
                statusElement.innerText = "Дуся: Думаю...";
                recognition.stop(); 
                
                const thisRequestTime = Date.now(); currentAiRequestTime = thisRequestTime;
                const aiResponse = await askDusyaAI(cleanQuery);
                if (currentAiRequestTime !== thisRequestTime) return; 
                
                dusyaBtn.style.backgroundColor = "#00FF00"; 

                if (aiResponse.includes("[RADIO:")) {
                    const match = aiResponse.match(/\[RADIO:\s*(.*?)\s*\]/);
                    let cleanText = aiResponse.replace(/\[RADIO:.*?\]/, "").trim();
                    if (match && match[1]) {
                        let success = playLiveRadio(match[1]);
                        if (!success) {
                            cleanText = "Шукаю станцію на Ютубі.";
                            openYouTubeApp(`${match[1]} прямий ефір радіо`);
                        }
                    }
                    statusElement.innerText = "Дуся: Вмикаю радіо...";
                    speak(cleanText);
                }
                else if (aiResponse.includes("[WATCH:")) {
                    const match = aiResponse.match(/\[WATCH:\s*(.*?)\s*\]/);
                    if (match && match[1]) openYouTubeApp(match[1]); 
                    statusElement.innerText = "Дуся: Відкриваю Ютуб...";
                    speak(aiResponse.replace(/\[WATCH:.*?\]/, "").trim());
                } 
                else {
                    statusElement.innerText = "Дуся: Говорю...";
                    speak(aiResponse);
                }
            } else {
                statusElement.innerText = "Дуся: Слухаю...";
                dusyaBtn.style.backgroundColor = "#00FF00"; 
                recognition.stop(); 
                speak("Слухаю");
            }
        }
    };

    recognition.onend = () => { if (isListening && !window.speechSynthesis.speaking) try { recognition.start(); } catch(e) {} };
}

// ==========================================
// 7. КНОПКА ТА GPS 
// ==========================================
dusyaBtn.addEventListener('click', async () => {
    if (!isListening) {
        isListening = true; dusyaBtn.classList.add('active'); dusyaBtn.innerText = "Дуся Активна";
        statusElement.innerText = "Дуся: Слухаю..."; keepAliveAudio.play().catch(e => {});
        try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
        speak("Готова.");
    } else {
        isListening = false; dusyaBtn.classList.remove('active'); dusyaBtn.innerText = "Запустити Дусю";
        statusElement.innerText = "Вимкнена"; window.speechSynthesis.cancel();
        if (recognition) recognition.stop(); keepAliveAudio.pause();
        liveRadioPlayer.pause(); liveRadioPlayer.src = "";
        if (wakeLock !== null) { wakeLock.release(); wakeLock = null; }
    }
});

if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        function(position) {
            currentLat = position.coords.latitude; currentLon = position.coords.longitude;
            let speedKmh = Math.round(position.coords.speed * 3.6);
            if (speedKmh >= 0) { speedElement.innerText = speedKmh; }
            if (!isDusiaMuted) {
                if (speedKmh >= 100 && !said100) { speak("Не гони."); said100 = true; } 
                else if (speedKmh >= 70 && speedKmh < 100 && !said70) { speak("Пригальмуй."); said70 = true; } 
            }
            if (speedKmh < 50) { said55 = false; said70 = false; said100 = false; }
        },
        function(error) {}, { enableHighAccuracy: true }
    );
}
