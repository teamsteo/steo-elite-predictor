/**
 * Weather Service - Données Météo pour Football
 * 
 * Source: Open-Meteo API (gratuit, pas de clé API requise)
 * 
 * Données extraites:
 * - Température (actuelle + prévisions)
 * - Précipitations (pluie, neige)
 * - Vent (vitesse, direction)
 * - Humidité
 * - Conditions de jeu (idéal, difficile, extrême)
 * 
 * Impact sur les prédictions:
 * - Pluie: Plus de buts possibles, jeu plus direct
 * - Vent: Moins de précision, plus de centres
 * - Chaleur: Fatigue accrue, moins de buts en 2ème MT
 * - Froid: Risque de blessures accru
 */

import ZAI from 'z-ai-web-dev-sdk';

// ============================================
// TYPES
// ============================================

export interface WeatherData {
  location: string;
  latitude: number;
  longitude: number;
  
  // Conditions actuelles
  current: {
    temperature: number; // Celsius
    feelsLike: number;
    humidity: number; // %
    windSpeed: number; // km/h
    windDirection: number; // degrés
    precipitation: number; // mm
    weatherCode: number; // Code WMO
    condition: WeatherCondition;
  };
  
  // Prévisions pour le match
  forecast?: {
    temperature: number;
    precipitationProbability: number; // %
    windSpeed: number;
    condition: WeatherCondition;
  };
  
  // Impact sur le match
  impact: {
    overall: 'ideal' | 'minor' | 'moderate' | 'significant' | 'extreme';
    factors: string[];
    goalsAdjustment: number; // -0.3 à +0.3
    riskLevel: 'low' | 'medium' | 'high';
  };
  
  // Métadonnées
  fetchedAt: string;
  source: string;
}

export type WeatherCondition = 
  | 'clear' 
  | 'partly_cloudy' 
  | 'cloudy' 
  | 'fog' 
  | 'drizzle' 
  | 'rain' 
  | 'heavy_rain' 
  | 'snow' 
  | 'thunderstorm'
  | 'extreme';

// ============================================
// MAPPINGS
// ============================================

// Coordonnées des stades principaux
const STADIUM_COORDINATES: Record<string, { lat: number; lon: number; city: string }> = {
  // Premier League
  'Manchester City': { lat: 53.4831, lon: -2.2004, city: 'Manchester' },
  'Manchester United': { lat: 53.4631, lon: -2.2913, city: 'Manchester' },
  'Arsenal': { lat: 51.5549, lon: -0.1084, city: 'London' },
  'Chelsea': { lat: 51.4816, lon: -0.1910, city: 'London' },
  'Tottenham': { lat: 51.6033, lon: -0.0657, city: 'London' },
  'Liverpool': { lat: 53.4308, lon: -2.9608, city: 'Liverpool' },
  'Everton': { lat: 53.4388, lon: -2.9663, city: 'Liverpool' },
  'Newcastle': { lat: 54.9756, lon: -1.6216, city: 'Newcastle' },
  'Brighton': { lat: 50.8618, lon: -0.0833, city: 'Brighton' },
  'Aston Villa': { lat: 52.5092, lon: -1.8849, city: 'Birmingham' },
  'West Ham': { lat: 51.5386, lon: -0.0165, city: 'London' },
  'Crystal Palace': { lat: 51.3981, lon: -0.0854, city: 'London' },
  
  // Ligue 1
  'Paris Saint-Germain': { lat: 48.8414, lon: 2.2530, city: 'Paris' },
  'Marseille': { lat: 43.2698, lon: 5.3959, city: 'Marseille' },
  'Lyon': { lat: 45.7654, lon: 4.9819, city: 'Lyon' },
  'Monaco': { lat: 43.7274, lon: 7.4156, city: 'Monaco' },
  'Lille': { lat: 50.6129, lon: 3.1315, city: 'Lille' },
  'Nice': { lat: 43.7046, lon: 7.1930, city: 'Nice' },
  'Lens': { lat: 50.4314, lon: 2.8192, city: 'Lens' },
  'Rennes': { lat: 48.1081, lon: -1.6791, city: 'Rennes' },
  
  // La Liga
  'Real Madrid': { lat: 40.4531, lon: -3.6883, city: 'Madrid' },
  'Barcelona': { lat: 41.3809, lon: 2.1228, city: 'Barcelona' },
  'Atletico Madrid': { lat: 40.4361, lon: -3.5992, city: 'Madrid' },
  'Sevilla': { lat: 37.3855, lon: -5.9839, city: 'Sevilla' },
  'Valencia': { lat: 39.4748, lon: -0.3583, city: 'Valencia' },
  'Real Sociedad': { lat: 43.3008, lon: -1.9678, city: 'San Sebastian' },
  'Athletic Bilbao': { lat: 43.2642, lon: -2.9494, city: 'Bilbao' },
  
  // Bundesliga
  'Bayern Munich': { lat: 48.2188, lon: 11.6247, city: 'Munich' },
  'Dortmund': { lat: 51.4927, lon: 7.4519, city: 'Dortmund' },
  'RB Leipzig': { lat: 51.3458, lon: 12.3498, city: 'Leipzig' },
  'Leverkusen': { lat: 51.0381, lon: 7.0024, city: 'Leverkusen' },
  'Frankfurt': { lat: 50.0688, lon: 8.6457, city: 'Frankfurt' },
  'Wolfsburg': { lat: 52.4338, lon: 10.8025, city: 'Wolfsburg' },
  
  // Serie A
  'Juventus': { lat: 45.1094, lon: 7.6414, city: 'Turin' },
  'Inter': { lat: 45.4781, lon: 9.2206, city: 'Milan' },
  'AC Milan': { lat: 45.4781, lon: 9.2206, city: 'Milan' },
  'Napoli': { lat: 40.8280, lon: 14.1927, city: 'Naples' },
  'Roma': { lat: 41.9339, lon: 12.4547, city: 'Rome' },
  'Lazio': { lat: 41.9339, lon: 12.4547, city: 'Rome' },
  'Atalanta': { lat: 45.7074, lon: 9.6800, city: 'Bergamo' },
  
  // Liga Portugal
  'Benfica': { lat: 38.7528, lon: -9.1847, city: 'Lisbon' },
  'Porto': { lat: 41.1618, lon: -8.5836, city: 'Porto' },
  'Sporting CP': { lat: 38.7611, lon: -9.1606, city: 'Lisbon' },
  
  // Eredivisie
  'Ajax': { lat: 52.3141, lon: 4.9444, city: 'Amsterdam' },
  'PSV Eindhoven': { lat: 51.4416, lon: 5.4674, city: 'Eindhoven' },
  'Feyenoord': { lat: 51.8938, lon: 4.5230, city: 'Rotterdam' },
};

// Codes WMO vers conditions
const WMO_CODE_TO_CONDITION: Record<number, WeatherCondition> = {
  0: 'clear',
  1: 'clear',
  2: 'partly_cloudy',
  3: 'cloudy',
  45: 'fog',
  48: 'fog',
  51: 'drizzle',
  53: 'drizzle',
  55: 'drizzle',
  56: 'drizzle',
  57: 'drizzle',
  61: 'rain',
  63: 'rain',
  65: 'heavy_rain',
  66: 'rain',
  67: 'heavy_rain',
  71: 'snow',
  73: 'snow',
  75: 'snow',
  77: 'snow',
  80: 'rain',
  81: 'rain',
  82: 'heavy_rain',
  85: 'snow',
  86: 'snow',
  95: 'thunderstorm',
  96: 'thunderstorm',
  99: 'extreme',
};

// Cache
const weatherCache = new Map<string, { data: WeatherData; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

/**
 * Récupère les données météo pour un match
 */
export async function getMatchWeather(
  homeTeam: string,
  matchDate?: Date
): Promise<WeatherData | null> {
  console.log(`🌤️ Récupération météo: ${homeTeam}`);
  
  // Trouver les coordonnées du stade
  const stadium = findStadiumCoordinates(homeTeam);
  if (!stadium) {
    console.log(`⚠️ Stade non trouvé pour ${homeTeam}`);
    return null;
  }
  
  // Vérifier le cache
  const cacheKey = `${homeTeam}_${stadium.lat}_${stadium.lon}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const zai = await ZAI.create();
    
    // Utiliser l'API Open-Meteo (gratuite)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${stadium.lat}&longitude=${stadium.lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      // Fallback: web search
      return await searchWeatherFallback(homeTeam, stadium.city);
    }
    
    const data = await response.json();
    
    // Parser les données
    const weatherCode = data.current?.weather_code || 0;
    const condition = WMO_CODE_TO_CONDITION[weatherCode] || 'clear';
    
    const weather: WeatherData = {
      location: stadium.city,
      latitude: stadium.lat,
      longitude: stadium.lon,
      current: {
        temperature: data.current?.temperature_2m || 15,
        feelsLike: data.current?.temperature_2m || 15,
        humidity: data.current?.relative_humidity_2m || 50,
        windSpeed: data.current?.wind_speed_10m || 0,
        windDirection: data.current?.wind_direction_10m || 0,
        precipitation: data.current?.precipitation || 0,
        weatherCode,
        condition,
      },
      impact: calculateWeatherImpact(condition, data.current),
      fetchedAt: new Date().toISOString(),
      source: 'Open-Meteo',
    };
    
    // Mettre en cache
    weatherCache.set(cacheKey, { data: weather, timestamp: Date.now() });
    
    console.log(`✅ Météo: ${stadium.city} - ${weather.current.temperature}°C, ${condition}`);
    
    return weather;
    
  } catch (error) {
    console.error('Erreur météo:', error);
    return await searchWeatherFallback(homeTeam, stadium.city);
  }
}

/**
 * Trouve les coordonnées d'un stade
 */
function findStadiumCoordinates(teamName: string): { lat: number; lon: number; city: string } | null {
  const normalizedName = teamName.toLowerCase().trim();
  
  for (const [team, coords] of Object.entries(STADIUM_COORDINATES)) {
    if (team.toLowerCase().includes(normalizedName) || normalizedName.includes(team.toLowerCase())) {
      return coords;
    }
  }
  
  return null;
}

/**
 * Fallback: recherche web pour la météo
 */
async function searchWeatherFallback(
  teamName: string,
  city: string
): Promise<WeatherData | null> {
  try {
    const zai = await ZAI.create();
    
    const searchResult = await zai.functions.invoke('web_search', {
      query: `weather ${city} today temperature`,
      num: 3
    });
    
    if (!Array.isArray(searchResult) || searchResult.length === 0) {
      return null;
    }
    
    // Parser les résultats
    let temperature = 15;
    let condition: WeatherCondition = 'clear';
    
    for (const item of searchResult as any[]) {
      const text = `${item.name} ${item.snippet}`.toLowerCase();
      
      // Extraire température
      const tempMatch = text.match(/(\d+)\s*°c/);
      if (tempMatch) {
        temperature = parseInt(tempMatch[1]);
      }
      
      // Détecter conditions
      if (text.includes('rain') || text.includes('pluie')) condition = 'rain';
      else if (text.includes('cloudy') || text.includes('nuageux')) condition = 'cloudy';
      else if (text.includes('snow') || text.includes('neige')) condition = 'snow';
      else if (text.includes('storm') || text.includes('orage')) condition = 'thunderstorm';
    }
    
    const weather: WeatherData = {
      location: city,
      latitude: 0,
      longitude: 0,
      current: {
        temperature,
        feelsLike: temperature,
        humidity: 50,
        windSpeed: 10,
        windDirection: 0,
        precipitation: condition === 'rain' ? 5 : 0,
        weatherCode: 0,
        condition,
      },
      impact: calculateWeatherImpact(condition, {}),
      fetchedAt: new Date().toISOString(),
      source: 'Web Search',
    };
    
    return weather;
    
  } catch (error) {
    console.error('Erreur fallback météo:', error);
    return null;
  }
}

/**
 * Calcule l'impact de la météo sur le match
 */
function calculateWeatherImpact(
  condition: WeatherCondition,
  currentData: Record<string, any>
): WeatherData['impact'] {
  const factors: string[] = [];
  let goalsAdjustment = 0;
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  let overall: WeatherData['impact']['overall'] = 'ideal';
  
  // Analyser les conditions
  switch (condition) {
    case 'clear':
    case 'partly_cloudy':
      factors.push('Conditions idéales');
      overall = 'ideal';
      break;
      
    case 'cloudy':
      factors.push('Temps couvert, conditions normales');
      overall = 'minor';
      break;
      
    case 'fog':
      factors.push('Brouillard: visibilité réduite');
      overall = 'moderate';
      riskLevel = 'medium';
      goalsAdjustment = -0.1;
      break;
      
    case 'drizzle':
      factors.push('Bruine: terrain glissant');
      overall = 'minor';
      goalsAdjustment = 0.05;
      break;
      
    case 'rain':
      factors.push('Pluie: jeu plus direct, plus de centres');
      overall = 'moderate';
      riskLevel = 'medium';
      goalsAdjustment = 0.1;
      break;
      
    case 'heavy_rain':
      factors.push('Forte pluie: risque d\'annulation');
      overall = 'significant';
      riskLevel = 'high';
      goalsAdjustment = 0.15;
      break;
      
    case 'snow':
      factors.push('Neige: conditions difficiles');
      overall = 'significant';
      riskLevel = 'high';
      goalsAdjustment = -0.2;
      break;
      
    case 'thunderstorm':
      factors.push('Orage: risque d\'interruption');
      overall = 'extreme';
      riskLevel = 'high';
      goalsAdjustment = -0.3;
      break;
      
    case 'extreme':
      factors.push('Conditions extrêmes');
      overall = 'extreme';
      riskLevel = 'high';
      goalsAdjustment = -0.3;
      break;
  }
  
  // Analyser la température
  const temp = currentData.temperature_2m || 15;
  if (temp < 0) {
    factors.push('Température négative: risque de gel');
    riskLevel = 'high';
    goalsAdjustment -= 0.1;
  } else if (temp > 30) {
    factors.push('Chaleur: fatigue accrue');
    riskLevel = 'medium';
    goalsAdjustment -= 0.1;
  } else if (temp > 35) {
    factors.push('Canicule: match potentiellement reporté');
    riskLevel = 'high';
    overall = 'extreme';
  }
  
  // Analyser le vent
  const windSpeed = currentData.wind_speed_10m || 0;
  if (windSpeed > 30) {
    factors.push(`Vent fort (${windSpeed} km/h): centres difficiles`);
    overall = overall === 'ideal' ? 'minor' : overall;
  } else if (windSpeed > 50) {
    factors.push(`Vent très fort: jeu aérien compromis`);
    overall = 'significant';
    riskLevel = 'high';
  }
  
  // Limiter l'ajustement
  goalsAdjustment = Math.max(-0.3, Math.min(0.3, goalsAdjustment));
  
  return {
    overall,
    factors,
    goalsAdjustment: Math.round(goalsAdjustment * 100) / 100,
    riskLevel,
  };
}

/**
 * Formate la météo pour l'affichage
 */
export function formatWeatherForDisplay(weather: WeatherData): string {
  const conditionEmoji: Record<WeatherCondition, string> = {
    clear: '☀️',
    partly_cloudy: '⛅',
    cloudy: '☁️',
    fog: '🌫️',
    drizzle: '🌦️',
    rain: '🌧️',
    heavy_rain: '⛈️',
    snow: '❄️',
    thunderstorm: '⛈️',
    extreme: '⚠️',
  };
  
  const emoji = conditionEmoji[weather.current.condition] || '🌡️';
  
  return `${emoji} ${weather.current.temperature}°C | ${weather.impact.factors[0] || 'Conditions normales'}`;
}

/**
 * Vide le cache météo
 */
export function clearWeatherCache(): void {
  weatherCache.clear();
  console.log('🗑️ Cache météo vidé');
}

// Export par défaut
const WeatherService = {
  getMatchWeather,
  formatWeatherForDisplay,
  clearCache: clearWeatherCache,
};

export default WeatherService;
