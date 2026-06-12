// ==========================================
// ГОЛОВНИЙ ДИСПЕТЧЕР (app.js)
// ==========================================

// 0. ПАРОЛЬ НА ВХІД ТА PWA (ОФЛАЙН РЕЖИМ)
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

console.log("Запуск Дусі v6.0: Модульна архітектура, Fullscreen, Режим Друг");

// 1. ГЛОБАЛЬНІ ЗМІННІ ТА ЕЛЕМЕНТИ
const speedElement = document.getElementById('speed-display');
const statusElement = document.getElementById('status-text');
const dusyaBtn = document.getElementById('dusya-btn');
const keepAliveAudio = document.getElementById('keep-alive-audio');

window.isListening = false;
window.said70 = false;
window.said100 = false;
window.wakeLock = null;
window.jamStartTime = 0;
window.isJamZenActive = false;
window.locationTimer = null;
window.gpsSpeed = 0;
window.currentLat = null;
window.currentLon = null;
window.isFirstLocationCheck = true;

// 2. ПОВНОЕКРАННИЙ РЕЖИМ (ФУНКЦІЯ)
function toggleFullScreen(enable) {
    if (enable) {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log(`Помилка повноекранного режиму: ${err.message}`);
            });
        }
    } else {
        if (document.exitFullscreen && document.fullscreenElement) {
            document.exitFullscreen();
        }
    }
}

// 3. ГОЛОВНА КНОПКА ЗАПУСКУ
dusyaBtn.addEventListener('click', async () => {
    if (!window.isListening) {
        window.isListening = true; 
        dusyaBtn.classList.add('active'); 
        dusyaBtn.innerText = "Дуся Активна";
        dusyaBtn.style.backgroundColor = "#00FF00"; 
        statusElement.innerText = "Дуся: Слухаю..."; 
        
        keepAliveAudio.play().catch(e => {});
        toggleFullScreen(true); // Ховаємо шапку браузера!

        try { if ('wakeLock' in navigator) window.wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
        
        window.isFirstLocationCheck = true; 
        window.jamStartTime = 0; 
        window.isJamZenActive = false;
        
        if (window.locationTimer) clearInterval(window.locationTimer);
        if (window.checkLocationAndZone) {
            window.locationTimer = setInterval(window.checkLocationAndZone, 60000); 
            setTimeout(window.checkLocationAndZone, 1500);
        }

        let lastCleanup = localStorage.getItem('dusya_last_cleanup');
        let nowTime = Date.now();
        if (!lastCleanup) { localStorage.setItem('dusya_last_cleanup', nowTime); } 
        else if (nowTime - parseInt(lastCleanup) > 30 * 24 * 60 * 60 * 1000) {
            window.isWaitingForCleanupConfirm = true;
            if (window.recognition) window.recognition.stop();
            setTimeout(() => { 
                if (window.speak) window.speak("Минув місяць. Бажаєте очистити сейф заміток та парковку? Скажіть Так або Ні."); 
            }, 1000);
        }
        
        if (window.recognition && !window.isRadarActive) {
            try { window.recognition.start(); } catch(e){}
        }

    } else {
        window.isListening = false; 
        dusyaBtn.classList.remove('active'); 
        dusyaBtn.innerText = "Запустити Дусю";
        dusyaBtn.style.backgroundColor = ""; 
        statusElement.innerText = "Вимкнена"; 
        
        if (window.speechSynthesis) window.speechSynthesis.cancel(); 
        if (window.stopAllSounds) window.stopAllSounds();
        
        if (window.isRadarActive && window.toggleRadar) { 
            window.toggleRadar(false); 
            const toggleBtn = document.getElementById('ai-radar-toggle');
            if(toggleBtn) toggleBtn.checked = false; 
        }
        
        if (window.noteTimerInterval) { clearInterval(window.noteTimerInterval); window.noteTimerInterval = null; }
        if (window.recognition) window.recognition.stop(); 
        keepAliveAudio.pause();
        
        window.currentMode = "DEFAULT"; 
        window.chatHistory = []; 
        window.isWaitingForCommand = false; 
        window.isAutoGuideActive = false;
        window.isTimeMachineActive = false; 
        window.isRecordingNote = false; 
        window.isWaitingForCleanupConfirm = false; 
        window.isBikeMode = false; 
        
        toggleFullScreen(false); // Виходимо з повноекранного
        
        document.body.style.backgroundColor = "";
        speedElement.style.color = "white";
        speedElement.style.fontFamily = "";
        speedElement.style.textShadow = "none";
        document.getElementById('note-overlay').style.display = 'none';
        
        if (window.locationTimer) { clearInterval(window.locationTimer); window.locationTimer = null; }
        if (window.wakeLock !== null) { window.wakeLock.release(); window.wakeLock = null; }
    }
});

// 4. GPS ТРЕКІНГ ТА РЕАКЦІЯ НА ШВИДКІСТЬ
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        function(position) {
            window.currentLat = position.coords.latitude; 
            window.currentLon = position.coords.longitude;
            let speedKmh = Math.round(position.coords.speed * 3.6);
            
            if (speedKmh >= 0) { 
                if (window.isTimeMachineActive && speedKmh > window.gpsSpeed + 3 && window.playSciFiAcceleration) { window.playSciFiAcceleration(); }
                if (window.isTimeMachineActive && speedKmh >= 90 && !window.said88mph) {
                    window.said88mph = true; 
                    if(window.playPing) window.playPing(); 
                    if(window.speak) window.speak("90 кілометрів на годину! Стрибок у часі!");
                }
                speedElement.innerText = speedKmh; 
                window.gpsSpeed = speedKmh; 
            }

            if (window.isBikeMode) {
                if (speedKmh >= 40 && !window.saidBikeFast) {
                    if(window.speak) window.speak("Не спіши, будь уважний!!! Агов!!"); 
                    window.saidBikeFast = true;
                } else if (speedKmh < 35 && window.saidBikeFast) {
                    if(window.speak) window.speak("Молодець. Так краще."); 
                    window.saidBikeFast = false;
                }
            } else {
                if (window.gpsSpeed <= 7) {
                    if (window.jamStartTime === 0) window.jamStartTime = Date.now();
                    else if (Date.now() - window.jamStartTime > 180000 && !window.isJamZenActive) { 
                        window.isJamZenActive = true; window.currentMode = "CHATTERBOX";
                        if(window.speak) window.speak("Схоже, ми застрягли у заторі. Щоб не нудьгувати, я вмикаю режим балабола.");
                    }
                } else { window.jamStartTime = 0; window.isJamZenActive = false; }

                if (speedKmh >= 100 && !window.said100) { if(window.speak) window.speak("Попереду можуть бути камери, скинь швидкість!"); window.said100 = true; } 
                else if (speedKmh >= 70 && speedKmh < 100 && !window.said70) { if(window.speak) window.speak("Тримай швидкість під контролем."); window.said70 = true; } 
                if (speedKmh < 50) { window.said70 = false; window.said100 = false; }
            }
        },
        function(error) { }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
}
