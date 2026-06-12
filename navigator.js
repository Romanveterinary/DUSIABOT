// ==========================================
// МОДУЛЬ 2: НАВІГАЦІЯ, ЛОКАЦІЯ ТА ПАРКОВКА (navigator.js)
// ==========================================

window.currentRouteSteps = [];
window.currentStepIndex = 0;
window.isSmartNavActive = false;
window.navigationInterval = null;

// --- 1. АДРЕСНА КНИГА (ЗБЕРЕЖЕННЯ ТОЧОК) ---
window.saveAddress = function(name, lat, lon) {
    let book = JSON.parse(localStorage.getItem('dusya_address_book') || '{}');
    book[name.toLowerCase()] = { lat, lon };
    localStorage.setItem('dusya_address_book', JSON.stringify(book));
    if (window.speak) window.speak(`Точку ${name} успішно збережено в адресну книгу.`);
};

// --- 2. МАТЕМАТИКА ВІДСТАНЕЙ (Формула Гаверсина) ---
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Радіус Землі в метрах
    const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c); // Відстань у метрах
}

// --- 3. ВІЗУАЛІЗАЦІЯ HUD СТРІЛОК ---
function updateHUD(maneuver, distance) {
    const navContainer = document.getElementById('navigation-container');
    const navArrow = document.getElementById('nav-arrow');
    const navDistance = document.getElementById('nav-distance');
    
    if (!navContainer || !navArrow || !navDistance) return;
    navContainer.style.display = 'block';

    // Форматування дистанції
    if (distance > 1000) navDistance.innerText = (distance / 1000).toFixed(1) + ' км';
    else navDistance.innerText = distance + ' м';

    // Вибір іконки стрілки
    let arrowSymbol = '⬆️';
    let type = maneuver.type;
    let modifier = maneuver.modifier;

    if (type === 'roundabout') arrowSymbol = '🔄';
    else if (modifier === 'right' || modifier === 'sharp right') arrowSymbol = '➡️';
    else if (modifier === 'slight right') arrowSymbol = '↗️';
    else if (modifier === 'left' || modifier === 'sharp left') arrowSymbol = '⬅️';
    else if (modifier === 'slight left') arrowSymbol = '↖️';
    else if (modifier === 'uturn') arrowSymbol = '↩️';

    navArrow.innerText = arrowSymbol;

    // Динамічне блимання (Поворотник)
    navArrow.className = ''; // Очищаємо класи
    if (arrowSymbol === '⬆️') {
        navArrow.classList.add('static'); // Прямо ніколи не блимає
    } else {
        if (distance > 500) navArrow.classList.add('static');
        else if (distance > 200) navArrow.classList.add('blink-slow');
        else if (distance > 20) navArrow.classList.add('blink-fast');
        else navArrow.classList.add('static'); // Горить постійно перед самим поворотом
    }
}

// --- 4. ОСНОВНИЙ ЦИКЛ НАВІГАЦІЇ (Оновлюється щосекунди) ---
window.processNavigation = function() {
    if (!window.isSmartNavActive || window.currentRouteSteps.length === 0) return;
    if (!window.currentLat || !window.currentLon) return;

    let step = window.currentRouteSteps[window.currentStepIndex];
    let distToStep = getDistance(window.currentLat, window.currentLon, step.maneuver.location[1], step.maneuver.location[0]);

    // Якщо під'їхали до маневру ближче ніж на 20 метрів - переходимо до наступного
    if (distToStep <= 20) {
        window.currentStepIndex++;
        if (window.currentStepIndex >= window.currentRouteSteps.length) {
            window.isSmartNavActive = false;
            clearInterval(window.navigationInterval);
            document.getElementById('navigation-container').style.display = 'none';
            if (window.speak) window.speak("Маршрут завершено. Ви прибули до місця призначення.");
            return;
        }
        step = window.currentRouteSteps[window.currentStepIndex];
        distToStep = getDistance(window.currentLat, window.currentLon, step.maneuver.location[1], step.maneuver.location[0]);
        
        // Озвучуємо новий маневр
        if (window.speak && step.maneuver.modifier) {
            let action = "поверніть";
            if (step.maneuver.modifier.includes('right')) action = "тримайся правіше або поверни праворуч";
            if (step.maneuver.modifier.includes('left')) action = "тримайся лівіше або поверни ліворуч";
            window.speak(`Далі ${action}`);
        }
    }

    updateHUD(step.maneuver, distToStep);

    // Контроль "Коридору": якщо відхилилися більше ніж на 100м від точки повороту і віддаляємось - перебудова
    // (Спрощена логіка для легковагового скрипта)
    if (distToStep > 1500) { 
        // Тут в майбутньому можна додати авто-перебудову (Rerouting)
    }
};

// --- 5. ПРОКЛАДАННЯ МАРШРУТУ (OSRM API) ---
window.startSmartNavigation = async function(targetName) {
    let book = JSON.parse(localStorage.getItem('dusya_address_book') || '{}');
    let target = book[targetName.toLowerCase()];
    
    if (!target) {
        if (window.speak) window.speak(`Я не знаю координати для точки ${targetName}. Будь ласка, збережіть її на мапі.`);
        return;
    }
    if (!window.currentLat || !window.currentLon) {
        if (window.speak) window.speak("Чекаю на сигнал супутників GPS.");
        return;
    }

    if (window.speak) window.speak(`Будую маршрут до точки ${targetName}.`);
    
    try {
        // OSRM API приймає координати у форматі lon,lat
        let url = `https://router.project-osrm.org/route/v1/driving/${window.currentLon},${window.currentLat};${target.lon},${target.lat}?steps=true&geometries=geojson&overview=false`;
        let res = await fetch(url);
        let data = await res.json();

        if (data.routes && data.routes.length > 0) {
            window.currentRouteSteps = data.routes[0].legs[0].steps;
            window.currentStepIndex = 0;
            window.isSmartNavActive = true;
            
            if (window.navigationInterval) clearInterval(window.navigationInterval);
            window.navigationInterval = setInterval(window.processNavigation, 1000); // Оновлюємо стрілки кожну секунду
            
            if (window.speak) window.speak("Маршрут побудовано. Рушаємо!");
        }
    } catch(e) {
        if (window.speak) window.speak("Проблема з сервером навігації.");
    }
};

// --- 6. ІНШІ ЛОКАЛЬНІ ФУНКЦІЇ ---
window.searchLocalPlaces = function(query) {
    if (window.speak) window.speak(`Відкриваю результати пошуку: ${query}.`);
    window.open(`http://googleusercontent.com/maps.google.com/?q=${encodeURIComponent(query)}`, '_blank');
};

window.saveParking = function(lat, lon) {
    if (lat && lon) {
        localStorage.setItem('dusya_parking', JSON.stringify({lat: lat, lon: lon}));
        if (window.speak) window.speak("Зрозуміла, координати збережено. Машина під наглядом!");
    } else {
        if (window.speak) window.speak("Немає сигналу GPS.");
    }
};

window.findCar = function() {
    let parkingData = localStorage.getItem('dusya_parking');
    if (parkingData) {
        let p = JSON.parse(parkingData); 
        window.open(`http://googleusercontent.com/maps.google.com/?daddr=${p.lat},${p.lon}&dirflg=w`, '_blank');
        if (window.speak) window.speak("Будую пішохідний маршрут до машини.");
    } else {
        if (window.speak) window.speak("Я не пам'ятаю, де ви припаркувалися.");
    }
};

// Перевірка зон швидкості, Авто-гід (з попередньої версії)
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
                return;
            }

            if (window.isAutoGuideActive && place && place !== window.lastPlaceName) {
                window.lastPlaceName = place;
                const statusElement = document.getElementById('status-text');
                if (statusElement) statusElement.innerText = "Дуся: Авто-гід розповідає...";
                if (window.askDusyaAI && window.speak) {
                    let guideResponse = await window.askDusyaAI(`Ми зараз проїжджаємо населений пункт ${place}. Розкажи короткий цікавий історичний факт. 2-3 речення.`);
                    window.speak(guideResponse); 
                }
                return;
            }

            if (!window.isBikeMode) {
                if (window.gpsSpeed > 80) { window.isInCityZone = false; return; }
                if (isCurrentlyInCity && !window.isInCityZone) { 
                    window.isInCityZone = true; if (window.speak) window.speak(`Попереду населений пункт ${window.currentPlaceName}. Скидаємо швидкість до 50.`); 
                } else if (!isCurrentlyInCity && window.isInCityZone) { 
                    window.isInCityZone = false; if (window.speak) window.speak(`Населений пункт закінчився. Можна 90.`); 
                }
            }
        }
    } catch(e) {}
};

window.handleWeatherCommand = async function(city) {
    let lat = window.currentLat; let lon = window.currentLon; let cityName = window.currentPlaceName;
    if (city) {
        try {
            let geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=uk`);
            let geoData = await geoRes.json();
            if (geoData.results && geoData.results.length > 0) { lat = geoData.results[0].latitude; lon = geoData.results[0].longitude; cityName = geoData.results[0].name; } 
            else { if (window.speak) window.speak(`Не змогла знайти місто ${city}.`); return; }
        } catch(e) { return; }
    }
    if (!lat || !lon) return;

    try {
        let wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`);
        let wData = await wRes.json();
        if (wData && wData.current && wData.daily) {
            let tempNow = Math.round(wData.current.temperature_2m);
            let code = wData.current.weather_code;
            let desc = "гарна погода";
            if (code === 0) desc = "ясно і сонячно"; else if (code >= 1 && code <= 3) desc = "мінлива хмарність"; else if (code === 45 || code === 48) desc = "туманно"; else if (code >= 61 && code <= 65) desc = "йде дощ"; else if (code >= 71 && code <= 75) desc = "йде сніг"; else if (code >= 95) desc = "гроза";
            if (window.speak) window.speak(`Зараз тут ${tempNow} градусів, ${desc}. На завтра від ${Math.round(wData.daily.temperature_2m_min[1])} до ${Math.round(wData.daily.temperature_2m_max[1])}.`);
        }
    } catch(e) {}
};
