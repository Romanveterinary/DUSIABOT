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

window.activeLoopOscillators = []; 
window.activeIntervals = [];

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
    if (window.isRadarActive) {
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
        utterance.lang = 'uk-UA';

        const voices = window.speechSynthesis.getVoices();
        let bestVoice = voices.find(v => v.lang.includes('uk'));
        if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('ru') && (v.name.toLowerCase().includes('female') || v.name.includes('Google') || v.name.includes('Milena')));
        if (!bestVoice) bestVoice = voices.find(v => v.lang.includes('ru'));
        if (bestVoice) utterance.voice = bestVoice;

        utterance.onend = () => {
            window.playChime(); 
            if (onEndCallback) {
                onEndCallback();
            } else if (window.isListening && !window.isRadarActive && !window.speechSynthesis.speaking && !window.isRecordingNote && !window.isWaitingForCleanupConfirm) {
                try { 
                    window.recognition.start(); 
                    if (dusyaGlow) dusyaGlow.className = 'glow-green'; 
                } catch(e) { }
            }
        };
        utterance.onerror = () => { 
            if (window.isListening && !window.isRadarActive && !window.isRecordingNote) { 
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
    
    const now = new Date();
    const currentDateStr = now.toLocaleDateString('uk-UA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTimeStr = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    
    let systemInstruction = "";
    if (window.isBikeMode) {
        systemInstruction = `Ти - Дуся, спортивний вело-штурман. Сьогодні: ${currentDateStr}. Місце: ${window.currentPlaceName || "невідомо"}. Відповідай коротко. Знаєш все про велосипеди, калорії, здоров'я.`;
    } else if (window.currentMode === "FRIEND") {
        systemInstruction = `Ти - Дуся, надійний і розумний друг-попутник за кермом. Сьогодні: ${currentDateStr}. Місце: ${window.currentPlaceName || "невідомо"}. Відповідай дружньо, зріло, без клоунади. Якщо питання просте побутове - відповідай коротко. Якщо питання філософське, історичне чи складне - розкажи розгорнуто, цікаво, "розжовуючи" деталі. НЕ задавай примусових питань в кінці репліки.`;
    } else if (window.currentMode === "DEFAULT") {
        systemInstruction = `Ти - Дуся, авто-штурман. Сьогодні: ${currentDateStr}, час: ${currentTimeStr}. Місце: ${window.currentPlaceName || "невідомо"}. Відповідай коротко і по-військовому чітко.`;
    } else if (window.currentMode === "CHATTERBOX") {
        systemInstruction = `Ти - Дуся в режимі "Балабол". Твоя мета - розважати водія в заторах. Розказуй цікаві байки, жартуй. В кінці кожної репліки ти ОБОВ'ЯЗКОВО ставиш водію питання.`;
    }

    if (window.chatHistory.length > 0 && window.chatHistory[window.chatHistory.length - 1].role === "user") { window.chatHistory.pop(); }
    window.chatHistory.push({ role: "user", parts: [{ text: userQuestion }] });
    if (window.chatHistory.length > 10) window.chatHistory = window.chatHistory.slice(-10);

    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), 7000);

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ systemInstruction: { parts: [{ text: systemInstruction }] }, contents: window.chatHistory }),
            signal: abortCtrl.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        let aiText = data.candidates[0].content.parts[0].text;
        window.chatHistory.push({ role: "model", parts: [{ text: aiText }] });
        return aiText;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') return "Інтернет занадто слабкий. Переходжу в офлайн режим.";
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
        const transcript = event.results[last][0].transcript.toLowerCase().trim();
        console.log("Дуся почула: ", transcript);

        const dusyaGlow = document.getElementById('dusya-glow');

        if (transcript.includes("дуся") || window.isWaitingForCommand) { 
            if (dusyaGlow) dusyaGlow.className = 'glow-yellow'; 
            window.playPing(); 
        }

        // ==========================================
        // [ДОДАНО] КІНЕМАТОГРАФІЧНЕ ПРОЩАННЯ
        // ==========================================
        if (transcript.match(/(дуся приїхали|дуся до побачення|дуся кінець)/i)) {
            if (window.recognition) window.recognition.stop();
            window.stopAllSounds();
            
            const now = new Date();
            const dateStr = now.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
            const timeStr = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
            
            let finalMsg = `Поїздку завершено. Дякую. Сьогодні ${dateStr}, час ${timeStr}.`;
            
            // Перевіряємо чи є замітки
            let notes = localStorage.getItem('dusya_notes');
            if (notes) {
                finalMsg += " Увага, у вашому сейфі є збережені замітки.";
            }

            window.speak(finalMsg, () => {
                // Анімація чорної діри
                document.getElementById('hud-center').classList.add('cinema-collapse');
                document.body.classList.add('blackout');
                
                // Звук успіху
                if(window.playChimeJingle) window.playChimeJingle();
                
                // Вимикаємо GPS
                if (window.locationTimer) clearInterval(window.locationTimer);
                
                // Через секунду ховаємо все остаточно
                setTimeout(() => {
                    document.getElementById('hud-center').style.display = 'none';
                    if (dusyaGlow) dusyaGlow.className = ''; 
                    window.isListening = false;
                    document.getElementById('dusya-btn').innerText = "Запустити Дусю";
                }, 1200);
            });
            return;
        }
        // ==========================================

        if (window.isWaitingForCleanupConfirm) {
            if (transcript.includes("так") || transcript.includes("очистити") || transcript.includes("видалити")) {
                localStorage.removeItem('dusya_notes'); localStorage.removeItem('dusya_parking');
                localStorage.setItem('dusya_last_cleanup', Date.now());
                window.isWaitingForCleanupConfirm = false; window.speak("Сейф повністю очищено.");
            } else if (transcript.includes("ні") || transcript.includes("залишити") || transcript.includes("не треба")) {
                localStorage.setItem('dusya_last_cleanup', Date.now());
                window.isWaitingForCleanupConfirm = false; window.speak("Зрозуміла, залишаю всі записи.");
            } else { window.speak("Скажіть Так або Ні."); }
            return;
        }

        // ==========================================
        // [ОНОВЛЕНО] АВАРІЙНИЙ СТОП
        // ==========================================
        if (transcript.match(/(дуся стоп|дуся завершити|дуся хватить|дуся закрийся|дуся не пизди|дуся тихо|дуся вимкни звук|дуся зупинись)/i)) {
            window.stopAllSounds();
            window.isBikeMode = false;
            if (window.noteTimerInterval) { clearInterval(window.noteTimerInterval); window.noteTimerInterval = null; }
            window.speechSynthesis.cancel(); 
            window.isWaitingForCommand = false; window.isRecordingNote = false; window.isTimeMachineActive = false; window.isAutoGuideActive = false;
            
            document.documentElement.style.setProperty('--hud-color', '#FFFFFF');
            document.body.style.backgroundColor = ""; document.getElementById('note-overlay').style.display = 'none';
            if (dusyaGlow) dusyaGlow.className = 'glow-green'; 
            window.playPing(); 
            
            // Викликаємо нову глобальну функцію
            if(window.resetToNavigator) window.resetToNavigator();
            return;
        }
        // ==========================================

        // ==========================================
        // [ДОДАНО] УВІМКНЕННЯ РАДАРА ГОЛОСОМ
        // ==========================================
        if (transcript.match(/(дуся радар|дуся включи радар|дуся активуй радар|дуся режим радар)/i)) {
            if (window.recognition) window.recognition.stop();
            if (window.toggleRadar) {
                window.toggleRadar(true);
                const t = document.getElementById('ai-radar-toggle');
                if (t) t.checked = true;
            }
            return;
        }
        // ==========================================

        // РЕЖИМ ДРУГА ТА АВТО-ГІД
        if (transcript.match(/(дуся режим друга|дуся будь другом|дуся переключи на друга|дуся режим друг)/i)) {
            window.currentMode = "FRIEND";
            window.isAutoGuideActive = true; 
            if (window.recognition) window.recognition.stop();
            window.speak("Ввімкнула режим друга. Я на зв'язку, їдемо. І до речі, розповідатиму цікавинки по дорозі.");
            return;
        }

        // ШПАРГАЛКА КОМАНД
        if (transcript.match(/(дуся що ти вмієш|дуся розкажи команди|дуся команди|дуся що ти можеш|дуся допомога|дуся функції|дуся як тобою керувати)/i)) {
            if (window.recognition) window.recognition.stop(); 
            window.speak("Я працюю локально. Скажи 'Включи Ютуб' для музики. Скажи 'Запам'ятай парковку', щоб знайти авто. Скажи 'Покажи заправки' для мапи. Скажи 'Запиши замітку' для сейфа. Або скажи 'Режим друга' для приємної розмови."); 
            return;
        }

        // YOUTUBE ТА МУЗИКА 
        let ytMatch = transcript.match(/(?:дуся включи|дуся відкрий|дуся знайди)\s+(?:пісню|музику|в ютубі|на ютубі|ютуб)?\s*(.*)/i);
        if (ytMatch && (transcript.includes("ютуб") || transcript.includes("включи") || transcript.includes("пісню") || transcript.includes("відкрий"))) {
            let ytQuery = ytMatch[1] ? ytMatch[1].trim() : ""; 
            if (window.recognition) window.recognition.stop(); 
            if (ytQuery) { window.speak(`Відкриваю ${ytQuery} на Ютубі.`); window.openYouTubeApp(ytQuery); } 
            else { window.speak("Відкриваю Ютуб."); window.open(`https://www.youtube.com`, '_blank'); }
            return;
        }

        // ЛОКАЛЬНИЙ ПОШУК ОБ'ЄКТІВ 
        let mapMatch = transcript.match(/(?:дуся покажи|дуся знайди)\s+(заправки|заправку|кафе|макдональдс|пам'ятки|ресторани|магазини|аптеки|аптеку|туалет|парковки)/i);
        if (mapMatch && mapMatch[1] && window.searchLocalPlaces) {
            if (window.recognition) window.recognition.stop();
            window.searchLocalPlaces(mapMatch[1].trim());
            return;
        }

        // ПАРКУВАЛЬНА ПАМ'ЯТЬ 
        if (transcript.match(/(дуся запам'ятай парковку|дуся запам'ятай машину|дуся я припаркувався|дуся тут залишаю машину|дуся відміть точку парковки|дуся запам'ятай місце)/i)) {
            if (window.recognition) window.recognition.stop();
            if (window.saveParking) window.saveParking(window.currentLat, window.currentLon);
            return;
        }
        if (transcript.match(/(дуся де моя машина|дуся знайди машину|дуся де машина|дуся де стоянка|дуся дорогу до машини|дуся покажи дорогу назад)/i)) {
            if (window.recognition) window.recognition.stop();
            if (window.findCar) window.findCar();
            return;
        }

        // ВЕЛО-ФІШКИ ТА ПАСХАЛКИ
        if (transcript.match(/(дуся режим велосипеда|дуся я на велику)/i)) {
            window.isBikeMode = true; document.body.style.backgroundColor = "#004d00"; 
            document.documentElement.style.setProperty('--hud-color', '#00FF00');
            if(window.recognition) window.recognition.stop();
            window.speak("Вело-штурман активований! Крути педалі, я слідкую за маршрутом і швидкістю."); return;
        }
        if (transcript.includes("багато людей") && (transcript.includes("дуся") || window.isWaitingForCommand)) { if(window.recognition) window.recognition.stop(); window.speak("Вмикаю попереджувальний сигнал.", window.playBikeBellLoop); return; }
        if (transcript.match(/(дуся режим нло|дуся космічний корабель)/i)) {
            document.body.style.backgroundColor = "#191970"; 
            document.documentElement.style.setProperty('--hud-color', '#00FFFF'); 
            if(window.recognition) window.recognition.stop(); window.speak("Гіпер-двигун активовано.", window.playUFOLoop); return;
        }

        // РОЗУМНА АДРЕСНА КНИГА (НАВІГАТОР)
        if (transcript.match(/(дуся маршрут додому|дуся додому|дуся дім|дуся дорога додому|дуся веди додому|дуся поїхали додому)/i)) {
            if(window.recognition) window.recognition.stop(); 
            if(window.startSmartNavigation) window.startSmartNavigation("дім");
            return;
        }
        let smartNavMatch = transcript.match(/(?:дуся маршрут на|дуся поїхали на|дуся маршрут|дуся дорога на)\s+(роботу|робота\s+\d+|дача|гараж|школа|магазин)/i);
        if (smartNavMatch && smartNavMatch[1]) {
            if(window.recognition) window.recognition.stop();
            if(window.startSmartNavigation) window.startSmartNavigation(smartNavMatch[1].trim());
            return;
        }
        let routeMatch = transcript.match(/(?:дуся маршрут до|дуся доїхати до|дуся найближча)\s+(.*)/i);
        if (routeMatch && routeMatch[1]) {
            let target = routeMatch[1]; if(window.recognition) window.recognition.stop(); 
            window.speak(`Відкриваю карти, будую маршрут до ${target}.`);
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}${window.isBikeMode ? '&travelmode=bicycling' : ''}`, '_blank');
            return;
        }

        // ЗАМІТКИ
        if (window.isRecordingNote) {
            if (transcript.match(/(кінець|зберегти|кінець замітки)/i)) {
                window.isRecordingNote = false;
                if (window.noteTimerInterval) { clearInterval(window.noteTimerInterval); window.noteTimerInterval = null; }
                document.getElementById('note-overlay').style.display = 'none';
                let existingNotes = localStorage.getItem('dusya_notes') || "";
                if (window.currentNoteText.trim() !== "") {
                    localStorage.setItem('dusya_notes', existingNotes + (existingNotes ? " | " : "") + window.currentNoteText.trim());
                    window.speak("Замітку надійно збережено у сейф.");
                } else { window.speak("Запис порожній."); }
                if (window.recognition) { try { window.recognition.stop(); } catch(e){} }
            } else { window.currentNoteText += " " + transcript; }
            return; 
        }

        if (window.speechSynthesis.speaking) return; 

        // МИТТЄВІ ЛОКАЛЬНІ КОМАНДИ
        if (transcript.match(/(дуся котра година|дуся який час)/i)) { if (window.recognition) window.recognition.stop(); window.speak(`Зараз ${new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}.`); return; }
        if (transcript.match(/(дуся яке сьогодні число|дуся яка дата)/i)) { if (window.recognition) window.recognition.stop(); window.speak(`Сьогодні ${new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}.`); return; }
        if (transcript.match(/(дуся де ми|дуся яке це місто)/i)) { if (window.recognition) window.recognition.stop(); window.speak(`Ми зараз в районі ${window.currentPlaceName || "невідомо"}.`); return; }
        if (transcript.includes("яка швидкість") && (transcript.includes("дуся") || window.isWaitingForCommand)) { if (window.recognition) window.recognition.stop(); window.speak(`Зараз наша швидкість ${window.gpsSpeed || 0}.`); return; }

        if (transcript.match(/(дуся привітай улю|дуся привітай уля|дуся привіт уля)/i)) {
            if (window.recognition) window.recognition.stop();
            document.body.style.backgroundColor = "#4B0082"; 
            document.documentElement.style.setProperty('--hud-color', '#FF1493');
            window.playMagicSound();
            window.speak("Ого, який важливий пасажир на борту! Привіт, Уля! Пристебни пасок, зараз буде магія! Ти слухалась тата і маму? Тоді ось тобі весела пісенька.", () => { window.openYouTubeApp("трендові пісні для підлітків 2024"); });
            return;
        }

        // СИНХРОНІЗАЦІЯ КОЛЬОРІВ HUD
        if (transcript.includes("колір червоний") && (transcript.includes("дуся") || window.isWaitingForCommand)) { document.documentElement.style.setProperty('--hud-color', '#FF0000'); if(window.recognition) window.recognition.stop(); window.speak("Колір червоний."); return; }
        if (transcript.includes("колір зелений") && (transcript.includes("дуся") || window.isWaitingForCommand)) { document.documentElement.style.setProperty('--hud-color', '#00FF00'); if(window.recognition) window.recognition.stop(); window.speak("Колір зелений."); return; }
        if (transcript.includes("колір жовтий") && (transcript.includes("дуся") || window.isWaitingForCommand)) { document.documentElement.style.setProperty('--hud-color', '#FFFF00'); if(window.recognition) window.recognition.stop(); window.speak("Колір жовтий."); return; }
        if (transcript.includes("колір білий") && (transcript.includes("дуся") || window.isWaitingForCommand)) { document.documentElement.style.setProperty('--hud-color', '#FFFFFF'); if(window.recognition) window.recognition.stop(); window.speak("Колір білий."); return; }
        if (transcript.includes("колір синій") && (transcript.includes("дуся") || window.isWaitingForCommand)) { document.documentElement.style.setProperty('--hud-color', '#00BFFF'); if(window.recognition) window.recognition.stop(); window.speak("Колір синій."); return; }

        if (transcript.match(/(дуся запиши замітку|дуся додай замітку)/i)) {
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
            if (window.recognition) window.recognition.stop(); window.speak("Слухаю. Коли закінчиш, скажи Кінець."); return;
        }
        if (transcript.match(/(дуся прочитай замітки|дуся мої замітки)/i)) { let notes = localStorage.getItem('dusya_notes'); if (window.recognition) window.recognition.stop(); if (notes) window.speak("У сейфі є такі записи: " + notes); else window.speak("Сейф порожній."); return; }
        if (transcript.match(/(дуся видали всі замітки|дуся очистити сейф)/i)) { localStorage.removeItem('dusya_notes'); if (window.recognition) window.recognition.stop(); window.speak("Сейф порожній, всі замітки видалено."); return; }

        if (transcript.match(/(дуся машина часу|дуся назад у майбутнє)/i)) {
            window.isTimeMachineActive = true; window.said88mph = false; document.body.style.backgroundColor = "#000000";
            document.documentElement.style.setProperty('--hud-color', '#00FF00');
            const speedElement = document.getElementById('speed-display');
            if (speedElement) speedElement.style.fontFamily = "'Courier New', Courier, monospace"; 
            if (window.recognition) window.recognition.stop(); window.speak("Конденсатор потоку увімкнено! Готові до стрибка в часі."); return;
        }

        if (transcript.match(/(дуся режим балабола|дуся будь балаболом)/i)) {
            window.currentMode = "CHATTERBOX"; window.isAutoGuideActive = false;
            if (window.recognition) window.recognition.stop();
            window.speak("О, це мій улюблений режим! Вмикаю Балабола. Ну що, розкажи, як настрій сьогодні в дорозі?");
            window.isWaitingForCommand = true; clearTimeout(window.waitingTimer); window.waitingTimer = setTimeout(() => { window.isWaitingForCommand = false; }, 10000); return;
        }
        
        let weatherMatch = transcript.match(/погода\s+(?:в|у)\s+([а-яєіїґ-]+)/i);
        if (transcript.includes("погода") && (transcript.includes("дуся") || window.isWaitingForCommand)) { 
            let city = weatherMatch ? weatherMatch[1] : null; 
            if (window.handleWeatherCommand) window.handleWeatherCommand(city); return; 
        }

        let isAddressed = transcript.includes("дуся") || window.isWaitingForCommand;

        if (isAddressed) {
            clearTimeout(window.waitingTimer); window.isWaitingForCommand = false;
            let cleanQuery = transcript;
            if (transcript.includes("дуся")) {
                cleanQuery = transcript.substring(transcript.indexOf("дуся") + 4).trim().replace(/^[,.!?\s]+/, "").trim();
            }

            if (cleanQuery.length > 0) {
                if (dusyaGlow) dusyaGlow.className = 'glow-yellow'; 
                if (window.recognition) window.recognition.stop(); 
                
                const aiResponse = await window.askDusyaAI(cleanQuery);
                window.speak(aiResponse);

                if (window.currentMode === "CHATTERBOX") {
                    window.isWaitingForCommand = true; clearTimeout(window.waitingTimer);
                    window.waitingTimer = setTimeout(() => { window.isWaitingForCommand = false; }, 10000);
                }
            } else {
                if (dusyaGlow) dusyaGlow.className = 'glow-green'; 
                window.isWaitingForCommand = true;
                window.waitingTimer = setTimeout(() => { window.isWaitingForCommand = false; }, 10000); 
                if (window.recognition) window.recognition.stop(); 
                window.speak("Слухаю");
            }
        }
    };

    window.recognition.onend = () => { 
        if (window.isListening && !window.isRadarActive && !window.speechSynthesis.speaking && !window.isRecordingNote && !window.isWaitingForCleanupConfirm) { 
            try { window.recognition.start(); } catch(e) {} 
        } 
    };
}
