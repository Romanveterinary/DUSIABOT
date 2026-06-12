// ==========================================
// МОДУЛЬ 2: НАВІГАЦІЯ, ЛОКАЦІЯ ТА ПАРКОВКА (navigator.js)
// ==========================================

window.currentRouteSteps = [];
window.currentStepIndex = 0;
window.isSmartNavActive = false;
window.navigationInterval = null;
window.leafletMap = null;
window.currentPin = null;

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
                    window.leafletMap.removeLayer(window.currentPin); // Видаляємо маркер, якщо передумали
                }
            }, 300);
        });
    } else {
        // Якщо мапа вже була, просто центруємо на поточне місце
        if (window.currentLat) window.leafletMap.setView([window.currentLat, window.currentLon], 15);
        setTimeout(() => window.leafletMap.invalidateSize(), 300); // Фікс сірого екрана
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
// [ОНОВЛЕНО] ВЕКТОРНІ 3D СТРІЛКИ
// ==========================================
function updateHUD(maneuver, distance) {
    const navContainer = document.getElementById('navigation-container');
    const navArrow = document.getElementById('nav-arrow');
    const navDistance = document.getElementById('nav-distance');
    if (!navContainer || !navArrow || !navDistance) return;
    
    navContainer.style.display = 'block';
    if (distance > 1000) navDistance.innerText = (distance / 1000).toFixed(1) + ' км';
    else navDistance.innerText = distance + ' м';

    // Використовуємо HTML-сутності замість емодзі, щоб вони приймали колір і тіні
    let arrowSymbol = '&#8679;'; // ⬆ Прямо (векторний символ)
    let type = maneuver.type; let modifier = maneuver.modifier;
    
    if (type === 'roundabout') arrowSymbol = '&#8635;'; // 🔄 Кільце
    else if (modifier === 'right' || modifier === 'sharp right') arrowSymbol = '&#8680;'; // ➡ Праворуч
    else if (modifier === 'slight right') arrowSymbol = '&#8599;'; // ↗ Ледь праворуч
    else if (modifier === 'left' || modifier === 'sharp left') arrowSymbol = '&#8678;'; // ⬅ Ліворуч
    else if (modifier === 'slight left') arrowSymbol = '&#8598;'; // ↖ Ледь ліворуч
    else if (modifier === 'uturn') arrowSymbol = '&#8617;'; // ↩ Розворот

    navArrow.innerHTML = arrowSymbol; // innerHTML замість innerText для обробки коду символу
    navArrow.className = ''; 
    
    if (arrowSymbol === '&#8679;') navArrow.classList.add('static'); 
    else {
        if (distance > 500) navArrow.classList.add('static');
        else if (distance > 200) navArrow.classList.add('blink-slow');
        else if (distance > 20) navArrow.classList.add('blink-fast');
        else navArrow.classList.add('static'); 
    }
}
// ==========================================

// --- 3. ЦИКЛ НАВІГАЦІЇ ТА ПРОКЛАДАННЯ МАРШРУТУ ---
window.processNavigation = function() {
    if (!window.isSmartNavActive || window.currentRouteSteps.length === 0 || !window.currentLat || !window.currentLon) return;
    let step = window.currentRouteSteps[window.currentStepIndex];
    let distToStep = getDistance(window.currentLat, window.currentLon, step.maneuver.location[1], step.maneuver.location[0]);

    if (distToStep <= 20) {
        window.currentStepIndex++;
        if (window.currentStepIndex >= window.currentRouteSteps.length) {
            window.isSmartNavActive = false; clearInterval(window.navigationInterval);
            document.getElementById('navigation-container').style.display = 'none';
            if (window.speak) window.speak("Маршрут завершено. Ви прибули до місця призначення.");
            return;
        }
        step = window.currentRouteSteps[window.currentStepIndex];
        distToStep = getDistance(window.currentLat, window.currentLon, step.maneuver.location[1], step.maneuver.location[0]);
        if (window.speak && step.maneuver.modifier) {
            let action = "поверніть";
            if (step.maneuver.modifier.includes('right')) action = "тримайся правіше або поверни праворуч";
            if (step.maneuver.modifier.includes('left')) action = "тримайся лівіше або поверни ліворуч";
            window.speak(`Далі ${action}`);
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
        let res = await fetch(url); let data = await res.json();
        if (data.routes && data.routes.length > 0) {
            window.currentRouteSteps = data.routes[0].legs[0].steps; window.currentStepIndex = 0; window.isSmartNavActive = true;
            if (window.navigationInterval) clearInterval(window.navigationInterval);
            window.navigationInterval = setInterval(window.processNavigation, 1000); 
            if (window.speak) window.speak("Маршрут побудовано. Рушаємо!");
        }
    } catch(e) { if (window.speak) window.speak("Проблема з сервером навігації."); }
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
                return;
            }
        }
    } catch(e) {}
};
