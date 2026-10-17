import React from 'react';
import type { WeatherSnapshot } from '../lib/api';

// WMO weather codes -> short label + emoji.
const describe = (code: number, isDay: boolean): { label: string; icon: string } => {
  if (code === 0) return { label: isDay ? 'Clear sky' : 'Clear night', icon: isDay ? '☀️' : '🌙' };
  if (code === 1 || code === 2) return { label: 'Partly cloudy', icon: isDay ? '⛅' : '☁️' };
  if (code === 3) return { label: 'Overcast', icon: '☁️' };
  if (code === 45 || code === 48) return { label: 'Foggy', icon: '🌫️' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: '🌦️' };
  if (code >= 61 && code <= 67) return { label: 'Rain', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: '🌨️' };
  if (code >= 80 && code <= 82) return { label: 'Rain showers', icon: '🌦️' };
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: '🌨️' };
  if (code >= 95) return { label: 'Thunderstorm', icon: '⛈️' };
  return { label: 'Weather', icon: '🌡️' };
};

const round = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null);

const WeatherCard: React.FC<{ data: WeatherSnapshot }> = ({ data }) => {
  const current = data.current || {};
  const temperature = round(current.temperature_2m);
  if (temperature === null) return null;
  const { label, icon } = describe(Number(current.weather_code), Number(current.is_day) !== 0);
  const days = (data.daily?.time || []).slice(0, 3);

  return (
    <div className="my-2 w-full max-w-[420px] rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" aria-label={`Weather for ${data.label}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-zinc-500 dark:text-zinc-400">{data.label}</p>
          <p className="mt-1 text-[40px] font-semibold leading-none tracking-tight">{temperature}°C</p>
          <p className="mt-1 text-[14px] text-zinc-600 dark:text-zinc-300">{label}</p>
        </div>
        <span className="text-[44px] leading-none" aria-hidden="true">{icon}</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px] text-zinc-500 dark:text-zinc-400">
        <div><dt>Feels like</dt><dd className="text-[14px] font-medium text-zinc-800 dark:text-zinc-100">{round(current.apparent_temperature) ?? '–'}°</dd></div>
        <div><dt>Humidity</dt><dd className="text-[14px] font-medium text-zinc-800 dark:text-zinc-100">{round(current.relative_humidity_2m) ?? '–'}%</dd></div>
        <div><dt>Wind</dt><dd className="text-[14px] font-medium text-zinc-800 dark:text-zinc-100">{round(current.wind_speed_10m) ?? '–'} km/h</dd></div>
      </dl>
      {days.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          {days.map((day, index) => (
            <li key={day} className="text-center text-[12px] text-zinc-500 dark:text-zinc-400">
              <p>{index === 0 ? 'Today' : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</p>
              <p className="mt-0.5 text-[13px] font-medium text-zinc-800 dark:text-zinc-100">
                {round(data.daily.temperature_2m_max?.[index]) ?? '–'}° / {round(data.daily.temperature_2m_min?.[index]) ?? '–'}°
              </p>
              {typeof data.daily.precipitation_probability_max?.[index] === 'number' && (
                <p>{round(data.daily.precipitation_probability_max?.[index])}% rain</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">Live data from Open-Meteo</p>
    </div>
  );
};

export default WeatherCard;
