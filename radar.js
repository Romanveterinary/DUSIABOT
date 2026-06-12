// ==========================================
// МОДУЛЬ 1: ШІ-РАДАР ТА ВІДЕО-АНАЛІЗ (radar.js)
// ==========================================

const aiRadarToggle = document.getElementById('ai-radar-toggle');
const aiSensSlider = document.getElementById('ai-sens-slider');
const aiFocalSlider = document.getElementById('ai-focal-slider');
const aiSensVal = document.getElementById('ai-sens-val');
const aiFocalVal = document.getElementById('ai-focal-val');
const hoodLine = document.getElementById('hood-line');
const radarControls = document.getElementById('radar-controls');
const exitRadarBtn = document.getElementById('exit-radar-btn');

let isRadarActive = false;
let aiStream = null;
let aiSens = 60;
let aiFocal = 1.0;
let aiModel = null;
let lastBeepTime = 0;
let hideLineTimeout = null;
let isDraggingLine = false;

const TARGET_CLASSES = ['person', 'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'cat', 'dog', 'stop sign'];
const REAL_HEIGHTS = { 'person': 1.7, 'car': 1.5, 'truck': 3.0, 'bus': 3.0, 'motorcycle': 1.2, 'bicycle': 1.2, 'cat': 0.3, 'dog': 0.5, 'stop sign': 1.0 };

// ==========================================
// [ДОДАНО] 1. Ініціалізація та Управління повзунками радара
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // Відновлення збережених значень при старті
    const savedSens = localStorage.getItem('dusya_ai_sens');
    if (savedSens && aiSensSlider) { aiSensSlider.value = savedSens; aiSens = parseInt(savedSens); if(aiSensVal) aiSensVal.innerText = savedSens + "%"; }
    
    const savedFocal = localStorage.getItem('dusya_ai_focal');
    if (savedFocal && aiFocalSlider) { aiFocalSlider.value = savedFocal; aiFocal = parseFloat(savedFocal); if(aiFocalVal) aiFocalVal.innerText = savedFocal; }
});

if (aiSensSlider) {
    aiSensSlider.addEventListener('input', (e) => {
        aiSensVal.innerText = e.target.value + "%";
        aiSens = parseInt(e.target.value);
        localStorage.setItem('dusya_ai_sens', e.target.value);
    });
}
if (aiFocalSlider) {
    aiFocalSlider.addEventListener('input', (e) => {
        aiFocalVal.innerText = e.target.value;
        aiFocal = parseFloat(e.target.value);
        localStorage.setItem('dusya_ai_focal', e.target.value);
    });
}
// ==========================================

// 2. Логіка "Лінії капота"
function wakeUpHoodLine() {
    if (!hoodLine || !isRadarActive) return;
    hoodLine.style.opacity = '1';
    if (radarControls) radarControls.classList.add('visible');
    
    if (hideLineTimeout) clearTimeout(hideLineTimeout);
    
    hideLineTimeout = setTimeout(() => {
        if (!isDraggingLine) {
            hoodLine.style.opacity = '0';
            if (radarControls) radarControls.classList.remove('visible');
        }
    }, 5000);
}

document.addEventListener('touchstart', wakeUpHoodLine);
document.addEventListener('mousedown', wakeUpHoodLine);

if (hoodLine) {
    hoodLine.addEventListener('touchstart', () => { isDraggingLine = true; wakeUpHoodLine(); });
    document.addEventListener('touchmove', (e) => {
        if (!isDraggingLine) return;
        let touchY = e.touches[0].clientY;
        if (touchY > 50 && touchY < window.innerHeight - 50) {
            let perc = (touchY / window.innerHeight) * 100;
            hoodLine.style.top = perc + '%';
            localStorage.setItem('dusya_hood_y', perc);
        }
        wakeUpHoodLine();
    });
    document.addEventListener('touchend', () => { isDraggingLine = false; wakeUpHoodLine(); });
}

// 3. Запуск та зупинка радара
if (exitRadarBtn) {
    exitRadarBtn.addEventListener('click', () => {
        if(aiRadarToggle) aiRadarToggle.checked = false;
        toggleRadar(false);
    });
}

async function loadAILibraries() {
    return new Promise((resolve) => {
        if (window.cocoSsd) return resolve();
        const statusElement = document.getElementById('status-text');
        if(statusElement) statusElement.innerText = "Дуся: Завантажую ШІ (1/2)...";
        
        const tfScript = document.createElement('script');
        tfScript.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs";
        tfScript.onload = () => {
            if(statusElement) statusElement.innerText = "Дуся: Завантажую ШІ (2/2)...";
            const cocoScript = document.createElement('script');
            cocoScript.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd";
            cocoScript.onload = () => {
                if(statusElement) statusElement.innerText = "Дуся: ШІ Готовий!";
                resolve();
            };
            document.head.appendChild(cocoScript);
        };
        document.head.appendChild(tfScript);
    });
}

// Функція toggleRadar зроблена глобальною, щоб її бачили інші файли (app.js)
window.toggleRadar = async function(turnOn) {
    isRadarActive = turnOn;
    const radarLayer = document.getElementById('ai-radar-layer');
    const video = document.getElementById('ai-video');
    const statusElement = document.getElementById('status-text');
    
    if (turnOn) {
        document.body.classList.add('radar-active');
        radarLayer.style.display = 'block';
        
        // ЗУПИНЯЄМО ДУСЮ (Мікрофон спить для економії ресурсів)
        if (window.recognition) { try { window.recognition.stop(); } catch(e){} }
        if(statusElement) statusElement.innerText = "Радар активний (Мікрофон вимкнено)";
        
        try {
            aiStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: "environment"}});
            video.srcObject = aiStream;
            
            // Відновлення лінії капота
            let hoodYPercent = parseFloat(localStorage.getItem('dusya_hood_y')) || 70;
            if (hoodLine) hoodLine.style.top = hoodYPercent + '%';
            wakeUpHoodLine();
            
            await loadAILibraries();
            if (!aiModel) aiModel = await cocoSsd.load();
            detectAI(); 
        } catch(e) {
            if(window.speak) window.speak("Немає доступу до камери");
            window.toggleRadar(false);
            if(aiRadarToggle) aiRadarToggle.checked = false;
        }
    } else {
        document.body.classList.remove('radar-active');
        radarLayer.style.display = 'none';
        if (aiStream) { aiStream.getTracks().forEach(t => t.stop()); aiStream = null; }
        if (video) video.srcObject = null;
        
        const canvas = document.getElementById('ai-canvas');
        if(canvas) canvas.getContext('2d').clearRect(0,0, canvas.width, canvas.height);
        
        // БУДИМО ДУСЮ (змінні isListening та recognition будуть жити в інших файлах)
        if (window.isListening && window.recognition) { 
            try { window.recognition.start(); if(statusElement) statusElement.innerText = "Дуся: Слухаю..."; } catch(e){} 
        } else if (!window.isListening) {
            if(statusElement) statusElement.innerText = "Вимкнена";
        }
    }
};

async function detectAI() {
    if (!isRadarActive || !aiModel || !aiStream) return;
    const video = document.getElementById('ai-video');
    const canvas = document.getElementById('ai-canvas');
    if (!video || !canvas) return; // Захист від помилок, якщо елементи зникли
    
    const ctx = canvas.getContext('2d');
    
    if (video.readyState === 4) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const predictions = await aiModel.detect(video);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        let hoodYPercent = parseFloat(localStorage.getItem('dusya_hood_y')) || 70;
        let hoodYPixel = (hoodYPercent / 100) * canvas.height;

        let isDanger = false;

        predictions.forEach(p => {
            if (p.score < (aiSens / 100)) return; 
            if (!TARGET_CLASSES.includes(p.class)) return; 

            const [x, y, w, h] = p.bbox;
            let realH = REAL_HEIGHTS[p.class];
            let dist = (realH * (canvas.height * aiFocal)) / h; 
            
            let bottomY = y + h; 
            let color = "#00FF00"; 
            
            if (bottomY >= hoodYPixel) {
                color = "#FF0000"; 
                isDanger = true;
            } else if (bottomY >= hoodYPixel - (canvas.height * 0.15)) {
                color = "#FFFF00"; 
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);
            
            ctx.fillStyle = color;
            ctx.font = "bold 24px monospace";
            ctx.fillText(`${p.class.toUpperCase()} ~${Math.round(dist)}m`, x, y - 10);
        });

        if (isDanger) {
            let now = Date.now();
            if (now - lastBeepTime > 1500) { 
                playDangerBeep();
                // isBikeMode буде жити в app.js
                if (window.isBikeMode) playBikeBellAlert(); 
                lastBeepTime = now;
            }
        }
    }
    
    if (isRadarActive) requestAnimationFrame(detectAI);
}

// Звуки тільки для радара
function playDangerBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(1.0, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
}

function playBikeBellAlert() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const gain = ctx.createGain(); gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.5, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        const osc1 = ctx.createOscillator(); osc1.type = 'sine'; osc1.frequency.setValueAtTime(2000, ctx.currentTime);
        const osc2 = ctx.createOscillator(); osc2.type = 'triangle'; osc2.frequency.setValueAtTime(2050, ctx.currentTime);
        osc1.connect(gain); osc2.connect(gain);
        osc1.start(); osc2.start(); osc1.stop(ctx.currentTime + 0.8); osc2.stop(ctx.currentTime + 0.8);
    } catch(e){}
}
