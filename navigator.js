// ==========================================
// МОДУЛЬ 2: НАВІГАЦІЯ, ЛОКАЦІЯ ТА ПАРКОВКА (navigator.js)
// ==========================================

window.currentRouteSteps = [];
window.currentStepIndex = 0;
window.isSmartNavActive = false;
window.navigationInterval = null;
window.leafletMap = null;
window.currentPin = null;

// Змінні для режиму "Автогід"
window.lastTourLat = null;
window.lastTourLon = null;
window.lastTourPlace = null;

// Глобальні змінні для збереження початкових параметрів всього маршруту
window.initialRouteDistance = 0;
window.initialRouteDuration = 0;

// --- 1. АДРЕСНА КНИГА (ІНТЕРАКТИВНА МАПА) ---
window.openInteractiveMap = function() {
    const mapModal = document.getElementById('map-modal');
    const settingsModal = document.getElementById('settings-modal');
    if(settingsModal) settingsModal.classList.add('hidden');
    if(mapModal) mapModal.classList.remove('hidden');

    // Якщо мапи ще немає - створюємо
    if (!window.leafletMap) {
        let startLat = window.currentLat || 49.42298; // Хмельницький по замовчуванню
        let startLon = window.currentLon || 26.98713;
        
        window.leafletMap = L.map('leaflet-map').setView([startLat, startLon], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19, attribution: '© OpenStreetMap'
        }).addTo(window.leafletMap);

        // Ставимо синю крапку "Я тут"
        if (window.currentLat) {
            L.circleMarker([window.currentLat, window.currentLon], {color: '#0cf', radius: 8, fillOpacity: 0.8}).addTo(window.leafletMap).bindPopup("Ви зараз тут").openPopup();
        }

        // Обробник КЛІКУ по мапі
        window.leafletMap.on('click', function(e) {
            if (window.currentPin) window.leafletMap.removeLayer(window.currentPin);
            window.currentPin = L.marker(e.latlng).addTo(window.leafletMap);
            
            setTimeout(() => {
                let name = prompt("Введіть коротку назву для цієї точки\n(наприклад: дім, робота, гараж):");
                if (name && name.trim() !== "") {
                    window.saveAddress(name.trim(), e.latlng.lat, e.latlng.lng);
                    window.renderSavedPoints();
                    window.currentPin.bindPopup(`📍 ${name}`).openPopup();
                } else {
                    window.leafletMap.removeLayer(window.currentPin); 
                }
            }, 300);
        });
    } else {
        if (window.currentLat) window.leafletMap.setView([window.currentLat, window.currentLon], 15);
        setTimeout(() => window.leafletMap.invalidateSize(), 300); 
    }
    window.renderSavedPoints();
};

window.saveAddress = function(name, lat, lon) {
    let book = JSON.parse(localStorage.getItem('dusya_address_book') || '{}');
    book[name.toLowerCase()] = { lat, lon };
    localStorage.setItem('dusya_address_book', JSON.stringify(book));
    if (window.speak) window.speak(`Точку ${name} збережено.`);
};

window.renderSavedPoints = function() {
    const list = document.getElementById('saved-points-list');
    if(!list) return;
    let book = JSON.parse(localStorage.getItem('dusya_address_book') || '{}');
    list.innerHTML = '';
    
    if (Object.keys(book).length === 0) {
        list.innerHTML = '<div style="text-align:center; color:#888;">Немає збережених точок</div>';
        return;
    }

    for (let key in book) {
        let div = document.createElement('div');
        div.className = 'saved-point-item';
        div.innerHTML = `<span style="color: white; font-weight: bold; text-transform: uppercase;">📍 ${key}</span> 
                         <button class="del-point-btn" onclick="window.deleteAddress('${key}')">Видалити</button>`;
        list.appendChild(div);
    }
};

window.deleteAddress = function(name) {
    if(confirm(`Точно видалити точку "${name.toUpperCase()}"?`)) {
        let book = JSON.parse(localStorage.getItem('dusya_address_book') || '{}');
        delete book[name];
        localStorage.setItem('dusya_address_book', JSON.stringify(book));
        window.renderSavedPoints();
        if (window.speak) window.speak("Точку видалено.");
    }
};

// --- 2. МАТЕМАТИКА ВІДСТАНЕЙ ТА HUD ---
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c); 
}

// ==========================================
// [ОНОВЛЕНО] РОЗУМНА ДВОЗОННА НАВІГАЦІЯ (МІСТО / ТРАСА)
// ==========================================
function updateHUD(maneuver, distance) {
    const navContainer = document.getElementById('navigation-container');
    const navArrow = document.getElementById('nav-arrow');
    const navDistance = document.getElementById('nav-distance');
    if (!navContainer || !navArrow || !navDistance) return;
    
    navContainer.style.display = 'block';
    
    // Показуємо відстань до самого маневру повороту
    if (distance > 1000) navDistance.innerText = (distance / 1000).toFixed(1) + ' км';
    else navDistance.innerText = distance + ' м';

    // Визначаємо, чи потрібно вже відкривати карту маневру (поворот)
    let showActualTurn = false;
    if (window.isInCityZone) {
        if (distance <= 50) showActualTurn = true; // В місті - строго за 50 метрів
    } else {
        if (distance <= 200) showActualTurn = true; // На трасі - за 200 метрів для безпеки
    }

    let arrowSymbol = '&#8593;'; // ⬆ за замовчуванням завжди їдемо ПРЯМО
    
    if (showActualTurn) {
        let type = maneuver.type; 
        let modifier = maneuver.modifier;
        if (type === 'roundabout') arrowSymbol = '&#8635;'; // 🔄 Кільце
        else if (modifier === 'right' || modifier === 'sharp right') arrowSymbol = '&#8680;'; // ➡ Праворуч
        else if (modifier === 'slight right') arrowSymbol = '&#8599;'; // ↗ Ледь праворуч
        else if (modifier === 'left' || modifier === 'sharp left') arrowSymbol = '&#8678;'; // ⬅ Ліворуч
        else if (modifier === 'slight left') arrowSymbol = '&#8598;'; // ↖ Ледь ліворуч
        else if (modifier === 'uturn') arrowSymbol = '&#8617;'; // ↩ Розворот
    }

    navArrow.innerHTML = arrowSymbol; 
    navArrow.className = ''; 
    
    // Динамічна інтенсивність блимання знаку повороту
    if (arrowSymbol === '&#8593;') {
        navArrow.classList.add('static'); // Стрілка прямо ніколи не блимає
    } else {
        if (window.isInCityZone) {
            // МІСТО: 50м - 20м (повільно), менше 20м (дуже швидко!)
            if (distance <= 20) navArrow.classList.add('blink-fast');
            else navArrow.classList.add('blink-slow');
        } else {
            // ТРАСА: 200м - 100м (просто горить), 100м - 50м (м'яко блимає), менше 50м (агресивно швидко)
            if (distance <= 50) navArrow.classList.add('blink-fast');
            else if (distance <= 100) navArrow.classList.add('blink-slow');
            else navArrow.classList.add('static');
        }
    }
}
// ==========================================

// --- 3. ЦИКЛ НАВІГАЦІЇ ТА ПРОКЛАДАННЯ МАРШРУТУ ---
window.processNavigation = function() {
    if (!window.isSmartNavActive || window.currentRouteSteps.length === 0 || !window.currentLat || !window.currentLon) return;
    
    let step = window.currentRouteSteps[window.currentStepIndex];
    if (!step) return;
    
    let distToStep = getDistance(window.currentLat, window.currentLon, step.maneuver.location[1], step.maneuver.location[0]);

    if (distToStep <= 25) {
        window.currentStepIndex++;
        if (window.currentStepIndex >= window.currentRouteSteps.length) {
            window.isSmartNavActive = false; 
            clearInterval(window.navigationInterval);
            const container = document.getElementById('navigation-container');
            if (container) container.style.display = 'none';
            if (window.speak) window.speak("Маршрут завершено. Ви прибули до місця призначення.");
            return;
        }
        step = window.currentRouteSteps[window.currentStepIndex];
        distToStep = getDistance(window.currentLat, window.currentLon, step.maneuver.location[1], step.maneuver.location[0]);
        
        if (window.speak && step.maneuver.modifier) {
            let action = "продовжуйте рух";
            if (step.maneuver.modifier.includes('right')) action = "поверніть праворуч";
            if (step.maneuver.modifier.includes('left')) action = "поверніть ліворуч";
            if (step.maneuver.modifier.includes('uturn')) action = "зробіть розворот";
            window.speak(`Увага, ${action}`);
        }
    }
    
    // [ОНОВЛЕНО] Розрахунок загального залишку кілометрів та точного ETA до кінця маршруту
    let remainingDistance = distToStep;
    for (let i = window.currentStepIndex + 1; i < window.currentRouteSteps.length; i++) {
        if (window.currentRouteSteps[i].distance) {
            remainingDistance += window.currentRouteSteps[i].distance;
        }
    }

    // Запис кілометрів у лівий верхній куток (шукає елемент з id="total-route-distance")
    const totalDistElem = document.getElementById('total-route-distance');
    if (totalDistElem) {
        totalDistElem.innerText = (remainingDistance / 1000).toFixed(1) + ' км';
    }

    // Запис точного Часу Прибуття у правий верхній куток (id="eta-display")
    if (window.initialRouteDistance && window.initialRouteDuration) {
        let ratio = remainingDistance / window.initialRouteDistance;
        let remainingDurationSec = window.initialRouteDuration * ratio;
        
        let arrivalTime = new Date(Date.now() + remainingDurationSec * 1000);
        let hours = String(arrivalTime.getHours()).padStart(2, '0');
        let minutes = String(arrivalTime.getMinutes()).padStart(2, '0');
        
        const etaElem = document.getElementById('eta-display');
        if (etaElem) {
            etaElem.innerText = `Прибуття: ${hours}:${minutes}`;
        }
    }

    updateHUD(step.maneuver, distToStep);
};

window.startSmartNavigation = async function(targetName) {
    let book = JSON.parse(localStorage.getItem('dusya_address_book') || '{}');
    let target = book[targetName.toLowerCase()];
    if (!target) { if (window.speak) window.speak(`Точку ${targetName} не знайдено в книзі.`); return; }
    if (!window.currentLat || !window.currentLon) { if (window.speak) window.speak("Чекаю сигнал GPS."); return; }

    if (window.speak) window.speak(`Будую маршрут до точки ${targetName}.`);
    try {
        let url = `https://router.project-osrm.org/route/v1/driving/${window.currentLon},${window.currentLat};${target.lon},${target.lat}?steps=true&geometries=geojson&overview=false`;
        
        let res = await fetch(url); 
        let data = await res.json();
        
        if (data.routes && data.routes.length > 0) {
            // Фіксуємо початкові глобальні дані всього шляху для розрахунку ETA
            window.initialRouteDistance = data.routes[0].distance;
            window.initialRouteDuration = data.routes[0].duration;

            window.currentRouteSteps = data.routes[0].legs[0].steps; 
            window.currentStepIndex = 0; 
            window.isSmartNavActive = true;
            if (window.navigationInterval) clearInterval(window.navigationInterval);
            window.navigationInterval = setInterval(window.processNavigation, 1000); 
            if (window.speak) window.speak("Маршрут побудовано. Рушаємо!");
        } else {
            if (window.speak) window.speak("Не вдалося знайти дорогу до цієї точки.");
        }
    } catch(e) { 
        if (window.speak) window.speak("Проблема з сервером навігації."); 
    }
};

// --- 4. ІНШІ ФУНКЦІЇ ---
window.searchLocalPlaces = function(query) { window.open(`http://googleusercontent.com/maps.google.com/?q=${encodeURIComponent(query)}`, '_blank'); };

window.saveParking = function(lat, lon) {
    if (lat && lon) { localStorage.setItem('dusya_parking', JSON.stringify({lat, lon})); if (window.speak) window.speak("Координати парковки збережено."); }
};

window.findCar = function() {
    let pData = localStorage.getItem('dusya_parking');
    if (pData) { let p = JSON.parse(pData); window.open(`http://googleusercontent.com/maps.google.com/?daddr=${p.lat},${p.lon}&dirflg=w`, '_blank'); } 
    else { if (window.speak) window.speak("Я не пам'ятаю парковку."); }
};

window.checkLocationAndZone = async function() {
    if (!window.currentLat || !window.currentLon) return;
    try {
        let res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${window.currentLat}&lon=${window.currentLon}&format=json&accept-language=uk`);
        let data = await res.json();
        if (data && data.address) {
            let place = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.address.suburb;
            let isCurrentlyInCity = (data.address.city || data.address.town || data.address.village) ? true : false;
            if (place) window.currentPlaceName = place;

            if (window.isFirstLocationCheck) {
                window.isFirstLocationCheck = false; window.isInCityZone = isCurrentlyInCity;
                let speedLimit = isCurrentlyInCity ? 50 : 90;
                if (window.speak) window.speak(`Системи активовано. Пристебніть пасок безпеки. Ми в районі ${place || "невідомо"}. Дозволена швидкість ${speedLimit}.`);
            } else {
                window.isInCityZone = isCurrentlyInCity; 
            }

            // ЛОГІКА АВТОГІДА
            if (window.isAutoTourGuide && place) {
                let distSinceLastTour = window.lastTourLat ? getDistance(window.currentLat, window.currentLon, window.lastTourLat, window.lastTourLon) : 99999;
                
                if (distSinceLastTour >= 5000 || window.lastTourPlace !== place) {
                    window.lastTourLat = window.currentLat;
                    window.lastTourLon = window.currentLon;
                    window.lastTourPlace = place;
                    
                    if (window.askDusyaAI && window.speak) {
                        window.askDusyaAI(`Розкажи коротку історичную довідку або один цікавий факт про населений пункт ${place} та місцевість в радіусі 5 км. Дуже коротко, цікаво, 2-3 речення.`).then(text => {
                            if (window.isAutoTourGuide && !window.speechSynthesis.speaking) {
                                window.speak("Цікавий факт. " + text);
                            }
                        });
                    }
                }
            }
        }
    } catch(e) {}
};
