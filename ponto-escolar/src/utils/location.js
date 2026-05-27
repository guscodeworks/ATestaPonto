const EARTH_RADIUS_METERS = 6371000;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toNumber(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function validateCoordinates(latitude, longitude) {
  const lat = toNumber(latitude);
  const lon = toNumber(longitude);

  return {
    isValid: isValidLatitude(lat) && isValidLongitude(lon),
    latitude: lat,
    longitude: lon
  };
}

function haversineDistanceMeters(originLat, originLon, targetLat, targetLon) {
  const dLat = toRadians(targetLat - originLat);
  const dLon = toRadians(targetLon - originLon);

  const lat1 = toRadians(originLat);
  const lat2 = toRadians(targetLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function isWithinRadius(origin, target, radiusMeters) {
  const originCoords = validateCoordinates(origin.latitude, origin.longitude);
  const targetCoords = validateCoordinates(target.latitude, target.longitude);
  const safeRadius = toNumber(radiusMeters);

  if (!originCoords.isValid || !targetCoords.isValid || !Number.isFinite(safeRadius) || safeRadius <= 0) {
    return {
      isWithin: false,
      distanceMeters: null
    };
  }

  const distanceMeters = haversineDistanceMeters(
    originCoords.latitude,
    originCoords.longitude,
    targetCoords.latitude,
    targetCoords.longitude
  );

  return {
    isWithin: distanceMeters <= safeRadius,
    distanceMeters: Number(distanceMeters.toFixed(2))
  };
}

module.exports = {
  EARTH_RADIUS_METERS,
  validateCoordinates,
  haversineDistanceMeters,
  isWithinRadius
};
