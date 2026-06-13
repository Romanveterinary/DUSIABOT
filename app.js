// ==========================================
// ГОЛОВНИЙ ДИСПЕТЧЕР (app.js)
// ==========================================

// 0. ПАРОЛЬ НА ВХІД ТА PWA
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
    
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
    }
})();

console.log("Запуск Дусі v7.5: Пароль повернуто, Розумний пошук адрес");

// 1. ГЛОБАЛЬНІ ЗМІННІ ТА ЕЛЕМЕНТИ
const speedElement = document.getElementById('speed-display');
const statusElement = document.getElementById('status-text'); 
const dusyaBtn = document.getElementById('dusya-btn');
const keepAliveAudio = document.getElementById('keep-alive-audio');
const dusyaGlow = document.getElementById('dusya-glow');

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
window.isTimeWarping = false; // [ДОДАНО] Блокування екрану для анімації років

let inactivityTimer = null; 

// ==========================================
// [ДОДАНО] ЛОГІКА ІНДИКАТОРА ІНТЕРНЕТУ
// ==========================================
function updateNetworkStatus() {
    const indicator = document.getElementById('network-indicator');
    if (!indicator) return;
    
    // Скидаємо класи
    indicator.className = '';
    
    if (navigator.onLine) {
        // Якщо інтернет є, робимо псевдо-пінг для перевірки швидкості (швидка відповідь від гугла)
        let startTime = Date.now();
        fetch('https://dns.google/resolve?name=google.com', { mode: 'no-cors', cache: 'no-store' })
            .then(() => {
                let ping = Date.now() - startTime;
                if (ping < 500) indicator.classList.add('net-good'); // Зелений
                else indicator.classList.add('net-weak'); // Жовтий
            })
            .catch(() => indicator.classList.add('net-bad')); // Червоний
    } else {
        indicator.classList.add('net-bad'); // Червоний
    }
}
// Перевіряємо при старті та кожні 10 секунд
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
setInterval(updateNetworkStatus, 10000);
setTimeout(updateNetworkStatus, 1000);
// ==========================================

// ==========================================
// [ДОДАНО] ФУНКЦІЯ ГЛОБАЛЬНОГО СКИДАННЯ ТА ПРОЩАННЯ
// ==========================================
window.resetToNavigator = function() {
    // 1. Вимикаємо радар
    if (window.isRadarActive && window.toggleRadar) { 
        window.toggleRadar(false); 
        if (document.getElementById('ai-radar-toggle')) document.getElementById('ai-radar-toggle').checked = false; 
    }
    // 2. Скидаємо балабола/друга до стандарту
    window.currentMode = "DEFAULT";
    window.isTimeWarping = false;
    
    // 3. Ховаємо навігаційні стрілки ТА ПОВНІСТЮ ЗУПИНЯЄМО МАРШРУТ
    document.getElementById('navigation-container').style.display = 'none';
    window.isSmartNavActive = false;
    if (window.navigationInterval) {
        clearInterval(window.navigationInterval);
        window.navigationInterval = null;
    }
    
    if(window.recognition && window.speak) window.speak("Режим штурмана активовано.");
};

window.playChimeJingle = function() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const t = ctx.currentTime;
        const playTone = (freq, start, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.5, start + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(start); osc.stop(start + duration);
        };
        playTone(329.63, t, 0.2);       // Мі
        playTone(392.00, t + 0.15, 0.25); // Соль
        playTone(523.25, t + 0.3, 0.5);   // До
    } catch(e) {}
};
// ==========================================


// 2. ФУНКЦІЇ ІНТЕРФЕЙСУ (ЗАХИЩЕНИЙ МОБІЛЬНИЙ FULLSCREEN)
function toggleFullScreen(enable) {
    try {
        let docEl = document.documentElement;
        if (enable) {
            let requestFS = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
            if (requestFS && !document.fullscreenElement) {
                requestFS.call(docEl).catch(err => {}); 
            }
        } else {
            let exitFS = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
            if (exitFS && document.fullscreenElement) {
                exitFS.call(document).catch(err => {});
            }
        }
    } catch (e) {
        console.log("Повноекранний режим не підтримується.");
    }
}

function resetInactivityTimer() {
    if (!window.isListening) return; 
    
    const fadeElements = document.querySelectorAll('.auto-fade');
    fadeElements.forEach(el => el.classList.remove('faded'));
    
    if (inactivityTimer) clearTimeout(inactivityTimer);
    
    inactivityTimer = setTimeout(() => {
        const modal = document.getElementById('settings-modal');
        if (modal && !modal.classList.contains('hidden')) return;
        fadeElements.forEach(el => el.classList.add('faded'));
    }, 10000); 
}

document.addEventListener('touchstart', resetInactivityTimer);
document.addEventListener('mousedown', resetInactivityTimer);

// 3. ЛОГІКА НАЛАШТУВАНЬ ТА КНОПОК
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const apiKeyInput = document.getElementById('api-key-input');
const radarToggleCheckbox = document.getElementById('ai-radar-toggle');
const openMapBtn = document.getElementById('open-map-btn');

window.addEventListener('DOMContentLoaded', () => {
    try { 
        const savedKey = localStorage.getItem('gemini_api_key'); 
        if (savedKey && apiKeyInput) apiKeyInput.value = savedKey; 
    } catch (e) { }
});

if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        if (settingsModal) settingsModal.classList.remove('hidden');
    });
}

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
        if (settingsModal) settingsModal.classList.add('hidden');
        resetInactivityTimer();
    });
}

// ВІДКРИТТЯ ІНТЕРАКТИВНОЇ МАПИ
if (openMapBtn) {
    openMapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.openInteractiveMap) window.openInteractiveMap();
    });
}

// ЗАКРИТТЯ МАПИ
const closeMapBtn = document.getElementById('close-map-btn');
if (closeMapBtn) {
    closeMapBtn.addEventListener('click', () => {
        document.getElementById('map-modal').classList.add('hidden');
        resetInactivityTimer();
    });
}

// ==========================================
// [ДОДАНО] КНОПКА ЗАПУСКУ РАДАРА В НАЛАШТУВАННЯХ
// ==========================================
const launchRadarBtn = document.getElementById('launch-radar-btn');
if (launchRadarBtn) {
    launchRadarBtn.addEventListener('click', () => {
        if (window.toggleRadar) {
            window.toggleRadar(true);
            if (radarToggleCheckbox) radarToggleCheckbox.checked = true;
        }
        if (settingsModal) settingsModal.classList.add('hidden');
        resetInactivityTimer();
    });
}
// ==========================================


if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
        if (apiKeyInput) {
            const key = apiKeyInput.value.trim();
            if (key) localStorage.setItem('gemini_api_key', key);
        }
        if (radarToggleCheckbox && window.toggleRadar) {
            if (radarToggleCheckbox.checked !== window.isRadarActive) {
                window.toggleRadar(radarToggleCheckbox.checked);
            }
        }
        saveSettingsBtn.innerText = "✅ Збережено!"; 
        setTimeout(() => { 
            if (settingsModal) settingsModal.classList.add('hidden'); 
            saveSettingsBtn.innerText = "Зберегти API"; 
            resetInactivityTimer();
        }, 1000);
    });
}

// 4. ГОЛОВНА КНОПКА ЗАПУСКУ
if (dusyaBtn) {
    dusyaBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        if (!window.isListening) {
            window.isListening = true; 
            dusyaBtn.classList.add('active'); 
            dusyaBtn.innerText = "Дуся Активна";
            
            if (dusyaGlow) dusyaGlow.className = 'glow-green';
            if (statusElement) statusElement.innerText = "Дуся: Слухаю..."; 
            
            keepAliveAudio.play().catch(err => {});
            toggleFullScreen(true);

            resetInactivityTimer(); 

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
                try { window.recognition.start(); } catch(err){}
            }

        } else {
            window.isListening = false; 
            dusyaBtn.classList.remove('active'); 
            dusyaBtn.innerText = "Запустити Дусю";
            
            if (dusyaGlow) dusyaGlow.className = ''; 
            if (statusElement) statusElement.innerText = "Вимкнена"; 
            
            if (window.speechSynthesis) window.speechSynthesis.cancel(); 
            if (window.stopAllSounds) window.stopAllSounds();
            
            if (window.isRadarActive && window.toggleRadar) { 
                window.toggleRadar(false); 
                if(radarToggleCheckbox) radarToggleCheckbox.checked = false; 
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
            window.isTimeWarping = false;
            
            toggleFullScreen(false);
            
            const fadeElements = document.querySelectorAll('.auto-fade');
            fadeElements.forEach(el => el.classList.remove('faded'));
            if (inactivityTimer) clearTimeout(inactivityTimer);
            
            document.body.style.backgroundColor = "";
            document.documentElement.style.setProperty('--hud-color', '#FFFFFF');
            if (speedElement) speedElement.style.fontFamily = "";
            const noteOverlay = document.getElementById('note-overlay');
            if(noteOverlay) noteOverlay.style.display = 'none';
            
            if (window.locationTimer) { clearInterval(window.locationTimer); window.locationTimer = null; }
            if (window.wakeLock !== null) { window.wakeLock.release(); window.wakeLock = null; }
        }
    });
}

// 5. GPS ТРЕКІНГ ТА РЕАКЦІЯ НА ШВИДКІСТЬ
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        function(position) {
            window.currentLat = position.coords.latitude; 
            window.currentLon = position.coords.longitude;
            let speedKmh = Math.round(position.coords.speed * 3.6);
            
            if (speedKmh >= 0) { 
                if (window.isTimeMachineActive && speedKmh > window.gpsSpeed + 3 && window.playSciFiAcceleration) { window.playSciFiAcceleration(); }
                
                // ==========================================
                // [ОНОВЛЕНО] МАШИНА ЧАСУ: ЕПІЧНИЙ ВІДЛІК
                // ==========================================
                if (window.isTimeMachineActive && speedKmh >= 90 && !window.said88mph) {
                    window.said88mph = true; 
                    if(window.playPing) window.playPing(); 
                    
                    if (window.targetTimeYear) {
                        window.isTimeWarping = true; // Блокуємо оновлення звичайної швидкості
                        if(window.speak) window.speak("Стрибок у часі!");
                        
                        let currentY = new Date().getFullYear();
                        let targetY = parseInt(window.targetTimeYear);
                        let speedEl = document.getElementById('speed-display');
                        
                        if (speedEl) {
                            speedEl.classList.add('time-warp'); // Ефект розмиття та витягування (додамо в CSS)
                            let step = currentY > targetY ? -1 : 1;
                            let y = currentY;
                            
                            // Шалений відлік років
                            let warpInterval = setInterval(() => {
                                y += step;
                                speedEl.innerText = y;
                                
                                if (y === targetY) {
                                    clearInterval(warpInterval);
                                    
                                    // Спалах прибуття (додамо в CSS)
                                    document.body.classList.add('time-flash'); 
                                    setTimeout(() => document.body.classList.remove('time-flash'), 1000);
                                    
                                    speedEl.classList.remove('time-warp');
                                    
                                    if(window.speak) window.speak(`Ми прибули у ${targetY} рік.`, () => {
                                        if (window.openYouTubeApp) window.openYouTubeApp(`популярні пісні ${targetY} року`);
                                    });
                                    
                                    window.isTimeMachineActive = false; // Вимикаємо режим
                                    setTimeout(() => { window.isTimeWarping = false; }, 3000); // Повертаємо спідометр через 3 секунди
                                }
                            }, 50); // Зміна цифр кожні 50мс
                        }
                    } else {
                        // Якщо рік не вказано (fallback на старий режим)
                        if(window.speak) window.speak("90 кілометрів на годину! Стрибок у часі!");
                    }
                }
                // ==========================================

                // Оновлюємо спідометр ТІЛЬКИ якщо не йде відлік років
                if(speedElement && !window.isTimeWarping) speedElement.innerText = speedKmh; 
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
                } else { window.jamStartTime = 0; window.isJamZenActive = false; }

                if (speedKmh >= 100 && !window.said100) { if(window.speak) window.speak("Попереду можуть бути камери, скинь швидкість!"); window.said100 = true; } 
                else if (speedKmh >= 70 && speedKmh < 100 && !window.said70) { if(window.speak) window.speak("Тримай швидкість під контролем."); window.said70 = true; } 
                if (speedKmh < 50) { window.said70 = false; window.said100 = false; }
            }
        },
        function(error) { }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
}
