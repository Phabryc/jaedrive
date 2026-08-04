const cache = new Map<string, Promise<string>>();

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  // Arrotondiamo a 4 cifre decimali (~11 metri) per aumentare l'hit rate della cache
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (cache.has(key)) {
    return cache.get(key)!;
  }

  const promise = (async () => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18`,
        {
          headers: {
            "Accept-Language": "it,en",
            "User-Agent": "JaeDrive-WebApp/1.0",
          },
        }
      );
      if (!res.ok) return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      const data = await res.json();
      
      const addr = data.address;
      if (!addr) return data.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

      const road = addr.road || addr.pedestrian || addr.street || addr.suburb;
      const houseNumber = addr.house_number ? ` ${addr.house_number}` : "";
      const city = addr.city || addr.town || addr.village || addr.municipality;

      if (road && city) {
        return `${road}${houseNumber}, ${city}`;
      } else if (road) {
        return `${road}${houseNumber}`;
      } else if (city) {
        return city;
      }
      return data.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    } catch {
      return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }
  })();

  cache.set(key, promise);
  return promise;
}
