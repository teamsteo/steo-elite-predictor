/**
 * Match Enrichment Service — Zero-Cost Data Enrichment
 * 
 * Provides weather, fatigue, and record strength data for predictions.
 * All data sources are free and require no API keys:
 * - Weather: Open-Meteo API (free, no key) via ESPN venue city
 * - Fatigue: Computed from match schedule (days rest, back-to-back)
 * - Records: Parsed from ESPN "W-L-T" strings (e.g., "15-5-2")
 * 
 * Graceful: Never throws. Returns partial data on failure.
 */

// ============================================
// TYPES
// ============================================

export interface WeatherData {
  temperature: number;       // °C
  windSpeed: number;         // km/h
  precipitation: number;     // mm
  condition: string;         // 'clear' | 'rain' | 'wind' | 'extreme'
  impact: number;            // -1 (extreme negative) to +1 (perfect)
  riskLevel: 'low' | 'medium' | 'high';
}

export interface FatigueData {
  homeFatigueScore: number;     // 0 (fully rested) to 1 (extreme fatigue)
  awayFatigueScore: number;
  fatigueDifferential: number;  // home - away (negative = home more fatigued)
  daysSinceLastHome: number;
  daysSinceLastAway: number;
  homeBackToBack: boolean;
  awayBackToBack: boolean;
}

export interface RecordStrength {
  homeWinPct: number;         // 0 to 1 (ties counted as half-wins)
  awayWinPct: number;
  homeWinPctDiff: number;     // home - away
  totalGamesHome: number;
  totalGamesAway: number;
}

export interface MatchEnrichment {
  weather?: WeatherData;
  fatigue?: FatigueData;
  recordStrength?: RecordStrength;
}

interface EnrichmentInput {
  homeTeam: string;
  awayTeam: string;
  date: string;
  sport: string;
  league?: string;
  venueCity?: string;
  venueCountry?: string;
  homeRecord?: string;      // e.g. "15-5-2"
  awayRecord?: string;      // e.g. "12-8-3"
  homeLastMatchDate?: string;
  awayLastMatchDate?: string;
}

// ============================================
// CACHES
// ============================================

// 6h weather cache: city → { data, timestamp }
const weatherCache = new Map<string, { data: WeatherData; timestamp: number }>();
const WEATHER_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// 1h geocoding cache: city → { lat, lon, timestamp }
const geocodeCache = new Map<string, { lat: number; lon: number; timestamp: number }>();
const GEOCODE_CACHE_TTL = 1 * 60 * 60 * 1000; // 1 hour

// ============================================
// WEATHER (Open-Meteo — Free, No API Key)
// ============================================

async function geocodeCity(city: string, country?: string): Promise<{ lat: number; lon: number } | null> {
  if (!city) return null;
  const cacheKey = `${city.toLowerCase()}_${(country || '').toLowerCase()}`;
  
  // Check cache
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < GEOCODE_CACHE_TTL) {
    return { lat: cached.lat, lon: cached.lon };
  }
  
  try {
    const query = encodeURIComponent(city + (country ? `,${country}` : ''));
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=1&language=fr`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    
    const data = await resp.json();
    if (!data.results || data.results.length === 0) return null;
    
    const result = data.results[0];
    const lat = result.latitude;
    const lon = result.longitude;
    
    geocodeCache.set(cacheKey, { lat, lon, timestamp: Date.now() });
    return { lat, lon };
  } catch {
    return null;
  }
}

async function fetchWeather(lat: number, lon: number, dateStr: string): Promise<WeatherData | null> {
  const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}_${dateStr}`;
  
  // Check cache
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < WEATHER_CACHE_TTL) {
    return cached.data;
  }
  
  try {
    // Get hourly forecast for the match date
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,windspeed_10m&start_date=${dateStr}&end_date=${dateStr}&timezone=UTC`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    
    const data = await resp.json();
    const hourly = data.hourly;
    if (!hourly || !hourly.time || hourly.time.length === 0) return null;
    
    // Use midday conditions as representative (hour index ~12)
    const midIdx = Math.min(12, hourly.time.length - 1);
    const temp = hourly.temperature_2m?.[midIdx] ?? 15;
    const precip = hourly.precipitation?.[midIdx] ?? 0;
    const wind = hourly.windspeed_10m?.[midIdx] ?? 10;
    
    // Also check max values during the day
    const maxWind = Math.max(...(hourly.windspeed_10m || [0]));
    const totalPrecip = (hourly.precipitation || []).reduce((s: number, v: number) => s + v, 0);
    
    const weatherData = computeWeatherMetrics(temp, maxWind, totalPrecip);
    
    weatherCache.set(cacheKey, { data: weatherData, timestamp: Date.now() });
    return weatherData;
  } catch {
    return null;
  }
}

function computeWeatherMetrics(temperature: number, windSpeed: number, precipitation: number): WeatherData {
  let condition = 'clear';
  let impact = 0;
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  
  // Temperature impact (ideal: 15-25°C)
  if (temperature < -10 || temperature > 40) {
    impact -= 0.6;
    riskLevel = 'high';
    condition = 'extreme';
  } else if (temperature < 0 || temperature > 35) {
    impact -= 0.4;
    riskLevel = 'medium';
    condition = 'extreme';
  } else if (temperature < 5 || temperature > 30) {
    impact -= 0.2;
    riskLevel = 'medium';
  }
  
  // Wind impact
  if (windSpeed > 60) {
    impact -= 0.5;
    riskLevel = 'high';
    condition = condition === 'extreme' ? 'extreme' : 'wind';
  } else if (windSpeed > 40) {
    impact -= 0.3;
    if (riskLevel === 'low') riskLevel = 'medium';
    condition = 'wind';
  } else if (windSpeed > 25) {
    impact -= 0.1;
    if (riskLevel === 'low') riskLevel = 'medium';
  }
  
  // Precipitation impact
  if (precipitation > 20) {
    impact -= 0.5;
    riskLevel = 'high';
    condition = condition === 'extreme' ? 'extreme' : 'rain';
  } else if (precipitation > 5) {
    impact -= 0.3;
    if (riskLevel === 'low') riskLevel = 'medium';
    condition = 'rain';
  } else if (precipitation > 0) {
    impact -= 0.1;
  }
  
  return {
    temperature,
    windSpeed,
    precipitation,
    condition,
    impact: Math.max(-1, Math.min(1, impact)),
    riskLevel,
  };
}

// ============================================
// FATIGUE
// ============================================

function computeFatigue(input: EnrichmentInput): FatigueData {
  const now = new Date();
  
  // Days since last match
  const daysSinceLastHome = input.homeLastMatchDate
    ? Math.max(0, Math.floor((now.getTime() - new Date(input.homeLastMatchDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 3; // Default: 3 days (moderate rest)
  
  const daysSinceLastAway = input.awayLastMatchDate
    ? Math.max(0, Math.floor((now.getTime() - new Date(input.awayLastMatchDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 3;
  
  // Back-to-back detection (<1 day = back-to-back)
  const homeBackToBack = daysSinceLastHome <= 1;
  const awayBackToBack = daysSinceLastAway <= 1;
  
  // Fatigue score: 0 (fully rested, 7+ days) to 1 (extreme)
  // Using exponential decay curve
  const homeFatigueScore = homeBackToBack ? 1.0 : Math.max(0, 1 - daysSinceLastHome / 7);
  const awayFatigueScore = awayBackToBack ? 1.0 : Math.max(0, 1 - daysSinceLastAway / 7);
  
  // Differential: negative = home more fatigued
  const fatigueDifferential = homeFatigueScore - awayFatigueScore;
  
  return {
    homeFatigueScore: Math.round(homeFatigueScore * 1000) / 1000,
    awayFatigueScore: Math.round(awayFatigueScore * 1000) / 1000,
    fatigueDifferential: Math.round(fatigueDifferential * 1000) / 1000,
    daysSinceLastHome,
    daysSinceLastAway,
    homeBackToBack,
    awayBackToBack,
  };
}

// ============================================
// RECORD STRENGTH (ESPN "W-L-T" parsing)
// ============================================

function parseRecord(record: string): { winPct: number; totalGames: number } {
  if (!record) return { winPct: 0.5, totalGames: 0 };
  
  const parts = record.trim().split('-');
  if (parts.length < 2) return { winPct: 0.5, totalGames: 0 };
  
  const wins = parseInt(parts[0], 10) || 0;
  const losses = parseInt(parts[1], 10) || 0;
  const ties = parts.length > 2 ? (parseInt(parts[2], 10) || 0) : 0;
  
  const totalGames = wins + losses + ties;
  if (totalGames === 0) return { winPct: 0.5, totalGames: 0 };
  
  // Win% with ties counted as half-wins
  const winPct = (wins + ties * 0.5) / totalGames;
  
  return { winPct: Math.round(winPct * 1000) / 1000, totalGames };
}

function computeRecordStrength(input: EnrichmentInput): RecordStrength {
  const home = parseRecord(input.homeRecord || '');
  const away = parseRecord(input.awayRecord || '');
  
  return {
    homeWinPct: home.winPct,
    awayWinPct: away.winPct,
    homeWinPctDiff: Math.round((home.winPct - away.winPct) * 1000) / 1000,
    totalGamesHome: home.totalGames,
    totalGamesAway: away.totalGames,
  };
}

// ============================================
// MAIN EXPORT
// ============================================

export async function enrichMatch(input: EnrichmentInput): Promise<MatchEnrichment> {
  const result: MatchEnrichment = {};
  
  // --- WEATHER (non-blocking, only if venue available) ---
  if (input.venueCity) {
    try {
      const coords = await geocodeCity(input.venueCity, input.venueCountry);
      if (coords) {
        // Extract date portion for Open-Meteo
        const dateStr = input.date ? input.date.split('T')[0] : new Date().toISOString().split('T')[0];
        const weather = await fetchWeather(coords.lat, coords.lon, dateStr);
        if (weather) {
          result.weather = weather;
        }
      }
    } catch (e) {
      console.log('⚠️ Weather enrichment failed:', e);
    }
  }
  
  // --- FATIGUE (always computed, no external call) ---
  result.fatigue = computeFatigue(input);
  
  // --- RECORD STRENGTH (always computed if records available) ---
  if (input.homeRecord || input.awayRecord) {
    result.recordStrength = computeRecordStrength(input);
  }
  
  return result;
}
