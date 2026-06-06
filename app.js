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

// Прогрів голосів
window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

// ==========================================
// 1. НАЛАШТУВАННЯ ТА ЗМІННІ СТАНУ
// ==========================================
console.log("Запуск app.js: Версія з командою екстреного скидання 'Дуся слухай'!");

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

// Змінна для блокування старих відповідей ШІ при перезапуску
let currentAiRequestTime = 0; 

// ==========================================
// 2. ІНТЕРФЕЙС ТА НАЛАШТУВАННЯ
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    try {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) apiKeyInput.value = savedKey; 
    } catch (e) { }

    let ytFrame = document.getElementById('dusya-youtube-player');
    if (!ytFrame) {
        ytFrame = document.createElement('iframe');
        ytFrame.id = 'dusya-youtube-player';
        ytFrame.style.width = "100%";
        ytFrame.style.border = "none";
        ytFrame.style.position = "fixed";
        ytFrame.style.left = "0";
        ytFrame.style.backgroundColor = "#000"; 
        ytFrame.style.display = "none"; 
        ytFrame.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
        document.body.appendChild(ytFrame);
    }

    let speedOverlay = document.getElementById('dusya-speed-overlay');
    if (!speedOverlay) {
        speedOverlay = document.createElement('div');
        speedOverlay.id = 'dusya-speed-overlay';
        speedOverlay.style.position = "fixed";
        speedOverlay.style.top = "20px";
        speedOverlay.style.right = "20px";
        speedOverlay.style.zIndex = "2000"; 
        speedOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
        speedOverlay.style.color = "#00FF00"; 
        speedOverlay.style.padding = "10px 20px";
        speedOverlay.style.borderRadius = "10px";
        speedOverlay.style.fontSize = "28px";
        speedOverlay.style.fontWeight = "bold";
        speedOverlay.style.fontFamily = "sans-serif";
        speedOverlay.style.pointerEvents = "none"; 
        speedOverlay.style.display = "none";
        speedOverlay.innerText = "0 км/год";
        document.body.appendChild(speedOverlay);
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

        utterance.onend = () => {
            if (isListening) {
                try {
                    recognition.start();
                    statusElement.innerText = "Дуся: Слухаю... (Скажіть: Дуся...)";
                } catch(e) { }
            }
        };

        utterance.onerror = () => {
            if (isListening) {
                try { recognition.start(); } catch(e) { }
            }
        };

        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
// 4. КЕРУВАННЯ РЕЖИМАМИ YOUTUBE ТА РАДІО
// ==========================================
function setYouTubeMode(mode, query = null) {
    const ytFrame = document.getElementById('dusya-youtube-player');
    const speedOverlay = document.getElementById('dusya-speed-overlay');
    
    if (!ytFrame || !speedOverlay) return;

    if (mode === 'fullscreen') {
        ytFrame.style.display = "block";
        ytFrame.style.height = "100vh"; 
        ytFrame.style.top = "0";
        ytFrame.style.bottom = "auto";
        ytFrame.style.zIndex = "1500"; 
        speedOverlay.style.display = "block"; 
    } 
    else if (mode === 'bottom') {
        ytFrame.style.display = "block";
        ytFrame.style.height = "35vh"; 
        ytFrame.style.top = "auto";
        ytFrame.style.bottom = "0";
        ytFrame.style.zIndex = "1000";
        speedOverlay.style.display = "none"; 
    } 
    else if (mode === 'hide') {
        ytFrame.style.display = "none";
        ytFrame.src = "";
        speedOverlay.style.display = "none";
    }

    if (query) {
        ytFrame.src = `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(query)}&autoplay=0`;
    }
}

// ==========================================
// 5. ЗВ'ЯЗОК З ШІ GEMINI 2.5 FLASH 
// ==========================================
async function askDusyaAI(userQuestion) {
    let apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return "Немає API ключа.";

    const savedMemory = localStorage.getItem('dusya_facts') || "Немає додаткових фактів.";
    const currentTime = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    const currentDate = new Date().toLocaleDateString('uk-UA');
    
    const systemInstruction = `Ти - автомобільний голосовий помічник Дуся. 
    Час: ${currentTime}, дата: ${currentDate}. Якщо спитають - називай цей час.
    Твій настрій: ${currentMood}. Пам'ятай: ${savedMemory}.
    Відповідай дуже коротко. 
    ВАЖЛИВІ КОМАНДИ ДЛЯ ЕКРАНУ:
    1. Якщо водій просить конкретне РАДІО (наприклад: радіо рокс, хіт фм, люкс фм тощо) - ОБОВ'ЯЗКОВО почни з тегу [RADIO: назва радіо].
    2. Якщо просить загальну МУЗИКУ (співака, плейліст, ретро) фоном - ОБОВ'ЯЗКОВО почни з тегу [PLAY: запит].
    3. Якщо каже "ПОДИВИТИСЬ", просить відео чи ютуб на весь екран - ОБОВ'ЯЗКОВО почни з тегу [WATCH: запит].`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemInstruction + "\nВодій: " + userQuestion }] }]
            })
        });
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        return "Проблеми з інтернетом.";
    }
}

// ==========================================
// 6. РОЗПІЗНАВАННЯ МОВИ ТА ЗВУК "ПІК"
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

function playBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 880; 
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); 
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15); 
    } catch (e) {}
}

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'uk-UA';
    recognition.continuous = true; 
    recognition.interimResults = false;

    recognition.onresult = async (event) => {
        const last = event.results.length - 1;
        const transcript = event.results[last][0].transcript.toLowerCase().trim();
        console.log("Почуто: ", transcript);

        // --- ЕКСТРЕНЕ СКИДАННЯ (HARD RESET) ---
        if (transcript === "дуся слухай" || transcript.includes("дуся слухай")) {
            console.log("Екстрене скидання команд!");
            window.speechSynthesis.cancel(); // Обірвати всі старі озвучки
            currentAiRequestTime = Date.now(); // Змінюємо мітку часу, щоб проігнорувати старі відповіді від ШІ
            
            playBeep();
            statusElement.innerText = "Дуся: Слухаю (Оновлено)...";
            dusyaBtn.style.backgroundColor = "#00FF00"; 
            dusyaBtn.style.boxShadow = "0 0 20px #00FF00";
            
            // Якщо розпізнавання зупинилось через зависання, смикаємо його
            try { recognition.start(); } catch(e) {}
            return;
        }

        // КОМАНДИ КЕРУВАННЯ ЕКРАНОМ
        if (transcript.includes("заховай ютуб") || transcript.includes("сховай ютуб") || transcript.includes("закрий ютуб") || transcript.includes("вимкни радіо") || transcript.includes("вимкни відео")) {
            setYouTubeMode('hide');
            speak("Вимикаю.");
            return;
        }

        if (transcript.includes("заспокойся") || transcript.includes("стоп")) {
            isDusiaMuted = true;
            statusElement.innerText = "Дуся: Режим тиші";
            speak("Мовчу.");
            return;
        }
        
        if (transcript.includes("працюй")) {
            isDusiaMuted = false;
            statusElement.innerText = "Дуся: Контроль увімкнено";
            speak("Слідкую за дорогою.");
            return;
        }

        if (transcript.startsWith("дуся")) {
            playBeep();
            dusyaBtn.style.backgroundColor = "#FFA500"; 
            dusyaBtn.style.boxShadow = "0 0 20px #FFA500";
            
            const cleanQuery = transcript.replace("дуся", "").trim();
            
            if (cleanQuery.length > 0) {
                statusElement.innerText = "Дуся: Думаю...";
                recognition.stop(); 
                
                // Фіксуємо час цього запиту
                const thisRequestTime = Date.now();
                currentAiRequestTime = thisRequestTime;

                const aiResponse = await askDusyaAI(cleanQuery);
                
                // Перевірка: чи не було команди "Дуся слухай", поки ШІ думав?
                if (currentAiRequestTime !== thisRequestTime) {
                    console.log("Стару відповідь відхилено через команду 'Дуся слухай'.");
                    return; // Просто відкидаємо запізнілу відповідь
                }
                
                dusyaBtn.style.backgroundColor = "#00FF00"; 
                dusyaBtn.style.boxShadow = "0 0 20px #00FF00";
                
                if (aiResponse.includes("[RADIO:")) {
                    const match = aiResponse.match(/\[RADIO:\s*(.*?)\s*\]/);
                    if (match && match[1]) {
                        const radioQuery = `${match[1]} прямий ефір радіо`;
                        setYouTubeMode('bottom', radioQuery); 
                    }
                    const cleanText = aiResponse.replace(/\[RADIO:.*?\]/, "").trim();
                    statusElement.innerText = "Дуся: Налаштовую радіо...";
                    speak(cleanText);
                }
                else if (aiResponse.includes("[WATCH:")) {
                    const match = aiResponse.match(/\[WATCH:\s*(.*?)\s*\]/);
                    if (match && match[1]) {
                        setYouTubeMode('fullscreen', match[1]); 
                    }
                    const cleanText = aiResponse.replace(/\[WATCH:.*?\]/, "").trim();
                    statusElement.innerText = "Дуся: Відео на весь екран...";
                    speak(cleanText);
                } 
                else if (aiResponse.includes("[PLAY:")) {
                    const match = aiResponse.match(/\[PLAY:\s*(.*?)\s*\]/);
                    if (match && match[1]) {
                        setYouTubeMode('bottom', match[1]); 
                    }
                    const cleanText = aiResponse.replace(/\[PLAY:.*?\]/, "").trim();
                    statusElement.innerText = "Дуся: Вмикаю музику...";
                    speak(cleanText);
                } 
                else {
                    statusElement.innerText = "Дуся: Говорю...";
                    speak(aiResponse);
                }
            } else {
                statusElement.innerText = "Дуся: Слухаю...";
                dusyaBtn.style.backgroundColor = "#00FF00"; 
                dusyaBtn.style.boxShadow = "0 0 20px #00FF00";
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
// 7. КНОПКА ТА GPS
// ==========================================
dusyaBtn.addEventListener('click', () => {
    if (!isListening) {
        isListening = true;
        dusyaBtn.classList.add('active');
        dusyaBtn.innerText = "Дуся Активна";
        statusElement.innerText = "Дуся: Слухаю...";
        keepAliveAudio.play().catch(e => {});
        speak("Готова.");
    } else {
        isListening = false;
        dusyaBtn.classList.remove('active');
        dusyaBtn.innerText = "Запустити Дусю";
        statusElement.innerText = "Вимкнена";
        window.speechSynthesis.cancel();
        if (recognition) recognition.stop();
        keepAliveAudio.pause();
        setYouTubeMode('hide');
    }
});

if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        function(position) {
            let speedKmh = Math.round(position.coords.speed * 3.6);
            if (speedKmh > 0) {
                speedElement.innerText = speedKmh;
                const overlay = document.getElementById('dusya-speed-overlay');
                if (overlay) overlay.innerText = speedKmh + " км/год";
            }
            if (!isDusiaMuted) {
                if (speedKmh >= 100 && !said100) { speak("Не гони."); said100 = true; } 
                else if (speedKmh >= 70 && speedKmh < 100 && !said70) { speak("Пригальмуй."); said70 = true; } 
                else if (speedKmh >= 55 && speedKmh < 70 && !said55) { speak("Ми за містом?"); said55 = true; }
            }
            if (speedKmh < 50) { said55 = false; said70 = false; said100 = false; }
        },
        function(error) {},
        { enableHighAccuracy: true }
    );
}