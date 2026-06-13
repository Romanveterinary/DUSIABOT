// ==========================================
// МОДУЛЬ 3: МОЗОК ДУСІ, ГОЛОС ТА СЦЕНАРІЇ (dusya-brain.js)
// ==========================================

window.currentMode = "DEFAULT"; 
window.chatHistory = [];        
window.isWaitingForCommand = false;
window.waitingTimer = null;
window.isAutoGuideActive = false; 
window.isRecordingNote = false;   
window.currentNoteText = "";      
window.noteTimerInterval = null;  
window.isWaitingForCleanupConfirm = false;
window.isTimeMachineActive = false;
window.isBikeMode = false;

window.currentLanguage = "uk-UA"; 
window.targetTimeYear = null;
window.isAskingForYear = false;
window.isAutoTourGuide = false;

window.activeLoopOscillators = []; 
window.activeIntervals = [];

let currentAbortController = null;

// --- 1. АУДІОЕФЕКТИ ТА ЗВУКИ ---
window.stopAllSounds = function() {
    window.activeLoopOscillators.forEach(osc => { try { osc.stop(); osc.disconnect(); } catch(e){} });
    window.activeLoopOscillators = [];
    window.activeIntervals.forEach(int => clearInterval(int));
    window.activeIntervals = [];
};

window.playPing = function() { 
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(1200, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.15);
    } catch(e){}
};

window.playChime = function() { 
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const gain = ctx.createGain(); gain.gain.setValueAtTime(0.06, ctx.currentTime); gain.connect(ctx.destination);
        const osc1 = ctx.createOscillator(); osc1.frequency.setValueAtTime(520, ctx.currentTime); osc1.connect(gain); osc1.start(); osc1.stop(ctx.currentTime + 0.08);
        const osc2 = ctx.createOscillator(); osc2.frequency.setValueAtTime(420, ctx.currentTime + 0.08); osc2.connect(gain); osc2.start(ctx.currentTime + 0.08); osc2.stop(ctx.currentTime + 0.22);
    } catch(e){}
};

window.playSciFiAcceleration = function() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 1.2);
        gain.gain.setValueAtTime(0.05, ctx.currentTime); gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 1.2);
    } catch(e) {}
};

window.playMagicSound = function() {
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
};

window.playBikeBellLoop = function() {
    window.stopAllSounds();
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
    window.activeIntervals.push(setInterval(ring, 2500));
};

window.playUFOLoop = function() {
    window.stopAllSounds();
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.setValueAtTime(80, ctx.currentTime);
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.setValueAtTime(1.5, ctx.currentTime); 
        const lfoGain = ctx.createGain(); lfoGain.gain.setValueAtTime(30, ctx.currentTime); 
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); lfo.start();
        window.activeLoopOscillators.push(osc); window.activeLoopOscillators.push(lfo);
    } catch(e){}
};

// --- 2. СИНТЕЗАТОР МОВИ ---
window.speak = function(text, onEndCallback = null) {
    if (window.isRadarActive || window.isDashcamActive) {
        if (onEndCallback) onEndCallback();
        return; 
    }
    
    const dusyaGlow = document.getElementById('dusya-glow');
    if (dusyaGlow) dusyaGlow.className = '';

    if ('speechSynthesis' in window) {
        if (window.recognition) { try { window.recognition.stop(); } catch(e){} }
        window.speechSynthesis.cancel(); 
        const cleanText = text.replace(/[*#_]/g, '').trim();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        
        utterance.lang = window.currentLanguage;

        const voices = window.speechSynthesis.getVoices();
        let bestVoice;
        
        if (window.currentLanguage === 'en-US') {
            bestVoice = voices.find(v => v.lang.includes('en') && (v.name.includes('Female') || v.name.includes('Google')));
            if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('en'));
        } else if (window.currentLanguage === 'pt-PT') {
            bestVoice = voices.find(v => v.lang.includes('pt') && (v.name.includes('Female') || v.name.includes('Google')));
            if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('pt'));
        } else {
            bestVoice = voices.find(v => v.lang.includes('uk'));
            if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('ru') && (v.name.toLowerCase().includes('female') || v.name.includes('Google') || v.name.includes('Milena')));
            if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('ru'));
        }
        
        if (bestVoice) utterance.voice = bestVoice;

        utterance.onend = () => {
            window.playChime(); 
            if (onEndCallback) {
                onEndCallback();
            } else if (window.isListening && !window.isRadarActive && !window.isDashcamActive && !window.speechSynthesis.speaking && !window.isRecordingNote && !window.isWaitingForCleanupConfirm) {
                try { 
                    window.recognition.start(); 
                    if (dusyaGlow) dusyaGlow.className = 'glow-green'; 
                } catch(e) { }
            }
        };
        utterance.onerror = () => { 
            if (window.isListening && !window.isRadarActive && !window.isDashcamActive && !window.isRecordingNote) { 
                try { 
                    window.recognition.start(); 
                    if (dusyaGlow) dusyaGlow.className = 'glow-green'; 
                } catch(e) { } 
            } 
        };
        window.speechSynthesis.speak(utterance);
    }
};

window.openYouTubeApp = function(query) {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
};

// --- 3. ШТУЧНИЙ ІНТЕЛЕКТ (GEMINI) ---
window.askDusyaAI = async function(userQuestion) {
    if (!navigator.onLine) { return "Інтернет відсутній. Працюю як офлайн-спідометр."; }
    let apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return "Будь ласка, введіть API ключ у налаштуваннях.";
    
    if (currentAbortController) {
        currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    
    const now = new Date();
    const currentDateStr = now.toLocaleDateString('uk-UA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTimeStr = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    
    let driverName = localStorage.getItem('dusya_driver_name') || "";
    let nameInstruction = driverName ? ` Водія звати ${driverName}. Звертайся до нього на ім'я.` : "";
    let langInstruction = window.currentLanguage === 'en-US' ? " ВАЖЛИВО: Відповідай виключно Англійською мовою." : (window.currentLanguage === 'pt-PT' ? " ВАЖЛИВО: Відповідай виключно Португальською мовою." : "");

    let systemInstruction = "";
    if (window.isBikeMode) {
        systemInstruction = `Ти - Дуся, спортивний вело-штурман. Сьогодні: ${currentDateStr}. Місце: ${window.currentPlaceName || "невідомо"}. Відповідай коротко. Знаєш все про велосипеди, калорії, здоров'я.${nameInstruction}${langInstruction}`;
    } else if (window.currentMode === "FRIEND") {
        systemInstruction = `Ти - Дуся, найкращий друг водія. Сьогодні: ${currentDateStr}. Місце: ${window.currentPlaceName || "невідомо"}. Обмежень за темами немає: психологія, космос, бізнес, кіно. Відповідай максимально розгорнуто, цікаво, з деталями. Підтримуй глибоку бесіду.${nameInstruction}${langInstruction}`;
    } else if (window.currentMode === "DEFAULT") {
        systemInstruction = `Ти - Дуся, авто-штурман. Сьогодні: ${currentDateStr}, час: ${currentTimeStr}. Місце: ${window.currentPlaceName || "невідомо"}. Відповідай коротко і по-військовому чітко.${nameInstruction}${langInstruction}`;
    } else if (window.currentMode === "CHATTERBOX") {
        systemInstruction = `Ти - Дуся в режимі "Балабол". Твоя мета - розважати водія в заторах. Розказуй цікаві байки, жартуй. В кінці кожної репліки ти ОБОВ'ЯЗКОВО ставиш водію питання.${nameInstruction}${langInstruction}`;
    }

    if (window.chatHistory.length > 0 && window.chatHistory[window.chatHistory.length - 1].role === "user") { window.chatHistory.pop(); }
    window.chatHistory.push({ role: "user", parts: [{ text: userQuestion }] });
    if (window.chatHistory.length > 10) window.chatHistory = window.chatHistory.slice(-10);

    const timeoutId = setTimeout(() => currentAbortController.abort(), 20000);

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ systemInstruction: { parts: [{ text: systemInstruction }] }, contents: window.chatHistory }),
            signal: currentAbortController.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        let aiText = data.candidates[0].content.parts[0].text;
        window.chatHistory.push({ role: "model", parts: [{ text: aiText }] });
        return aiText;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') return ""; 
        return "Тимчасові проблеми зі зв'язком з інтернетом.";
    }
};

// --- 4. РОЗПІЗНАВАННЯ КОМАНД (ВУХА ДУСІ) ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    window.recognition = new SpeechRecognition();
    window.recognition.lang = 'uk-UA'; 
    window.recognition.continuous = true; 
    window.recognition.interimResults = false;

    window.recognition.onresult = async (event) => {
        const last = event.results.length - 1;
        const rawTranscript = event.results[last][0].transcript.toLowerCase().trim();
        console.log("Дуся почула: ", rawTranscript);
        
        const transcript = rawTranscript.replace(/(ану|давай|швидко|будь ласка|зараз|скажи|мені)/g, ' ').replace(/\s+/g, ' ').trim();

        const dusyaGlow = document.getElementById('dusya-glow');

        // ==========================================
        // [БЕТОННИЙ РУБИЛЬНИК 1] АВАРІЙНИЙ СТОП
        // ==========================================
        let isStopCommand = transcript.match(/(стоп|завершити|хватить|закрийся|не пизди|тихо|зупинись|відміна|скасувати)/i);
        let isQuietCommand = transcript.match(/(мовчи|замовкни|помовчи)/i);
        
        if (isStopCommand || isQuietCommand) {
            window.stopAllSounds();
            window.speechSynthesis.cancel(); 
            
            if (currentAbortController) currentAbortController.abort();
            
            clearTimeout(window.waitingTimer);
            if (window.noteTimerInterval) { clearInterval(window.noteTimerInterval); window.noteTimerInterval = null; }
            window.isWaitingForCommand = false; 
            window.isRecordingNote = false; 
            window.isTimeMachineActive = false; 
            window.isAutoGuideActive = false;
            window.isAskingForYear = false;
            window.isAutoTourGuide = false;
            window.isBikeMode = false;
            
            window.chatHistory = [];
            
            document.documentElement.style.setProperty('--hud-color', '#FFFFFF');
            document.body.style.backgroundColor = ""; 
            document.getElementById('note-overlay').style.display = 'none';
            if (dusyaGlow) dusyaGlow.className = 'glow-green'; 
            window.playPing(); 
            if(window.resetToNavigator) window.resetToNavigator();
            
            setTimeout(() => {
                if (window.currentMode === "CHATTERBOX") {
                    window.currentMode = "DEFAULT";
                    let randomInsult = ["Ну і скучний ти. Повертаюсь до навігації.", "Ой, все. Їдь сам у тиші. Режим штурмана.", "Я ж хотіла як краще... Зупиняю процеси."];
                    window.speak(randomInsult[Math.floor(Math.random() * randomInsult.length)]);
                } else {
                    window.currentMode = "DEFAULT";
                    if (isQuietCommand) {
                        window.speak("Зрозуміла. Переходжу в режим тиші.");
                    } else {
                        window.speak("Зрозуміла. Режим штурмана."); 
                    }
                }
            }, 100);
            return;
        }

        // АБСОЛЮТНИЙ ПРІОРИТЕТ 2: ДІАЛОГ ПРО МАШИНУ ЧАСУ
        if (window.isAskingForYear) {
            let yearMatch = transcript.match(/\b(19\d\d|20\d\d)\b/);
            if (yearMatch) {
                window.targetTimeYear = yearMatch[1];
                window.isTimeMachineActive = true;
                window.isAskingForYear = false;
                window.said88mph = false;
                document.body.style.backgroundColor = "#000000";
                document.documentElement.style.setProperty('--hud-color', '#00FF00');
                const speedElement = document.getElementById('speed-display');
                if (speedElement) speedElement.style.fontFamily = "'Courier New', Courier, monospace"; 
                window.speak(`Ціль — ${window.targetTimeYear} рік. Розганяйтесь до 90 кілометрів на годину!`);
            } else if (transcript.match(/(скасувати|відміна)/i)) {
                window.isAskingForYear = false;
                window.speak("Скасовано.");
            } else {
                window.speak("Не зрозуміла. Назвіть рік, наприклад, 1985.");
            }
            return;
        }

        // 1. ПЕРЕВІРКА: ЧИ ДО ДУСІ ЗВЕРТАЮТЬСЯ?
        let isAddressed = transcript.includes("дуся") || window.isWaitingForCommand;

        if (transcript.includes("дуся") && !window.isWaitingForCommand) { 
            if (dusyaGlow) dusyaGlow.className = 'glow-yellow'; 
            window.playPing(); 
        }

        // 2. ВИНЯТКИ ДЛЯ ДІАЛОГІВ
        if (window.isWaitingForCleanupConfirm) {
            if (transcript.match(/(так|очистити|видалити)/i)) {
                localStorage.removeItem('dusya_notes'); localStorage.removeItem('dusya_parking');
                localStorage.setItem('dusya_last_cleanup', Date.now());
                window.isWaitingForCleanupConfirm = false; window.speak("Сейф повністю очищено.");
            } else if (transcript.match(/(ні|залишити|не треба)/i)) {
                localStorage.setItem('dusya_last_cleanup', Date.now());
                window.isWaitingForCleanupConfirm = false; window.speak("Зрозуміла, залишаю всі записи.");
            } else { window.speak("Скажіть Так або Ні."); }
            return;
        }

        if (window.isRecordingNote) {
            if (transcript.match(/(кінець|зберегти|всьо|все)/i)) {
                window.isRecordingNote = false;
                if (window.noteTimerInterval) { clearInterval(window.noteTimerInterval); window.noteTimerInterval = null; }
                document.getElementById('note-overlay').style.display = 'none';
                let existingNotes = localStorage.getItem('dusya_notes') || "";
                if (window.currentNoteText.trim() !== "") {
                    localStorage.setItem('dusya_notes', existingNotes + (existingNotes ? " | " : "") + window.currentNoteText.trim());
                    window.speak("Замітку надійно збережено у сейф.");
                } else { window.speak("Запис порожній."); }
            } else { window.currentNoteText += " " + transcript; }
            return; 
        }

        // ГОЛОВНИЙ ЩИТ
        if (!isAddressed) return;

        // ПРОЩАННЯ
        if (transcript.match(/(приїхали|до побачення|кінець|вимикайся)/i)) {
            window.stopAllSounds();
            const now = new Date();
            const dateStr = now.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
            const timeStr = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
            
            let finalMsg = `Поїздку завершено. Дякую. Сьогодні ${dateStr}, час ${timeStr}.`;
            let notes = localStorage.getItem('dusya_notes');
            if (notes) finalMsg += " Увага, у вашому сейфі є збережені замітки.";

            window.speak(finalMsg, () => {
                document.getElementById('hud-center').classList.add('cinema-collapse');
                document.body.classList.add('blackout');
                if(window.playChimeJingle) window.playChimeJingle();
                if (window.locationTimer) clearInterval(window.locationTimer);
                setTimeout(() => {
                    document.getElementById('hud-center').style.display = 'none';
                    if (dusyaGlow) dusyaGlow.className = ''; 
                    window.isListening = false;
                    document.getElementById('dusya-btn').innerText = "Запустити Дусю";
                }, 1200);
            });
            return;
        }

        // РАДАР
        if (transcript.match(/(радар|активуй сканер)/i)) {
            if (window.toggleRadar) {
                window.toggleRadar(true);
                const t = document.getElementById('ai-radar-toggle');
                if (t) t.checked = true;
            }
            return;
        }

        // [ДОДАНО] ВІДЕОРЕЄСТРАТОР
        if (transcript.match(/(реєстратор|включи камеру|відеореєстратор|запис відео)/i)) {
            if (window.toggleDashcam) {
                window.toggleDashcam(true);
            }
            return;
        }

        // МОВНІ КОМАНДИ
        if (transcript.match(/(english version|speak english|англійськ)/i)) { window.currentLanguage = 'en-US'; window.speak("English mode activated."); return; }
        if (transcript.match(/(fala portugu|португальськ)/i)) { window.currentLanguage = 'pt-PT'; window.speak("Modo português ativado."); return; }
        if (transcript.match(/(українська мова|поверни українську)/i)) { window.currentLanguage = 'uk-UA'; window.speak("Українську мову відновлено."); return; }

        // АВТОГІД 
        if (transcript.match(/(режим автогід|авто гід|екскурс)/i)) {
            window.isAutoTourGuide = true; 
            window.speak("Режим автогіда увімкнено. Буду розповідати цікаві факти про місця, які ми проїжджаємо.");
            return;
        }

        // РЕЖИМ ДРУГА 
        if (transcript.match(/(режим друга|будь другом)/i)) {
            window.currentMode = "FRIEND";
            window.speak("Ввімкнула режим друга. Я на зв'язку, їдемо.");
            return;
        }
        
        // РЕЖИМ БАЛАБОЛА
        if (transcript.match(/(режим балабол|будь балаболом|розважай)/i)) {
            window.currentMode = "CHATTERBOX"; 
            window.speak("О, це мій улюблений режим! Вмикаю Балабола. Ну що, розкажи, як настрій сьогодні в дорозі?");
            window.isWaitingForCommand = true; clearTimeout(window.waitingTimer); 
            window.waitingTimer = setTimeout(triggerChatterboxLoop, 5000); 
            return;
        }

        // ШПАРГАЛКА
        if (transcript.match(/(що ти вмієш|розкажи команди|що ти можеш|допомога)/i)) {
            window.speak("Я працюю локально. Скажи 'Включи Ютуб' для музики. Скажи 'Реєстратор' для камери. Скажи 'Покажи заправки' для мапи. Або скажи 'Режим друга' для розмови."); 
            return;
        }

        // YOUTUBE
        let ytMatch = transcript.match(/(?:включи|відкрий|знайди|вруби|постав|запусти)\s+(?:ютуб|пісн|музик|трек|відео)?\s*(.*)/i);
        if (ytMatch && ytMatch[1] && ytMatch[1].trim() !== "радар" && ytMatch[1].trim() !== "автогід" && ytMatch[1].trim() !== "реєстратор") {
            let ytQuery = ytMatch[1].trim(); 
            window.speak(`Відкриваю ${ytQuery}.`); 
            window.openYouTubeApp(ytQuery); 
            return;
        } else if (transcript.match(/(включи|відкрий)\s*(ютуб|youtube)/i)) {
            window.speak("Відкриваю Ютуб."); window.open(`https://www.youtube.com`, '_blank'); return;
        }

        // ЛОКАЛЬНИЙ ПОШУК ОБ'ЄКТІВ 
        let mapMatch = transcript.match(/(?:покажи|знайди|шукай|де найближч)\s+(заправк|кафе|ресторан|магазин|аптек|туалет|парковк)/i);
        if (mapMatch && mapMatch[1] && window.searchLocalPlaces) {
            window.searchLocalPlaces(mapMatch[1].trim());
            return;
        }

        // ПАРКУВАЛЬНА ПАМ'ЯТЬ 
        if (transcript.match(/(запам'ятай|зафіксуй|збережи|тут)\s*(парковк|машин|авто|місце)/i)) {
            if (window.saveParking) window.saveParking(window.currentLat, window.currentLon);
            return;
        }
        if (transcript.match(/(де|знайди|шукай|покажи)\s*(машин|авто|парковк|стоянку)/i)) {
            if (window.findCar) window.findCar();
            return;
        }

        // РОЗУМНА НАВІГАТОР (Адресна книга + Фоллбек на Google)
        let routeMatch = transcript.match(/(?:маршрут|дорога|веди|поїхали|шлях|навігація|доїхати)(?:\s+(?:на|до|в|у))?\s+(.*)/i);
        if (routeMatch && routeMatch[1]) {
            let target = routeMatch[1].trim().replace("дуся", "").trim(); 
            if (target.length > 0) {
                let book = JSON.parse(localStorage.getItem('dusya_address_book') || '{}');
                let foundInBook = Object.keys(book).find(key => target.includes(key.toLowerCase()));
                
                if (foundInBook && window.startSmartNavigation) {
                    window.startSmartNavigation(foundInBook);
                } else {
                    window.speak(`Відкриваю карти, маршрут до ${target}.`);
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=$$${encodeURIComponent(target)}${window.isBikeMode ? '&travelmode=bicycling' : ''}`, '_blank');
                }
                return;
            }
        }

        // ЗАМІТКИ
        if (transcript.match(/(запиши|додай|створи)\s*(замітк|запис)/i)) {
            window.isRecordingNote = true; window.currentNoteText = "";
            let noteStartTime = Date.now();
            if (window.noteTimerInterval) clearInterval(window.noteTimerInterval);
            const overlay = document.getElementById('note-overlay'); const timeSpan = document.getElementById('note-time');
            if(overlay) overlay.style.display = 'flex';
            window.noteTimerInterval = setInterval(() => {
                let elapsedSecs = Math.floor((Date.now() - noteStartTime) / 1000);
                let mins = String(Math.floor(elapsedSecs / 60)).padStart(2, '0');
                let secs = String(elapsedSecs % 60).padStart(2, '0');
                if(timeSpan) timeSpan.innerText = `${mins}:${secs}`;
            }, 1000);
            window.speak("Слухаю. Коли закінчиш, скажи Все."); return;
        }
        if (transcript.match(/(прочитай|мої|відкрий)\s*(замітк|запис)/i)) { let notes = localStorage.getItem('dusya_notes'); if (notes) window.speak("У сейфі є такі записи: " + notes); else window.speak("Сейф порожній."); return; }
        if (transcript.match(/(видали|очисти|зітри)\s*(замітк|запис|сейф)/i)) { localStorage.removeItem('dusya_notes'); window.speak("Сейф порожній, всі замітки видалено."); return; }

        // МИТТЄВІ ЛОКАЛЬНІ КОМАНДИ (Пошук за коренем слова)
        if (transcript.match(/(годин|час|котр)/i)) { window.speak(`Зараз ${new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}.`); return; }
        if (transcript.match(/(число|дат|сьогодні)/i)) { window.speak(`Сьогодні ${new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}.`); return; }
        if (transcript.match(/(де ми|яке це місто|де я)/i)) { window.speak(`Ми зараз в районі ${window.currentPlaceName || "невідомо"}.`); return; }
        if (transcript.match(/(швидкість|їдемо)/i)) { window.speak(`Зараз наша швидкість ${window.gpsSpeed || 0}.`); return; }

        let weatherMatch = transcript.match(/погода\s+(?:в|у)\s+([а-яєіїґ-]+)/i);
        if (transcript.includes("погода")) { 
            let city = weatherMatch ? weatherMatch[1] : null; 
            if (window.handleWeatherCommand) window.handleWeatherCommand(city); return; 
        }

        // СИНХРОНІЗАЦІЯ КОЛЬОРІВ HUD
        if (transcript.match(/колір\s+(червоний|зелений|жовтий|білий|синій)/i)) {
            let color = transcript.match(/колір\s+(червоний|зелений|жовтий|білий|синій)/i)[1];
            let hex = '#FFFFFF';
            if(color === 'червоний') hex = '#FF0000'; if(color === 'зелений') hex = '#00FF00';
            if(color === 'жовтий') hex = '#FFFF00'; if(color === 'синій') hex = '#00BFFF';
            document.documentElement.style.setProperty('--hud-color', hex); 
            window.speak(`Колір ${color}.`); return; 
        }

        // ВЕЛО-ФІШКИ ТА ПАСХАЛКИ
        if (transcript.match(/(режим велосипед|я на велику)/i)) {
            window.isBikeMode = true; document.body.style.backgroundColor = "#004d00"; 
            document.documentElement.style.setProperty('--hud-color', '#00FF00');
            window.speak("Вело-штурман активований! Крути педалі, я слідкую за маршрутом і швидкістю."); return;
        }
        if (transcript.includes("багато людей")) { window.speak("Вмикаю попереджувальний сигнал.", window.playBikeBellLoop); return; }
        if (transcript.match(/(режим нло|космічний корабель)/i)) {
            document.body.style.backgroundColor = "#191970"; document.documentElement.style.setProperty('--hud-color', '#00FFFF'); 
            window.speak("Гіпер-двигун активовано.", window.playUFOLoop); return;
        }
        if (transcript.match(/ул[яюїі]/i) || transcript.includes("улею") || transcript.includes("ульою")) {
            document.body.style.backgroundColor = "#4B0082"; document.documentElement.style.setProperty('--hud-color', '#FF1493');
            window.playMagicSound(); window.speak("Ого, який важливий пасажир на борту! Привіт, Уля! Пристебни пасок, зараз буде магія!", () => { window.openYouTubeApp("сучасна музика для підлітків дівчаток 12 років"); }); return;
        }

        // ЯКЩО ЖОДНА ЛОКАЛЬНА КОМАНДА НЕ СПРАЦЮВАЛА
        clearTimeout(window.waitingTimer); window.isWaitingForCommand = false;
        let cleanQuery = transcript;
        
        if (transcript.includes("дуся")) {
            cleanQuery = transcript.substring(transcript.indexOf("дуся") + 4).trim().replace(/^[,.!?\s]+/, "").trim();
        }

        if (cleanQuery.length > 0) {
            // ЖОРСТКИЙ ПРІОРИТЕТ: Якщо режим штурмана (DEFAULT), ШІ ігнорується
            if (window.currentMode === "DEFAULT") {
                window.speak("Команду не розпізнано. Я в локальному режимі.");
                if (dusyaGlow) dusyaGlow.className = 'glow-green';
            } else {
                if (dusyaGlow) dusyaGlow.className = 'glow-yellow'; 
                
                const aiResponse = await window.askDusyaAI(cleanQuery);
                if (aiResponse) {
                    window.speak(aiResponse);

                    if (window.currentMode === "CHATTERBOX") {
                        window.isWaitingForCommand = true; clearTimeout(window.waitingTimer);
                        window.waitingTimer = setTimeout(triggerChatterboxLoop, 5000); 
                    }
                } else {
                    if (dusyaGlow) dusyaGlow.className = 'glow-green';
                }
            }
        } else {
            if (dusyaGlow) dusyaGlow.className = 'glow-green'; 
            window.isWaitingForCommand = true;
            window.waitingTimer = setTimeout(() => { window.isWaitingForCommand = false; }, 10000); 
            window.speak("Слухаю");
        }
    };

    window.recognition.onend = () => { 
        if (window.isListening && !window.isRadarActive && !window.isDashcamActive && !window.speechSynthesis.speaking && !window.isRecordingNote && !window.isWaitingForCleanupConfirm) { 
            try { window.recognition.start(); } catch(e) {} 
        } 
    };
    
    async function triggerChatterboxLoop() {
        if (window.currentMode !== "CHATTERBOX" || !window.isListening) return;
        window.isWaitingForCommand = false;
        
        const aiResponse = await window.askDusyaAI("Водій мовчить. Продовжуй розмову сама! Розкажи смішну історію з життя, цікавий факт, анекдот або новину, ніби ти справжня балакуча жінка. І в кінці знову запитай щось у водійки.");
        if (aiResponse) {
            window.speak(aiResponse, () => {
                if (window.currentMode === "CHATTERBOX") {
                    window.isWaitingForCommand = true;
                    window.waitingTimer = setTimeout(triggerChatterboxLoop, 5000);
                    try { 
                        window.recognition.start(); 
                        const glow = document.getElementById('dusya-glow');
                        if (glow) glow.className = 'glow-green';
                    } catch(e) {}
                }
            });
        }
    }

    // АГРЕСИВНИЙ 5-СЕКУНДНИЙ СТОРОЖ (Заблоковано для реєстратора)
    setInterval(() => {
        if (window.isListening && !window.isRadarActive && !window.isDashcamActive && !window.speechSynthesis.speaking && !window.isRecordingNote && !window.isWaitingForCleanupConfirm && !window.isAskingForYear) {
            try {
                window.recognition.start();
                const glow = document.getElementById('dusya-glow');
                if (glow && glow.className === '') glow.className = 'glow-green';
            } catch(e) {
                // Мікрофон вже працює, все ок
            }
        }
    }, 5000);
}
