const express = require('express');
const axios = require('axios');
const cors = require('cors');
const xml2js = require('xml2js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require('dotenv').config();
const NodeCache = require('node-cache');
const routeCache = new NodeCache({ stdTTL: 3600 }); // cache lasts an hour
const polyline = require('@mapbox/polyline');

// E-ZPass toll pass enums (Google Routes API)
const EZPASS_TOLL_PASSES = [
  'US_NJ_EZPASSNJ','US_NY_EZPASSNY','US_PA_EZPASSPA','US_DE_EZPASSDE',
  'US_MD_EZPASSMD','US_VA_EZPASSVA','US_WV_EZPASSWV','US_MA_EZPASSMA',
  'US_ME_EZPASSME','US_NH_EZPASSNH','US_OH_EZPASSOH','US_IL_EZPASSIL',
  'US_IN_EZPASSIN','US_MN_EZPASSMN','US_NC_EZPASSNC','US_RI_EZPASSRI'
];

const app = express();
const allowedOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => res.send('ok'));

// Route 1: optimize route and estimate fuel cost
app.post('/optimize-route', async (req, res) => {
  let {
    origin,
    destination,
    originState,
    destinationState,
    fuelEfficiency,
    fuelPrice,
    units = 'miles',
    fuelType = 'Regular',
    includeRoundTrip = false,
    preferredRouteType = null,
    stops = [],
    useEzpass = true,
    avoidTolls = false,
  } = req.body;

  const startTime = Date.now();

  // normalize stops so the cache key is stable
  const normalizedStops = (stops || [])
    .filter(s => s && s.address && s.address.trim() !== '')
    .map(s => `${s.address.trim()}, ${s.state || ''}`.toLowerCase());

  const cacheKey = JSON.stringify({
    origin, destination, originState, destinationState,
    fuelEfficiency, fuelPrice, units, fuelType,
    includeRoundTrip, preferredRouteType,
    stops: normalizedStops,
    useEzpass,
    avoidTolls, 
  });

  const cached = routeCache.get(cacheKey);
  if (cached) {
    const duration = Date.now() - startTime;
    console.log(`Cache HIT [${cacheKey}] (took ${duration} ms)`);
    return res.json(cached);
  }

  console.log(`Cache MISS [${cacheKey}]`);

  if (!fuelEfficiency) {
    return res.status(400).json({ error: 'Missing fuel efficiency (MPG) in request body' });
  }

  const decodeStopPaths = async (stops = []) => {
    const decoded = [];

    for (const stop of stops) {
      try {
        const geoRes = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
          params: {
            address: stop.address,
            key: process.env.GOOGLE_MAPS_BACKEND_KEY
          }
        });

        const location = geoRes.data.results?.[0]?.geometry?.location;
        if (location) {
          decoded.push({
            ...stop,
            path: [[location.lat, location.lng]]
          });
        }
      } catch (err) {
        console.warn(`Failed to geocode stop "${stop.address}":`, err.message);
      }
    }

    return decoded;
  };

  const fuelTypeMap = {
    Regular: 'EPMR',
    Midgrade: 'EPMM',
    Premium: 'EPMP',
    Diesel: 'EPD2D'
  };

  const productCode = fuelTypeMap[fuelType];
  if (!productCode) {
    return res.status(400).json({ error: 'Invalid fuel type selected' });
  }

  try {
    let actualOriginState = null;
    const geoRes = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address: origin,
        key: process.env.GOOGLE_MAPS_BACKEND_KEY
      }
    });

    const components = geoRes.data.results?.[0]?.address_components || [];
    const stateComponent = components.find(c => c.types.includes('administrative_area_level_1'));
    if (stateComponent) {
      actualOriginState = stateComponent.short_name;
    }

    let duoArea = 'NUS';
    if (
      actualOriginState &&
      actualOriginState === originState &&
      originState === destinationState
    ) {
      duoArea = actualOriginState;
    }

    if (!fuelPrice) {
      const priceRes = await axios.get('https://api.eia.gov/v2/petroleum/pri/gnd/data/', {
        params: {
          api_key: process.env.EIA_API_KEY,
          frequency: 'weekly',
          data: ['value'],
          'facets[product]': [productCode],
          'facets[duoarea]': [duoArea],
          'sort[0][column]': 'period',
          'sort[0][direction]': 'desc',
          offset: 0,
          length: 1
        }
      });

      let priceData = priceRes.data.response?.data?.[0];

      if (!priceData && duoArea !== 'NUS') {
        const fallbackRes = await axios.get('https://api.eia.gov/v2/petroleum/pri/gnd/data/', {
          params: {
            api_key: process.env.EIA_API_KEY,
            frequency: 'weekly',
            data: ['value'],
            'facets[product]': [productCode],
            'facets[duoarea]': ['NUS'],
            'sort[0][column]': 'period',
            'sort[0][direction]': 'desc',
            offset: 0,
            length: 1
          }
        });
        priceData = fallbackRes.data.response?.data?.[0];
        duoArea = 'NUS';
      }

      fuelPrice = priceData?.value;
      if (!fuelPrice || isNaN(fuelPrice)) {
        return res.status(500).json({ error: 'No fuel price available for selected fuel type' });
      }
    }
 
    const fetchRoutes = async (from, to, waypoints = []) => {
      const useMiles = (units === 'miles');

      const routeModifiers = {};
      if (avoidTolls) {
        routeModifiers.avoidTolls = true;
      } else if (useEzpass) {
        routeModifiers.tollPasses = EZPASS_TOLL_PASSES;
      }

      const body = {
        origin:       { address: from },
        destination:  { address: to },
        intermediates: (waypoints || []).map(w => ({ address: w })), // preserve stop order
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        computeAlternativeRoutes: true,
        units: useMiles ? 'IMPERIAL' : 'METRIC',
        extraComputations: ['TOLLS'],
        departureTime: new Date().toISOString(),
        ...(Object.keys(routeModifiers).length ? { routeModifiers } : {})
      };

      // only request the fields we use (faster/cheaper)
      const fieldMask = [
        'routes.distanceMeters',
        'routes.duration',
        'routes.description',
        'routes.polyline.encodedPolyline',
        'routes.travelAdvisory.tollInfo.estimatedPrice',
        'routes.legs.travelAdvisory.tollInfo.estimatedPrice',
      ].join(',');

      const resp = await axios.post(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        body,
        {
          headers: {
            'X-Goog-Api-Key': process.env.GOOGLE_MAPS_BACKEND_KEY,
            'X-Goog-FieldMask': fieldMask,
          },
        }
      );

      const moneyToNumber = (m) => {
        if (!m) return 0;
        if (typeof m === 'object' && ('units' in m || 'nanos' in m)) {
          const unitsNum = Number(m.units || 0);
          const nanosNum = Number(m.nanos || 0);
          return unitsNum + nanosNum / 1e9;
        }
        // fallback if Google ever returns a simple amount
        const n = Number(m);
        return isNaN(n) ? 0 : n;
      };

      const extractTollUSD = (tollInfo) => {
        if (!tollInfo || !tollInfo.estimatedPrice) return 0;
        const arr = Array.isArray(tollInfo.estimatedPrice)
          ? tollInfo.estimatedPrice
          : [tollInfo.estimatedPrice];
        // prefer USD, else sum whatever is present
        const usd = arr.filter(p => !p.currencyCode || p.currencyCode === 'USD');
        const use = usd.length ? usd : arr;
        return use.reduce((sum, p) => sum + moneyToNumber(p), 0);
      };

      const parseDurationSec = (s) => {
        if (!s) return 0;
        const m = String(s).match(/^(\d+)s$/);
        return m ? parseInt(m[1], 10) : 0;
      };

      const routes = resp.data.routes || [];

      return routes.map((route, idx) => {
        const distanceMeters = route.distanceMeters ?? 0;
        const distanceKm = distanceMeters / 1000;
        const distanceMiles = distanceKm * 0.621371;
        const distanceValue = useMiles ? distanceMiles : distanceKm;

        const durationSec = parseDurationSec(route.duration);
        const durationMin = Math.round(durationSec / 60);

        // toll: use route-level price if present, else sum legs (if Google ever returns per-leg)
        let toll = extractTollUSD(route.travelAdvisory?.tollInfo || {});
        if (!toll && route.legs?.length) {
          toll = route.legs.reduce((sum, leg) => {
            return sum + extractTollUSD(leg.travelAdvisory?.tollInfo || {});
          }, 0);
        }

        const encoded = route.polyline?.encodedPolyline || '';
        const decodedPath = encoded ? polyline.decode(encoded) : [];

        // fuel figures (same as before)
        const distanceForFuel = distanceValue;
        const fuelUsed = distanceForFuel / fuelEfficiency;
        const fuelCost = fuelUsed * fuelPrice;

        const totalCost = fuelCost + toll;

        return {
          summary: route.description || `Route ${idx + 1}`,
          distance: distanceValue.toFixed(2) + ` ${useMiles ? 'miles' : 'km'}`,
          duration_min: durationMin,
          fuel_used: fuelUsed.toFixed(2),
          estimated_cost: fuelCost.toFixed(2),     // fuel only (kept for tags/sorting)
          estimated_toll: toll ? toll.toFixed(2) : null,
          total_cost: totalCost.toFixed(2),
          path: decodedPath
        };
      });
    };

    // add route_type tags for visual distinction
    const annotateRoutes = (routes) => {
      if (!routes.length) return [];

      const durations = routes.map(r => r.duration_min);
      const distances = routes.map(r => parseFloat(r.distance));
      const fuelUsed = routes.map(r => parseFloat(r.fuel_used));

      const minDuration = Math.min(...durations);
      const minDistance = Math.min(...distances);
      const minFuel = Math.min(...fuelUsed);

      return routes.map(r => {
        const tags = [];
        const fuel = parseFloat(r.fuel_used);
        const distance = parseFloat(r.distance);

        if (r.duration_min === minDuration) tags.push('fastest');
        if (distance === minDistance) tags.push('shortest');
        if (Math.abs(fuel - minFuel) < 0.0001) tags.push('fuel_efficient'); 

        return {
          ...r,
          route_type: tags.length ? tags.join(',') : null
        };
      });
    };

    const formattedStops = stops
      .filter(s => s.address) // remove blank stops
      .map(s => `${s.address}, ${s.state}`);

    const outboundRaw = await fetchRoutes(origin, destination, formattedStops);

    const outboundRoutes = annotateRoutes(outboundRaw);

    const returnRoutes = includeRoundTrip
      ? annotateRoutes(await fetchRoutes(destination, origin, [...formattedStops].reverse()))
      : [];

    const sortRoutes = (routes) => {
      switch (preferredRouteType) {
        case 'fastest':
          return [...routes].sort((a, b) => a.duration_min - b.duration_min);
        case 'shortest':
          return [...routes].sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
        case 'fuel_efficient':
          return [...routes].sort((a, b) => parseFloat(a.estimated_cost) - parseFloat(b.estimated_cost));
        case 'cheapest':
          return [...routes].sort(
            (a, b) => parseFloat(a.total_cost || a.estimated_cost || 0) - parseFloat(b.total_cost || b.estimated_cost || 0));
        default:
          return routes;
      }
    };

    const decodedStops = await decodeStopPaths(stops);

    const result = {
      origin,
      destination,
      round_trip: includeRoundTrip,
      origin_state_used: duoArea,
      fuel_price: parseFloat(fuelPrice).toFixed(2),
      preferred_route_type: preferredRouteType || 'none',
      outbound_routes: sortRoutes(outboundRoutes),
      return_routes: includeRoundTrip ? sortRoutes(returnRoutes) : [],
      stops: decodedStops
    };

    routeCache.set(cacheKey, result);
    const duration = Date.now() - startTime;
    console.log(`Cache SET [${cacheKey}] (took ${duration} ms)`);

    res.json(result);
  } catch (error) {
    console.error('Error in /optimize-route:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error processing fuel cost estimation' });
  }
});

// Route 2: get MPG using EPA Fuel Economy API
app.post('/get-mpg', async (req, res) => {
  const { year, make, model } = req.body;

  try {
    const vehicleListRes = await fetch(
      `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${year}&make=${make}&model=${model}`
    );

    const xml = await vehicleListRes.text();
    const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });

    const menuItems = parsed.menuItems?.menuItem;
    const firstVehicle = Array.isArray(menuItems) ? menuItems[0] : menuItems;

    if (!firstVehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const vehicleId = firstVehicle.value;

    const mpgRes = await fetch(
      `https://www.fueleconomy.gov/ws/rest/vehicle/${vehicleId}`
    );
    const mpgXml = await mpgRes.text();
    const mpgParsed = await xml2js.parseStringPromise(mpgXml, { explicitArray: false });

    const mpg = mpgParsed.vehicle?.comb08;

    if (!mpg) {
      return res.status(404).json({ error: 'MPG data not available for this vehicle' });
    }

    res.json({ mpg });
  } catch (error) {
    console.error('Error fetching MPG:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch MPG data' });
  }
});

// Route 3: fuel price endpoint (supports fuelType = Regular|Midgrade|Premium|Diesel)
app.get('/fuel-price', async (req, res) => {
  try {
    // map UI fuel types -> EIA product facet codes
    const fuelTypeMap = {
      Regular:  'EPMR',
      Midgrade: 'EPMM',
      Premium:  'EPMP',
      Diesel:   'EPD2D',
      All:      'EPM0'
    };

    const requested = String(req.query.fuelType || 'Regular');
    const productCode = fuelTypeMap[requested] || fuelTypeMap.Regular;

    const { data } = await axios.get(
      'https://api.eia.gov/v2/petroleum/pri/gnd/data/',
      {
        params: {
          api_key: process.env.EIA_API_KEY,
          frequency: 'weekly',
          data: ['value'],
          'facets[product]': [productCode],
          'facets[duoarea]': ['NUS'],     // U.S. national average
          'sort[0][column]': 'period',
          'sort[0][direction]': 'desc',
          offset: 0,
          length: 1
        }
      }
    );

    const row = data?.response?.data?.[0];
    if (!row) {
      return res.status(404).json({ error: 'No fuel price data available' });
    }

    res.json({
      date: row.period,
      fuel_price: Number(row.value).toFixed(2),
      fuelType: requested,
      product: productCode
    });
  } catch (error) {
    console.error('EIA API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch fuel price' });
  }
});

// Route 4: get makes for a given year
app.get('/vehicle-makes', async (req, res) => {
  const { year } = req.query;
  if (!year) return res.status(400).json({ error: 'Missing year parameter' });

  try {
    const xmlRes = await fetch(
      `https://www.fueleconomy.gov/ws/rest/vehicle/menu/make?year=${year}`
    );
    const xml = await xmlRes.text();
    const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });

    const makes = parsed.menuItems?.menuItem || [];
    const result = Array.isArray(makes) ? makes.map(m => m.text) : [makes.text];

    res.json({ makes: result });
  } catch (err) {
    console.error('Error fetching makes:', err.message);
    res.status(500).json({ error: 'Failed to fetch vehicle makes' });
  }
});

// Route 5: get models for a given year and make (filtered to only models with MPG data)
app.get('/vehicle-models', async (req, res) => {
  const { year, make } = req.query;
  if (!year || !make) {
    return res.status(400).json({ error: 'Missing year or make parameter' });
  }

  const cacheKey = `validModels:${year}:${make}`;
  const cached = routeCache.get(cacheKey);
  if (cached) {
    console.log(`Cached valid models hit: ${cacheKey}`);
    return res.json({ models: cached });
  }

  try {
    const xmlRes = await fetch(
      `https://www.fueleconomy.gov/ws/rest/vehicle/menu/model?year=${year}&make=${encodeURIComponent(make)}`
    );
    const xml = await xmlRes.text();
    const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });

    const rawModels = parsed.menuItems?.menuItem || [];
    const allModels = Array.isArray(rawModels) ? rawModels.map(m => m.text) : [rawModels.text];

    const validModels = [];

    for (const model of allModels) {
      try {
        const optionsRes = await fetch(
          `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`
        );
        const optionsXml = await optionsRes.text();
        const optionsParsed = await xml2js.parseStringPromise(optionsXml, { explicitArray: false });

        const vehicleItems = optionsParsed.menuItems?.menuItem;
        const vehicleArray = Array.isArray(vehicleItems) ? vehicleItems : [vehicleItems];

        for (const vehicle of vehicleArray) {
          const vehicleId = vehicle?.value;
          if (!vehicleId) continue;

          try {
            const mpgRes = await fetch(`https://www.fueleconomy.gov/ws/rest/vehicle/${vehicleId}`);
            const mpgXml = await mpgRes.text();
            const mpgParsed = await xml2js.parseStringPromise(mpgXml, { explicitArray: false });

            const mpg = mpgParsed.vehicle?.comb08;
            if (mpg) {
              validModels.push(model);
              break; // only need one valid variant
            }
          } catch (err) {
            console.warn(`Skipping vehicle ID ${vehicle?.value} for model "${model}":`, err.message);
          }
        }
      } catch (err) {
        console.warn(`Skipping model "${model}":`, err.message);
      }
    }

    routeCache.set(cacheKey, validModels, 86400); // Cache 24 hrs
    console.log(`Filtered valid models: ${validModels.length} out of ${allModels.length}`);
    res.json({ models: validModels });
  } catch (err) {
    console.error('Error fetching valid models:', err.message);
    res.status(500).json({ error: 'Failed to fetch valid vehicle models' });
  }
});

// Route 6: get list of available vehicle years
app.get('/vehicle-years', async (req, res) => {
  try {
    const response = await fetch('https://www.fueleconomy.gov/ws/rest/vehicle/menu/year');
    const xml = await response.text();
    const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });

    const menuItems = parsed.menuItems?.menuItem;
    const years = Array.isArray(menuItems)
      ? menuItems.map(item => parseInt(item.value)).filter(Boolean)
      : [parseInt(menuItems.value)];

    res.json({ years: years.sort((a, b) => b - a) }); // newest to oldest
  } catch (err) {
    console.error('Failed to fetch vehicle years:', err.message);
    res.status(500).json({ error: 'Could not retrieve available years' });
  }
});


app.listen(PORT, () => {
  console.log(`API listening on port ${PORT} (CORS origin: ${process.env.CORS_ORIGIN || '*'})`);
});