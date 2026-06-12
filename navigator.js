// ==========================================
// МОДУЛЬ 2: НАВІГАЦІЯ, ЛОКАЦІЯ ТА ПАРКОВКА (navigator.js)
// ==========================================

// 1. Локальний пошук об'єктів (Кафе, заправки тощо)
window.searchLocalPlaces = function(query) {
    if (window.speak) window.speak(`Відкриваю результати пошуку: ${query}.`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
};

// 2. Збереження місця парковки
window.saveParking = function(lat, lon) {
    if (lat && lon) {
        localStorage.setItem('dusya_parking', JSON.stringify({lat: lat, lon: lon}));
        if (window.speak) window.speak("Зрозуміла, координати збережено. Машина під наглядом!");
    } else {
        if (window.speak) window.speak("Немає сигналу GPS.");
    }
};

// 3. Пошук збереженого авто
window.findCar = function() {
    let parkingData = localStorage.getItem('dusya_parking');
    if (parkingData) {
        let p = JSON.parse(parkingData); 
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking`, '_blank');
        if (window.speak) window.speak("Будую пішохідний маршрут до машини.");
    } else {
        if (window.speak) window.speak("Я не пам'ятаю, де ви припаркувалися.");
    }
};

// 4. Фундамент для майбутньої стрілочної навігації (Заглушка)
window.updateNavigationArrow = function(direction, distanceText) {
    // Тут в майбутньому ми будемо змінювати візуал великої стрілочки на екрані
    // Наприклад: arrowElement.className = direction;
    console.log(`Навігатор: ${direction} через ${distanceText}`);
};

// 5. Перевірка зон швидкості та Авто-гід
window.checkLocationAndZone = async function() {
    if (!window.currentLat || !window.currentLon) {
        if (window.isAutoGuideActive && window.lastPlaceName !== "") { 
            if (window.speak) window.speak(`Сигнал GPS слабкий, але ми все ще в районі ${window.lastPlaceName}.`); 
        }
        return;
    }
    try {
        let res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${window.currentLat}&lon=${window.currentLon}&format=json&accept-language=uk`);
        let data = await res.json();
        
        if (data && data.address) {
            let place = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.address.suburb;
            let isCurrentlyInCity = (data.address.city || data.address.town || data.address.village) ? true : false;
            if (place) window.currentPlaceName = place;

            if (window.isFirstLocationCheck) {
                window.isFirstLocationCheck = false; 
                window.isInCityZone = isCurrentlyInCity;
                if (!window.isBikeMode) {
                    if (window.isInCityZone) { 
                        if (window.speak) window.speak(`Привіт! Ми зараз у місті ${window.currentPlaceName}. Дозволена швидкість 50. Пристебни пасок.`); 
                    } else { 
                        if (window.speak) window.speak(`Вітаю! Ми на трасі, навколо ${window.currentPlaceName}. Обмеження 90. Не забудь пристебнутися!`); 
                    }
                }
                return;
            }

            // Робота Авто-гіда (Дружить із новим режимом "Друг")
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

            // Контроль швидкості
            if (!window.isBikeMode) {
                if (window.gpsSpeed > 80) { window.isInCityZone = false; return; }
                if (isCurrentlyInCity && !window.isInCityZone) { 
                    window.isInCityZone = true; 
                    if (window.speak) window.speak(`Попереду населений пункт ${window.currentPlaceName}. Скидаємо швидкість до 50.`); 
                } else if (!isCurrentlyInCity && window.isInCityZone) { 
                    window.isInCityZone = false; 
                    if (window.speak) window.speak(`Населений пункт закінчився. Можна 90.`); 
                }
            }
        }
    } catch(e) { 
        if (window.isAutoGuideActive && window.lastPlaceName !== "") { 
            if (window.speak) window.speak(`Не маю доступу до карти, але ми приблизно біля ${window.lastPlaceName}.`); 
        }
    }
};

// 6. Погода (геолокація + Open-Meteo)
window.handleWeatherCommand = async function(city) {
    const statusElement = document.getElementById('status-text');
    if (statusElement) statusElement.innerText = "Дуся: Шукаю погоду...";
    if (window.recognition) window.recognition.stop();
    
    let lat = window.currentLat; let lon = window.currentLon; let cityName = window.currentPlaceName;

    if (city) {
        try {
            let geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=uk`);
            let geoData = await geoRes.json();
            if (geoData.results && geoData.results.length > 0) { 
                lat = geoData.results[0].latitude; 
                lon = geoData.results[0].longitude; 
                cityName = "місті " + geoData.results[0].name; 
            } else { 
                if (window.speak) window.speak(`Не змогла знайти місто ${city}.`); return; 
            }
        } catch(e) { 
            if (window.speak) window.speak("Помилка пошуку міста."); return; 
        }
    }
    if (!lat || !lon) { 
        if (window.speak) window.speak("Координати не визначено."); return; 
    }

    try {
        let wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`);
        let wData = await wRes.json();
        if (wData && wData.current && wData.daily) {
            let tempNow = Math.round(wData.current.temperature_2m);
            let code = wData.current.weather_code;
            let tempMinTom = Math.round(wData.daily.temperature_2m_min[1]);
            let tempMaxTom = Math.round(wData.daily.temperature_2m_max[1]);
            let desc = "гарна погода";
            if (code === 0) desc = "ясно і сонячно"; 
            else if (code >= 1 && code <= 3) desc = "мінлива хмарність"; 
            else if (code === 45 || code === 48) desc = "туманно"; 
            else if (code >= 61 && code <= 65) desc = "йде дощ"; 
            else if (code >= 71 && code <= 75) desc = "йде сніг"; 
            else if (code >= 95) desc = "гроза";
            
            if (window.speak) window.speak(`Зараз тут ${tempNow} градусів, ${desc}. На завтра прогноз: від ${tempMinTom} до ${tempMaxTom} градусів.`);
        } else { 
            if (window.speak) window.speak("Не вдалося отримати метеодані."); 
        }
    } catch(e) { 
        if (window.speak) window.speak("Проблеми з метеосервером."); 
    }
};
