/**
 * Weather.gs: Open-Meteo forecast (free, no API key).
 */

/** Hourly forecast for one day in UK time: {hours: [{hour, temp, rainProb, rainMm, wind, gust}], sunset} */
function fetchForecast_(lat, lon, ymd) {
  var url = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon) +
    '&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m' +
    '&daily=sunset&timezone=Europe%2FLondon&start_date=' + ymd + '&end_date=' + ymd;
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Open-Meteo ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  return parseForecast(JSON.parse(res.getContentText()));
}

function parseForecast(json) {
  var h = json.hourly;
  var hours = h.time.map(function (t, i) {
    return {
      hour: Number(t.slice(11, 13)),
      temp: h.temperature_2m[i],
      rainProb: h.precipitation_probability[i] === null ? 0 : h.precipitation_probability[i],
      rainMm: h.precipitation[i] || 0,
      wind: h.wind_speed_10m[i],
      gust: h.wind_gusts_10m[i] || 0
    };
  });
  var sunset = json.daily && json.daily.sunset && json.daily.sunset[0] ? parseClock(json.daily.sunset[0].slice(11, 16)) : null;
  return { hours: hours, sunset: sunset };
}

if (typeof module !== 'undefined') module.exports = { parseForecast: parseForecast };
