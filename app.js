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

console.log("Запуск Дусі v10.0: Відеореєстратор з телеметрією");

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
window.isTimeWarping = false; 

let inactivityTimer = null; 

// --- ІНДИКАТОР ІНТЕРНЕТУ ---
function updateNetworkStatus() {
    const indicator = document.getElementById('network-indicator');
    if (!indicator) return;
    
    indicator.className = '';
    
    if (navigator.onLine) {
        let startTime = Date.now();
        fetch('https://dns.google/resolve?name=google.com', { mode: 'no-cors', cache: 'no-store' })
            .then(() => {
                let ping = Date.now() - startTime;
                if (ping < 500) indicator.classList.add('net-good'); 
                else indicator.classList.add('net-weak'); 
            })
            .catch(() => indicator.classList.add('net-bad')); 
    } else {
        indicator.classList.add('net-bad'); 
    }
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
setInterval(updateNetworkStatus, 10000);
setTimeout(updateNetworkStatus, 1000);

// --- ЗАХИСТ ВІД ЗАВИСАННЯ (Повернення з Ютубу) ---
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.isListening && !window.isRadarActive && !window.isDashcamActive && window.recognition) {
        try {
            window.recognition.abort(); 
        } catch(e) {}
        
        setTimeout(() => {
            try {
                window.recognition.start();
                if (window.speak) window.speak("Я знову на зв'язку.");
                if (dusyaGlow) dusyaGlow.className = 'glow-green';
            } catch(e) {}
        }, 1500); 
    }
});

// ==========================================
// [ДОДАНО] ЛОГІКА ВІДЕОРЕЄСТРАТОРА (Без ШІ)
// ==========================================
window.isDashcamActive = false;
let dashcamStream = null;
let dashcamRecorder = null;
let dashcamChunks = [];
let dashcamCycleInterval = null;

window.toggleDashcam = async function(turnOn) {
    const layer = document.getElementById('dashcam-layer');
    const video = document.getElementById('dashcam-video');
    const canvas = document.getElementById('dashcam-canvas');
    
    if (turnOn) {
        window.isDashcamActive = true;
        layer.style.display = 'block';
        
        // Глушимо мікрофон Дусі, щоб не "їв" процесор
        if (window.recognition) { try { window.recognition.stop(); } catch(e){} }
        
        try {
            dashcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
            video.srcObject = dashcamStream;
            video.play();
            
            requestAnimationFrame(drawDashcamFrame);
            startDashcamCycle();
            
            if(window.speak) window.speak("Відеореєстратор увімкнено. Мікрофон вимкнено для стабільного запису.");
        } catch(e) {
            if(window.speak) window.speak("Помилка доступу до камери.");
            window.toggleDashcam(false);
        }
    } else {
        window.isDashcamActive = false;
        layer.style.display = 'none';
        if (dashcamStream) { dashcamStream.getTracks().forEach(t => t.stop()); dashcamStream = null; }
        if (dashcamRecorder && dashcamRecorder.state !== 'inactive') dashcamRecorder.stop();
        if (dashcamCycleInterval) clearInterval(dashcamCycleInterval);
        dashcamChunks = [];
        
        // Повертаємо мікрофон після виходу з реєстратора
        if (window.isListening && window.recognition) { try { window.recognition.start(); } catch(e){} }
    }
};

function drawDashcamFrame() {
    if (!window.isDashcamActive) return;
    const video = document.getElementById('dashcam-video');
    const canvas = document.getElementById('dashcam-canvas');
    const ctx = canvas.getContext('2d');
    
    if (video.videoWidth > 0) {
        if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }
        
        // 1. Малюємо чисте відео
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 2. Малюємо Швидкість (Яскраво-синя, зверху праворуч)
        ctx.fillStyle = "#00BFFF"; 
        ctx.font = "bold " + (canvas.height * 0.12) + "px Arial";
        ctx.textAlign = "right";
        ctx.fillText((window.gpsSpeed || 0) + " км/год", canvas.width - 20, canvas.height * 0.15);
        
        // 3. Малюємо Час та Координати (Білі з чорною обводкою, знизу зліва)
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold " + (canvas.height * 0.04) + "px Arial";
        ctx.textAlign = "left";
        
        let now = new Date();
        let timeStr = now.toLocaleDateString('uk-UA') + " " + now.toLocaleTimeString('uk-UA');
        let geoStr = window.currentPlaceName ? window.currentPlaceName : "GPS: " + (window.currentLat ? window.currentLat.toFixed(4) + ", " + window.currentLon.toFixed(4) : "Пошук...");
        
        ctx.lineWidth = 3;
        ctx.strokeStyle = "black";
        ctx.strokeText(timeStr + " | " + geoStr, 20, canvas.height - 30);
        ctx.fillText(timeStr + " | " + geoStr, 20, canvas.height - 30);
    }
    
    requestAnimationFrame(drawDashcamFrame);
}

function startDashcamCycle() {
    const canvas = document.getElementById('dashcam-canvas');
    const stream = canvas.captureStream(30); // 30 кадрів за секунду
    
    dashcamChunks = [];
    dashcamRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    
    dashcamRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) dashcamChunks.push(e.data);
    };
    
    dashcamRecorder.start();
    
    // Кільцевий буфер: Перезапуск кожні 5 хвилин
    if (dashcamCycleInterval) clearInterval(dashcamCycleInterval);
    dashcamCycleInterval = setInterval(() => {
        if (dashcamRecorder.state === "recording") {
            dashcamRecorder.onstop = () => { startDashcamCycle(); }; 
            dashcamRecorder.stop();
        }
    }, 300000); // 300 000 мс = 5 хвилин
}

// Кнопки інтерфейсу реєстратора
document.getElementById('launch-dashcam-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('hidden');
    window.toggleDashcam(true);
});

document.getElementById('exit-dashcam-btn')?.addEventListener('click', () => {
    window.toggleDashcam(false);
});

document.getElementById('save-dashcam-btn')?.addEventListener('click', () => {
    if (!dashcamRecorder || dashcamRecorder.state !== "recording") return;
    
    const btn = document.getElementById('save-dashcam-btn');
    const oldText = btn.innerText;
    btn.innerText = "ЗБЕРЕЖЕННЯ...";
    btn.style.background = "#00FF00";
    
    dashcamRecorder.onstop = () => {
        const blob = new Blob(dashcamChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `Dusya_Dashcam_${new Date().getTime()}.webm`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 100);
        
        btn.innerText = oldText;
        btn.style.background = "rgba(255, 0, 0, 0.85)";
        startDashcamCycle();
    };
    dashcamRecorder.stop();
});
// ==========================================

// --- ФУНКЦІЯ ГЛОБАЛЬНОГО СКИДАННЯ ---
window.resetToNavigator = function() {
    if (window.isRadarActive && window.toggleRadar) { 
        window.toggleRadar(false); 
        if (document.getElementById('ai-radar-toggle')) document.getElementById('ai-radar-toggle').checked = false; 
    }
    
    // Приховуємо реєстратор, якщо був увімкнений
    if (window.isDashcamActive && window.toggleDashcam) window.toggleDashcam(false);
    
    window.currentMode = "DEFAULT";
    window.isTimeWarping = false;
    
    if (window.stopSmartNavigation) {
        window.stopSmartNavigation();
    } else {
        document.getElementById('navigation-container').style.display = 'none';
        const topPanel = document.getElementById('route-top-panel');
        if (topPanel) topPanel.style.display = 'none';
        window.isSmartNavActive = false;
        if (window.navigationInterval) {
            clearInterval(window.navigationInterval);
            window.navigationInterval = null;
        }
    }
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
        playTone(329.63, t, 0.2);       
        playTone(392.00, t + 0.15, 0.25); 
        playTone(523.25, t + 0.3, 0.5);   
    } catch(e) {}
};

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
    } catch (e) {}
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

if (openMapBtn) {
    openMapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.openInteractiveMap) window.openInteractiveMap();
    });
}

const closeMapBtn = document.getElementById('close-map-btn');
if (closeMapBtn) {
    closeMapBtn.addEventListener('click', () => {
        document.getElementById('map-modal').classList.add('hidden');
        resetInactivityTimer();
    });
}

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
            
            if (window.recognition && !window.isRadarActive && !window.isDashcamActive) {
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
            
            // Вимикаємо реєстратор при вимиканні Дусі
            if (window.isDashcamActive && window.toggleDashcam) window.toggleDashcam(false);
            
            if (window.noteTimerInterval) { clearInterval(window.noteTimerInterval); window.noteTimerInterval = null; }
            if (window.recognition) window.recognition.stop(); 
            keepAliveAudio.pause();
            
            if (window.resetToNavigator) window.resetToNavigator();
            
            window.chatHistory = []; 
            window.isWaitingForCommand = false; 
            window.isAutoGuideActive = false;
            window.isTimeMachineActive = false; 
            window.isRecordingNote = false; 
            window.isWaitingForCleanupConfirm = false; 
            window.isBikeMode = false; 
            
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
                
                if (window.isTimeMachineActive && speedKmh >= 90 && !window.said88mph) {
                    window.said88mph = true; 
                    if(window.playPing) window.playPing(); 
                    
                    if (window.targetTimeYear) {
                        window.isTimeWarping = true; 
                        if(window.speak) window.speak("Стрибок у часі!");
                        
                        let currentY = new Date().getFullYear();
                        let targetY = parseInt(window.targetTimeYear);
                        let speedEl = document.getElementById('speed-display');
                        
                        if (speedEl) {
                            speedEl.classList.add('time-warp'); 
                            let step = currentY > targetY ? -1 : 1;
                            let y = currentY;
                            
                            let warpInterval = setInterval(() => {
                                y += step;
                                speedEl.innerText = y;
                                
                                if (y === targetY) {
                                    clearInterval(warpInterval);
                                    
                                    document.body.classList.add('time-flash'); 
                                    setTimeout(() => document.body.classList.remove('time-flash'), 1000);
                                    
                                    speedEl.classList.remove('time-warp');
                                    
                                    if(window.speak) window.speak(`Ми прибули у ${targetY} рік.`, () => {
                                        if (window.openYouTubeApp) window.openYouTubeApp(`популярні пісні ${targetY} року`);
                                    });
                                    
                                    window.isTimeMachineActive = false; 
                                    setTimeout(() => { window.isTimeWarping = false; }, 3000); 
                                }
                            }, 50); 
                        }
                    } else {
                        if(window.speak) window.speak("90 кілометрів на годину! Стрибок у часі!");
                    }
                }

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
