import { useState, useEffect, useRef } from 'react';
import './index.css';
import BackgroundCarousel from './components/BackgroundCarousel';
import 'leaflet/dist/leaflet.css';
import ReactLeafletMap from './components/ReactLeafletMap';
import { ROUTE_COLORS } from "./constants/routeColors";
import { IoIosAddCircle } from "react-icons/io";
import { FaCircleXmark, FaClock } from "react-icons/fa6";
import { FaGasPump, FaCar, FaRoute, FaQuestionCircle, FaPaperPlane, FaMapPin, FaCheckCircle, FaRuler } from "react-icons/fa";
import { RiMoneyDollarCircleFill } from "react-icons/ri";
import { BiSolidLeaf } from "react-icons/bi";
import Header from './components/Header';



function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours} hr${hours > 1 ? 's' : ''}${mins > 0 ? ` ${mins} min` : ''}`;
}

const STATES = [
  { abbr: 'AL', name: 'Alabama' }, { abbr: 'AK', name: 'Alaska' },
  { abbr: 'AZ', name: 'Arizona' }, { abbr: 'AR', name: 'Arkansas' },
  { abbr: 'CA', name: 'California' }, { abbr: 'CO', name: 'Colorado' },
  { abbr: 'CT', name: 'Connecticut' }, { abbr: 'DE', name: 'Delaware' },
  { abbr: 'FL', name: 'Florida' }, { abbr: 'GA', name: 'Georgia' },
  { abbr: 'HI', name: 'Hawaii' }, { abbr: 'ID', name: 'Idaho' },
  { abbr: 'IL', name: 'Illinois' }, { abbr: 'IN', name: 'Indiana' },
  { abbr: 'IA', name: 'Iowa' }, { abbr: 'KS', name: 'Kansas' },
  { abbr: 'KY', name: 'Kentucky' }, { abbr: 'LA', name: 'Louisiana' },
  { abbr: 'ME', name: 'Maine' }, { abbr: 'MD', name: 'Maryland' },
  { abbr: 'MA', name: 'Massachusetts' }, { abbr: 'MI', name: 'Michigan' },
  { abbr: 'MN', name: 'Minnesota' }, { abbr: 'MS', name: 'Mississippi' },
  { abbr: 'MO', name: 'Missouri' }, { abbr: 'MT', name: 'Montana' },
  { abbr: 'NE', name: 'Nebraska' }, { abbr: 'NV', name: 'Nevada' },
  { abbr: 'NH', name: 'New Hampshire' }, { abbr: 'NJ', name: 'New Jersey' },
  { abbr: 'NM', name: 'New Mexico' }, { abbr: 'NY', name: 'New York' },
  { abbr: 'NC', name: 'North Carolina' }, { abbr: 'ND', name: 'North Dakota' },
  { abbr: 'OH', name: 'Ohio' }, { abbr: 'OK', name: 'Oklahoma' },
  { abbr: 'OR', name: 'Oregon' }, { abbr: 'PA', name: 'Pennsylvania' },
  { abbr: 'RI', name: 'Rhode Island' }, { abbr: 'SC', name: 'South Carolina' },
  { abbr: 'SD', name: 'South Dakota' }, { abbr: 'TN', name: 'Tennessee' },
  { abbr: 'TX', name: 'Texas' }, { abbr: 'UT', name: 'Utah' },
  { abbr: 'VT', name: 'Vermont' }, { abbr: 'VA', name: 'Virginia' },
  { abbr: 'WA', name: 'Washington' }, { abbr: 'WV', name: 'West Virginia' },
  { abbr: 'WI', name: 'Wisconsin' }, { abbr: 'WY', name: 'Wyoming' },
];

// API base
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// total cost helper (falls back to fuel-only if tolls absent)
const num = (x) => (x === null || x === undefined ? NaN : parseFloat(x));
const totalCostOf = (r) =>
  Number.isFinite(num(r.total_cost)) ? num(r.total_cost) : num(r.estimated_cost);

// mark the cheapest route(s) in a list
function markCheapest(routes = []) {
  if (!routes.length) return [];
  const min = Math.min(...routes.map(totalCostOf).filter(Number.isFinite));
  return routes.map((r) => ({ ...r, __cheapest: Number.isFinite(totalCostOf(r)) && Math.abs(totalCostOf(r) - min) < 1e-6 }));
}

// UI sort
function sortRoutesUI(routes = [], key = "none") {
  const copy = [...routes];
  switch (key) {
    case "fastest":
      return copy.sort((a, b) => a.duration_min - b.duration_min);
    case "shortest":
      return copy.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    case "fuel_efficient": // proxy by fuel/fuel cost
      return copy.sort((a, b) => parseFloat(a.estimated_cost) - parseFloat(b.estimated_cost));
    case "cheapest": // true total (fuel + tolls when present)
      return copy.sort((a, b) => totalCostOf(a) - totalCostOf(b));
    default:
      return routes;
  }
}

// stable IDs & colors for routes ---
const djb2 = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36); // unsigned, base36
};

const routeIdOf = (r) => {
  const start = r.path?.[0] || [];
  const end   = r.path?.[r.path.length - 1] || [];
  // endpoints + duration + distance is enough to be deterministic per result set
  return djb2(JSON.stringify([start, end, r.duration_min, r.distance]));
};

const withStableColors = (routes = []) => {
  const used = new Set();
  let colorIdx = 0;
  const idToColor = new Map();

  return routes.map((r) => {
    const id = routeIdOf(r);

    if (!idToColor.has(id)) {
      // pick next unused palette color; wrap if needed
      let color = ROUTE_COLORS[colorIdx % ROUTE_COLORS.length];
      while (used.has(color) && used.size < ROUTE_COLORS.length) {
        colorIdx++;
        color = ROUTE_COLORS[colorIdx % ROUTE_COLORS.length];
      }
      idToColor.set(id, color);
      used.add(color);
      colorIdx++;
    }

    return { ...r, id, color: idToColor.get(id) };
  });
};

function App() {
  const [form, setForm] = useState({
    origin: '',
    destination: '',
    originState: '',
    destinationState: '',
    fuelEfficiency: '',
    fuelType: '',
    units: 'miles',
    includeRoundTrip: false,
    preferredRouteType: '',
    stops: [],
    useEzpass: true,
    avoidTolls: false,
    fuelPriceMode: 'auto',
    fuelPrice: '',
  });

  const [vehicle, setVehicle] = useState({ year: '', make: '', model: '' });
  const [availableYears, setAvailableYears] = useState([]);
  const [availableMakes, setAvailableMakes] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);

  const [result, setResult] = useState(null);
  const [submittedForm, setSubmittedForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formRef = useRef(null);
  const summaryRef = useRef(null);

  const [selectedOutboundIndex, setSelectedOutboundIndex] = useState(null);
  const [selectedReturnIndex, setSelectedReturnIndex] = useState(null);

  const headerHeight = 64;
  const aboutRef = useRef(null);
  const faqRef = useRef(null);
  const contactRef = useRef(null);

  const [outboundSort, setOutboundSort] = useState("none");
  const [returnSort, setReturnSort] = useState("none");

  const outboundMarked = result?.outbound_routes ? markCheapest(result.outbound_routes) : [];
  const returnMarked   = result?.return_routes   ? markCheapest(result.return_routes)   : [];

  const outboundSorted = sortRoutesUI(outboundMarked, outboundSort);
  const returnSorted   = sortRoutesUI(returnMarked,   returnSort);

  const [autoFuelPrice, setAutoFuelPrice] = useState(null);
  const [autoFuelLoading, setAutoFuelLoading] = useState(false);

  // persist custom price during the session
  useEffect(() => {
    if (form.fuelPriceMode === 'custom' && form.fuelPrice) {
      sessionStorage.setItem('econav.customFuelPrice', String(form.fuelPrice));
    }
  }, [form.fuelPriceMode, form.fuelPrice]);

  useEffect(() => {
    if (form.fuelPriceMode !== 'auto' || !form.fuelType) {
      setAutoFuelLoading(false);
      setAutoFuelPrice(null);
      return;
    }

    let cancelled = false;

    setAutoFuelLoading(true);
    setAutoFuelPrice(null);

    fetch(`${API_BASE}/fuel-price?fuelType=${encodeURIComponent(form.fuelType)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        const val = Number(d.fuel_price);
        setAutoFuelPrice(Number.isFinite(val) ? val : null);
      })
      .catch(() => {
        if (!cancelled) setAutoFuelPrice(null);
      })
      .finally(() => {
        if (!cancelled) setAutoFuelLoading(false);
      });

    return () => { cancelled = true; };
  }, [form.fuelPriceMode, form.fuelType]);

  const scrollToRef = (ref) => {
    if (!ref?.current) return;
    const y = ref.current.getBoundingClientRect().top + window.scrollY - headerHeight - 8;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  const removeStopAt = (idx) =>
    setForm(prev => ({ ...prev, stops: prev.stops.filter((_, i) => i !== idx) }));

  useEffect(() => {
    fetch(`${API_BASE}/vehicle-years`)
      .then(res => res.json())
      .then(data => setAvailableYears(data.years))
      .catch(err => console.error('Failed to fetch years:', err));
  }, []);

  useEffect(() => {
    if (!vehicle.year) return;
    setAvailableMakes([]);
    setAvailableModels([]);
    setVehicle(prev => ({ ...prev, make: '', model: '' }));

    fetch(`${API_BASE}/vehicle-makes?year=${vehicle.year}`)
      .then(res => res.json())
      .then(data => setAvailableMakes(data.makes || []))
      .catch(err => console.error('Failed to fetch makes:', err));
  }, [vehicle.year]);

  useEffect(() => {
    if (!vehicle.year || !vehicle.make) return;
    setAvailableModels([]);
    setVehicle(prev => ({ ...prev, model: '' }));

    fetch(`${API_BASE}/vehicle-models?year=${vehicle.year}&make=${vehicle.make}`)
      .then(res => res.json())
      .then(data => setAvailableModels(data.models || []))
      .catch(err => console.error('Failed to fetch models:', err));
  }, [vehicle.year, vehicle.make]);

  useEffect(() => {
    if (!result) return;

    const initial =
      submittedForm?.preferredRouteType && submittedForm.preferredRouteType !== 'none'
        ? submittedForm.preferredRouteType
        : 'none';

    setOutboundSort(initial);
    setReturnSort(initial);

    setSelectedOutboundIndex(0);
    setSelectedReturnIndex(0);

    scrollToRef(summaryRef);
  }, [result]); 


  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleVehicleChange = (e) => {
    const { name, value } = e.target;
    setVehicle((prev) => ({ ...prev, [name]: value }));
  };

  const fetchMPG = async () => {
    if (!vehicle.year || !vehicle.make || !vehicle.model) {
      setError('Please enter year, make, and model');
      return;
    }

    try {
      setError('');
      const res = await fetch(`${API_BASE}/get-mpg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicle)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch MPG');

      setForm((prev) => ({ ...prev, fuelEfficiency: data.mpg }));
    } catch (err) {
      setError('Vehicle not found. Try searching your MPG manually on fueleconomy.gov.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError('');

    // require a route preference selection
    if (!form.preferredRouteType || form.preferredRouteType === '') {
      setLoading(false);
      setError('Please select a route preference before continuing.');
      return;
    }

    // keep stops clean for both UI + backend payloads
    const cleanStops = (form.stops || []).filter(s => s.address?.trim() !== '');

    // UI payload
    const uiPayload = { ...form, stops: cleanStops };
    setSubmittedForm(uiPayload);

    // if user chose a custom fuel price, validate it before sending
    if (uiPayload.fuelPriceMode === 'custom') {
      const n = parseFloat(uiPayload.fuelPrice);
      if (!Number.isFinite(n) || n < 0.5 || n > 15) {
        setLoading(false);
        setError('Please enter a valid fuel price between $0.50 and $15.00.');
        return;
      }
    }

    // backend payload (strip helper fields; only include fuelPrice when custom)
    const sendPayload = { ...uiPayload };
    if (uiPayload.fuelPriceMode !== 'custom') {
      delete sendPayload.fuelPrice;       // backend will fetch EIA average
    } else {
      sendPayload.fuelPrice = Number(uiPayload.fuelPrice);
    }
    delete sendPayload.fuelPriceMode;

    try {
      console.log('Payload being sent to backend:', sendPayload);
      const res = await fetch(`${API_BASE}/optimize-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendPayload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');

      // assign stable ids + colors once
      const colored = {
        ...data,
        outbound_routes: withStableColors(data.outbound_routes || []),
        return_routes: withStableColors(data.return_routes || []),
      };

      setResult(colored);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const TagPill = ({ icon: Icon, label, classes, title }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${classes}`} title={title || label}>
      <Icon className="text-sm" aria-hidden="true" />
      {label}
    </span>
  );

  const SortChip = ({ active, onClick, icon: Icon, children }) => (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition cursor-pointer
        ${active ? "bg-[#3F5E4A] text-white shadow" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
    >
      <Icon className="text-sm" />
      {children}
    </button>
  );

  const SortControls = ({ value, onChange }) => (
    <div className="flex flex-wrap gap-2 text-sm mb-3">
      <SortChip active={value === "fastest"} onClick={() => onChange("fastest")} icon={FaClock}>Fastest</SortChip>
      <SortChip active={value === "shortest"} onClick={() => onChange("shortest")} icon={FaRuler}>Shortest</SortChip>
      <SortChip active={value === "fuel_efficient"} onClick={() => onChange("fuel_efficient")} icon={BiSolidLeaf}>Fuel Efficient</SortChip>
      <SortChip active={value === "cheapest"} onClick={() => onChange("cheapest")} icon={RiMoneyDollarCircleFill}>Cheapest</SortChip>
      <SortChip active={value === "none"} onClick={() => onChange("none")} icon={FaMapPin}>No Preference</SortChip>
    </div>
  );

  const RouteCard = ({ route, index, isSelected, onClick, recommended }) => {
    const typeSet = new Set(
      (route.route_type || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    const hasToll =
      route.estimated_toll !== null &&
      route.estimated_toll !== undefined &&
      parseFloat(route.estimated_toll) > 0; 

    return (
      <div
        onClick={onClick}
        className={`relative flex-shrink-0 w-80 p-4 rounded-2xl shadow border transition-colors duration-200 cursor-pointer ${
          isSelected ? "bg-[#e9dfd0] border-[#7C5A43]" : "bg-white border-gray-300 hover:bg-[#e9dfd0]"
        }`}
      >

        {/* header split: left = title + merit pills, right = toll status */}
        <div className="flex items-start justify-between mb-2">
          <div>
            {recommended && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#3F5E4A] text-white text-xs shadow mb-1">
                Recommended
              </span>
            )}
            <h3 className="font-bold text-base mb-2">{route.summary}</h3>
            <div className="flex flex-wrap items-center gap-2">
              {typeSet.has("fastest") && (
                <TagPill icon={FaClock} label="Fastest" classes="bg-blue-100 text-blue-700" />
              )}
              {typeSet.has("shortest") && (
                <TagPill icon={FaRuler} label="Shortest" classes="bg-amber-100 text-amber-700" />
              )}
              {typeSet.has("fuel_efficient") && (
              <TagPill icon={BiSolidLeaf} label="Fuel Efficient" classes="bg-lime-100 text-lime-800" />
            )}

            {route.__cheapest && (
              <TagPill icon={RiMoneyDollarCircleFill} label="Cheapest" classes="bg-emerald-100 text-emerald-800" />
            )}
            </div>
          </div>

          <div className="ml-3 flex-shrink-0">
            {/* right side */}
            {hasToll ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 text-[#3F5E4A] px-2 py-0.5 text-xs">
                <RiMoneyDollarCircleFill className="text-base" />
                Tolls
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs">
                <FaCheckCircle className="text-sm" />
                Toll-free
              </span>
            )}
          </div>
        </div>

        {/* body */}
        <p><strong>Distance:</strong> {route.distance}</p>
        <p><strong>Duration:</strong> {formatDuration(route.duration_min)}</p>
        <p><strong>Fuel Used:</strong> {route.fuel_used} gal</p>

        {hasToll ? (
          <>
            <p><strong>Estimated Fuel Cost:</strong> ${route.estimated_cost}</p>
            <p><strong>Estimated Toll Cost:</strong> ${route.estimated_toll}</p>
            <p className="font-semibold"><strong>Total Route Cost:</strong> ${route.total_cost}</p>
            <p className="text-xs text-gray-600">
              <strong>Toll Pricing:</strong> {submittedForm?.useEzpass ? "E-ZPass (if supported)" : "Cash/Toll-by-Mail"}
            </p>
          </>
        ) : (
          <p className="mt-2"><strong>Estimated Trip Cost:</strong> ${route.estimated_cost}</p>
        )}

        <div className="mt-4 flex justify-end">
          <div
            className="h-2 w-10 rounded-full"
            style={{ backgroundColor: route.color }}
            title={`Route color: ${route.color}`}
          />
        </div>
      </div>
    );
  };

  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target)) {
        setShowTooltip(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  function EzPassSelector({ value, onChange }) {
    return (
      <div className="inline-flex w-fit items-center rounded-full bg-[#e8f3ed] p-1 shadow-inner">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition cursor-pointer
            ${value ? 'bg-[#3F5E4A] text-white shadow' : 'text-[#3F5E4A] hover:bg-[#dfeee6]'}`}
        >
          I have E-ZPass
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition cursor-pointer
            ${!value ? 'bg-[#3F5E4A] text-white shadow' : 'text-[#3F5E4A] hover:bg-[#dfeee6]'}`}
        >
          I don’t have E-ZPass
        </button>
      </div>
    );
  }

  function RoundTripToggle({ checked, onChange }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors shadow-inner cursor-pointer
          ${checked ? 'bg-[#3F5E4A]' : 'bg-gray-300/70'}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition
            ${checked ? 'translate-x-[22px]' : 'translate-x-1'}`}
        />
        <span className="sr-only">Include Round Trip</span>
      </button>
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-100">
      <Header
        onAbout={() => scrollToRef(aboutRef)}
        onFAQ={() => scrollToRef(faqRef)}
        onContact={() => scrollToRef(contactRef)}
        onStart={() => scrollToRef(formRef)}
      />
      {/* hero section */}
      <div className="relative h-[85vh] overflow-hidden">
        <BackgroundCarousel />

        <div className="absolute inset-0 z-30 flex items-center justify-center px-4">
          <div className="bg-white/20 backdrop-blur-md rounded-xl px-8 py-6 text-center text-white shadow-lg">
            <h1 className="text-5xl font-bold tracking-tight drop-shadow-lg">
              Eco<span className="text-[#3F5E4A]">Nav</span>
            </h1>
            <p className="text-lg mt-4 max-w-xl drop-shadow-md">
              Designed for road trippers, budget-conscious drivers, and everyday commuters.
            </p>
            <button
              onClick={scrollToForm}
              className="mt-6 px-6 py-2 bg-[#3F5E4A] hover:bg-[#3d6754] text-white font-semibold rounded shadow transition cursor-pointer"
            >
              Get Started
            </button>
          </div>
        </div>
      </div>

      {/* features section */}
      <section
        ref={aboutRef}
        className="bg-gray-100 py-16 px-6 relative bg-[url('/textures/leaves.svg')] bg-no-repeat bg-cover bg-center"
        style={{ backgroundBlendMode: 'multiply', backgroundColor: '#f7fafc' }}
      >
        {/* subtitle */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="text-3xl font-bold text-[#3F5E4A] mb-2">Smarter Driving Starts Here</h2>
          <p className="text-gray-600 text-lg">
            Discover powerful tools designed to help you plan smarter routes, save on fuel, and make every trip more efficient — whether you're heading across town or across the country.
          </p>
        </div>

        {/* feature cards */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: <FaGasPump className="text-5xl text-[#7C5A43] mb-4" />,
              title: "Real-Time Fuel Cost",
              description: "Calculate trip costs instantly using up-to-date fuel prices and your vehicle’s MPG.",
            },
            {
              icon: <FaRoute className="text-5xl text-[#7C5A43] mb-4" />,
              title: "Smart Route Comparison",
              description: "Compare multiple route options by time, distance, fuel used, and cost.",
            },
            {
              icon: <FaCar className="text-5xl text-[#7C5A43] mb-4" />,
              title: "Vehicle MPG Lookup",
              description: "Auto-fill your car’s fuel efficiency based on year, make, and model.",
            },
          ].map((feature, index) => (
            <div
              key={index}
              className="bg-white rounded-xl shadow-lg p-6 text-center transition duration-200 hover:bg-[#e9dfd0]"
            >
              <div className="flex justify-center">{feature.icon}</div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* mission and story */}
        <div className="max-w-4xl mx-auto mt-16 text-center">
          <h3 className="text-2xl font-bold text-[#3F5E4A] mb-4">Our Mission</h3>
          <p className="text-gray-700 leading-relaxed mb-4">
            EcoNav was built to make trip planning smarter, cheaper, and more environmentally conscious.
            By combining real-time fuel pricing, official MPG ratings, and live traffic data, we help
            drivers cut down on unnecessary fuel costs and reduce their carbon footprint — without adding extra steps to their day.
          </p>

          {/* scenic image arc */}
          <div className="relative max-w-3xl mx-auto my-8 h-72 md:h-80 flex items-center justify-center">
            {/* left image */}
            <img
              loading="lazy"
              src="https://hips.hearstapps.com/hmg-prod/images/alpe-di-siusi-sunrise-with-sassolungo-or-langkofel-royalty-free-image-1623254127.jpg?crop=1xw:1xh;center,top&resize=980:*"
              alt="Alpine sunrise over rolling meadows"
              className="w-40 md:w-56 h-28 md:h-36 object-cover rounded-xl shadow-lg -rotate-6 -translate-y-4 relative z-10"
            />
            {/* center image */}
            <img
              loading="lazy"
              src="https://www.josephfiler.com/images/xl/Arizona-Desert-Mountains-2518-Edit.jpg"
              alt="Arizona desert mountains at golden hour"
              className="w-48 md:w-64 h-32 md:h-40 object-cover rounded-xl shadow-xl mx-[-1rem] z-20"
            />
            {/* right image */}
            <img
              loading="lazy"
              src="https://www.slrlounge.com/wp-content/uploads/2020/03/Beach-Landscape-Photography-Seascapes-09.jpg"
              alt="Ocean waves along a bright shoreline"
              className="w-40 md:w-56 h-28 md:h-36 object-cover rounded-xl shadow-lg rotate-6 -translate-y-4 relative z-10"
            />
          </div>

          <h3 className="text-2xl font-bold text-[#3F5E4A] mb-3">Who It’s For</h3>
          <p className="text-gray-700 leading-relaxed mb-8">
            Whether you’re a rideshare driver, a frequent commuter, a road tripper, or just someone
            looking to save money on everyday drives, EcoNav helps you make the most informed decision possible before you hit the road.
          </p>
        </div>
      </section>

      {/* form section */}
      <div ref={formRef} className="relative z-10 pt-32 p-6 max-w-2xl mx-auto text-sm text-black">
        <h2 className="text-3xl font-bold text-center text-[#3F5E4A] mb-6">
          Estimate Your Drive's True Cost
        </h2>
        <p className="text-center text-gray-600 text-lg mt-2 mb-6 max-w-5xl mx-auto">
          Start by entering your origin and destination, then select your vehicle's year, make, and model to autofill its MPG — or input it manually. Choose your fuel type and route preferences, and we'll calculate your estimated fuel cost using real-time gas prices. You can also include a round trip with a single click.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4 bg-white/90 backdrop-blur-md p-6 rounded-xl shadow-lg">
          {/* origin section */}
          <h3 className="font-semibold text-[#3F5E4A] mb-2">Origin</h3>
          <div className="grid grid-cols-10 gap-2 mb-4">
            <input
              type="text"
              name="origin"
              placeholder="Address, City, Landmark, or Zip Code"
              className="col-span-6 p-2 border rounded"
              onChange={handleChange}
              value={form.origin}
            />
            <select
              name="originState"
              className="col-span-4 p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#6cb686] cursor-pointer"
              onChange={handleChange}
              value={form.originState}
            >
              <option value="" disabled>- Select Origin State -</option>
              {STATES.map(s => (
                <option key={s.abbr} value={s.abbr}>
                  {s.name} ({s.abbr})
                </option>
              ))}
            </select>
          </div>

          {/* stops section */}
          <div className="mb-4">
            <h3 className="font-semibold text-[#3F5E4A] mb-2">Stops (optional)</h3>

            {form.stops.length > 0 && form.stops.map((stop, i) => (
              // 11 columns: 6 (address) / 4 (state) / 1 (delete)
              <div key={i} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  placeholder={`Stop #${i + 1} Address`}
                  value={stop.address}
                  onChange={(e) => {
                    const updated = [...form.stops];
                    updated[i].address = e.target.value;
                    setForm(prev => ({ ...prev, stops: updated }));
                  }}
                  className="flex-1 p-2 border rounded"
                />
                <select
                  value={stop.state}
                  onChange={(e) => {
                    const updated = [...form.stops];
                    updated[i].state = e.target.value; // will be 'NJ', 'CA', etc.
                    setForm(prev => ({ ...prev, stops: updated }));
                  }}
                  className="w-40 p-2 border rounded-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6cb686]"
                >
                  <option value="">- Select State -</option>
                  {STATES.map(s => (
                    <option key={s.abbr} value={s.abbr}>
                      {s.name} ({s.abbr})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeStopAt(i)}
                  aria-label={`Remove stop ${i + 1}`}
                  title="Remove stop"
                  className="flex items-center justify-center p-0 m-0"
                  style={{ width: '24px', height: '24px' }}
                >
                  <FaCircleXmark
                    className="text-gray-500 hover:text-red-600 cursor-pointer"
                    size={20}
                  />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                setForm(prev => ({
                  ...prev,
                  stops: [...prev.stops, { address: '', state: '' }]
                }));
              }}
              className="inline-flex items-center justify-center gap-1 rounded-full
                        bg-[#e8f3ed] text-[#3F5E4A] border border-[#cfe4d8]
                        px-3 py-1.5 text-sm font-medium shadow-sm
                        hover:bg-[#dfeee6] hover:border-[#bcdac9]
                        active:translate-y-[1px] active:shadow-none
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6cb686] focus-visible:ring-offset-2
                        cursor-pointer transition"
              aria-label="Add stop"
            >
              <IoIosAddCircle className="text-xl translate-y-[1px] translate-x-[1px]" aria-hidden="true" />
              <span>Add Stop</span>
            </button>
          </div>

          {/* destination section */}
          <h3 className="font-semibold text-[#3F5E4A] mb-2">Destination</h3>
          <div className="grid grid-cols-10 gap-2 mb-4">
            <input
              type="text"
              name="destination"
              placeholder="Address, City, Landmark, or Zip Code"
              className="col-span-6 p-2 border rounded"
              onChange={handleChange}
              value={form.destination}
            />
            <select
              name="destinationState"
              className="col-span-4 p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#6cb686] cursor-pointer"
              onChange={handleChange}
              value={form.destinationState}
            >
              <option value="" disabled>- Select Destination State -</option>
              {STATES.map(s => (
                <option key={s.abbr} value={s.abbr}>
                  {s.name} ({s.abbr})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <div className="flex items-center gap-1 mb-2">
              <h3 className="font-semibold text-[#3F5E4A]">Vehicle MPG Options</h3>
              <div className="relative" ref={tooltipRef}>
                <FaQuestionCircle
                  className="text-[#3F5E4A] cursor-pointer relative top-[1px]"
                  onClick={() => setShowTooltip(prev => !prev)}
                />
                {showTooltip && (
                  <div className="absolute left-6 top-0 w-64 text-sm bg-white border border-gray-300 text-gray-700 rounded-md shadow-md p-3 z-50">
                    <h4 className="font-semibold text-[#3F5E4A] mb-1">What is MPG?</h4>
                    <p>
                      MPG (Miles Per Gallon) measures how far your vehicle can travel on one gallon of fuel.
                      You can autofill this by selecting your car’s details, or enter it manually if you know it.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <p className="text-gray-600 text-sm mb-3">
              Enter your vehicle’s year, make, and model to autofill your MPG,
              or enter it manually.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
              <select name="year" value={vehicle.year} onChange={handleVehicleChange} className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#6cb686] cursor-pointer">
                <option value="" disabled>- Select Year -</option>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>

              <select
                name="make"
                value={vehicle.make}
                onChange={handleVehicleChange}
                disabled={!vehicle.year}
                className={`w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#6cb686] cursor-pointer ${
                  !vehicle.year ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
                }`}
              >
                <option value="" disabled>- Select Make -</option>
                {availableMakes.map(m => <option key={m} value={m}>{m}</option>)}
              </select>

              <select
                name="model"
                value={vehicle.model}
                onChange={handleVehicleChange}
                disabled={!vehicle.make}
                className={`w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#6cb686] cursor-pointer ${
                  !vehicle.make ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
                }`}
              >
                <option value="" disabled>- Select Model -</option>
                {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <button
              type="button"
              onClick={fetchMPG}
              className="text-sm text-[#3F5E4A] underline mb-4 cursor-pointer"
            >
              Autofill MPG
            </button>

            <input
              type="number"
              name="fuelEfficiency"
              value={form.fuelEfficiency}
              placeholder="Enter MPG manually (optional)"
              className="w-full p-2 border"
              onChange={handleChange}
            />
          </div>

          {/* fuel price */}
          <div className="mt-6">
            <label className="font-semibold text-[#3F5E4A]">Fuel Price</label>

            {/* auto / custom segmented control */}
            <div className="mt-2 ml-2 inline-flex rounded-full bg-green-100/40 p-1 text-sm">
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, fuelPriceMode: 'auto' }))}
                className={`px-3 py-1 rounded-full transition cursor-pointer
                  ${form.fuelPriceMode === 'auto'
                    ? 'bg-[#3F5E4A] text-white shadow'
                    : 'text-[#3F5E4A] hover:bg-white/60'}`}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm(p => ({
                    ...p,
                    fuelPriceMode: 'custom',
                    fuelPrice: ''   // always reset so the input shows the placeholder
                  }))
                }
                className={`ml-1 px-3 py-1 rounded-full transition cursor-pointer
                  ${form.fuelPriceMode === 'custom'
                    ? 'bg-[#3F5E4A] text-white shadow'
                    : 'text-[#3F5E4A] hover:bg-white/60'}`}
              >
                Custom
              </button>
            </div>

            {/* auto mode: show fuel-type dropdown + current average */}
            {form.fuelPriceMode === 'auto' ? (
              <>
                <p className="mt-2 text-xs text-gray-600">
                  We’ll use the U.S. average from the EIA based on your fuel type.
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <select
                    name="fuelType"
                    className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#6cb686] cursor-pointer"
                    onChange={handleChange}
                    value={form.fuelType}
                  >
                    <option value="" disabled>- Select Fuel Type -</option>
                    <option value="Regular">Regular</option>
                    <option value="Midgrade">Midgrade</option>
                    <option value="Premium">Premium</option>
                    <option value="Diesel">Diesel</option>
                  </select>

                  <span className="text-sm text-gray-600 whitespace-nowrap">
                    {autoFuelLoading ? (
                      'Loading…'
                    ) : autoFuelPrice != null ? (
                      <>
                        ${autoFuelPrice.toFixed(2)} <span className="text-gray-500">/ gal</span>
                      </>
                    ) : (
                      ''
                    )}
                  </span>
                </div>
              </>
            ) : (
              // custom mode: numeric input + reset
              <div className="mt-2 flex items-center gap-2">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  name="fuelPrice"
                  step="0.01"
                  min="0.50"
                  max="15"
                  placeholder="3.00"
                  value={form.fuelPrice}
                  onChange={handleChange}
                  className="w-28 p-2 border rounded-md"
                />
                <span className="text-sm text-gray-500">per gallon</span>
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, fuelPriceMode: 'auto', fuelPrice: '' }))}
                  className="text-xs text-[#3F5E4A] underline cursor-pointer"
                >
                  Reset to average
                </button>
              </div>
            )}
          </div>

          <div className="mt-4">
            <label
              htmlFor="routePreference"
              className="block mb-2 font-semibold text-[#3F5E4A]"
            >
              Route Preference
            </label>

            <select
              id="routePreference"
              name="preferredRouteType"
              className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#6cb686] cursor-pointer"
              onChange={handleChange}
              value={form.preferredRouteType}
            >
              <option value="" disabled>- Select Route Preference -</option>
              <option value="none">No Preference</option>
              <option value="fastest">Fastest</option>
              <option value="shortest">Shortest</option>
              <option value="fuel_efficient">Most Fuel Efficient</option>
              <option value="cheapest">Cheapest (fuel + tolls)</option>
            </select>

            <p className="mt-1 text-xs text-gray-600">
              “Cheapest” considers both fuel and tolls.
            </p>
          </div>

          {/* toll pricing block */}
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-[#3F5E4A]">Toll Pricing</label>

            {/* dim/disable the E-ZPass selector visually when avoiding tolls */}
            <div className={form.avoidTolls ? "opacity-50 pointer-events-none" : ""}>
              <EzPassSelector
                value={form.useEzpass}
                onChange={(v) => setForm(prev => ({ ...prev, useEzpass: v }))}
              />
            </div>

            <p className="text-xs text-gray-500">
              We’ll calculate tolls using{" "}
              <span className="font-bold">
                {form.useEzpass ? "E-ZPass" : "cash/Toll-by-Mail"}
              </span>{" "}
              rates when available.
            </p>
          </div>

          {/* avoid tolls */}
          <div className="mt-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <RoundTripToggle
                  checked={form.avoidTolls}
                  onChange={(v) => setForm(p => ({ ...p, avoidTolls: v }))}
                />
              </div>
              <span
                className="text-[#3F5E4A] font-medium select-none cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => setForm(p => ({ ...p, avoidTolls: !p.avoidTolls }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setForm(p => ({ ...p, avoidTolls: !p.avoidTolls }));
                  }
                }}
              >
                Avoid Tolls
              </span>
            </div>

            <p className="text-xs text-gray-600 mt-1">
              {form.avoidTolls
                ? 'Avoid tolls when possible; we’ll mark any unavoidable ones.'
                : 'Allow toll roads. If present, we’ll estimate them using your selection above.'}
            </p>
          </div>

          {/* include round trip */}
          <div className="mt-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <RoundTripToggle
                  checked={form.includeRoundTrip}
                  onChange={(v) => setForm(prev => ({ ...prev, includeRoundTrip: v }))}
                />
              </div>
              <span
                className="font-medium text-[#3F5E4A] select-none cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => setForm(p => ({ ...p, includeRoundTrip: !p.includeRoundTrip }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setForm(p => ({ ...p, includeRoundTrip: !p.includeRoundTrip }));
                  }
                }}
              >
                Include Round Trip
              </span>
            </div>
          </div>

          <button type="submit" className="bg-[#3F5E4A] text-white px-4 py-2 rounded cursor-pointer"> 
            {loading ? 'Calculating...' : 'Estimate Cost'} 
          </button>
        </form>

        {error && <p className="text-red-600 mt-4">{error}</p>}

        {result && (
          <div ref={summaryRef} className="mt-6">
            <div className="bg-white hover:bg-[#e9dfd0] transition-colors duration-300 rounded-2xl shadow p-6 max-w-xl mx-auto text-center border border-gray-200 mb-5">
              <div className="flex justify-center mb-4">
                <FaPaperPlane className="text-[#7C5A43] text-4xl" />
              </div>
              <h2 className="text-lg font-semibold text-black mb-2">Trip Summary</h2>
              <div className="text-gray-600 text-sm space-y-1">
                {submittedForm && (
                  <>
                    <p><strong>Origin:</strong> {submittedForm.origin}</p>
                    <p><strong>Destination:</strong> {submittedForm.destination}</p>
                    <p><strong>Round Trip:</strong> {submittedForm.includeRoundTrip ? 'Yes' : 'No'}</p>

                    {submittedForm.fuelPriceMode === 'custom' && submittedForm.fuelPrice
                      ? (
                        <p>
                          <strong>Fuel Price:</strong> ${Number(submittedForm.fuelPrice).toFixed(2)}{' '}
                          <span className="text-gray-600">(custom)</span>
                        </p>
                      ) : (
                        <p>
                          <strong>Fuel Price:</strong> ${Number(result.fuel_price).toFixed(2)}{' '}
                          <span className="text-gray-600">(U.S. average)</span>
                        </p>
                      )
                    }

                    <p><strong>Fuel Type:</strong> {submittedForm.fuelType || '—'}</p>
                    <p><strong>Vehicle MPG:</strong> {submittedForm.fuelEfficiency || '—'}</p>

                    <p>
                      <strong>Toll Setting:</strong>{' '}
                      {submittedForm.avoidTolls
                        ? 'Avoid tolls'
                        : submittedForm.useEzpass
                          ? 'E-ZPass rates (if supported)'
                          : 'Cash/Toll-by-Mail rates'}
                    </p>

                    <p>
                      <strong>Preferred Route Type:</strong>{' '}
                      {{
                        none: 'No Preference',
                        fastest: 'Fastest',
                        shortest: 'Shortest',
                        fuel_efficient: 'Most Fuel Efficient',
                        cheapest: 'Cheapest'
                      }[submittedForm.preferredRouteType] || 'No Preference'}
                    </p>

                    <p>
                      <strong>Stops:</strong>{' '}
                      {(submittedForm.stops || []).filter(s => s?.address?.trim()).length}
                    </p>
                  </>
                )}
              </div>
            </div>
    
            {/* OUTBOUND */}
            {result.outbound_routes?.length > 0 && (
              <div className="mt-10">
                <h3 className="font-semibold text-lg mb-1">Destination Routes:</h3>

                {/* sort chips */}
                <div className="px-8 mb-2">
                  <SortControls
                    value={outboundSort}
                    onChange={(v) => {
                      setOutboundSort(v);
                      setSelectedOutboundIndex(0); // top route becomes the recommended one
                    }}
                  />
                </div>

                {/* cards */}
                <div className="w-full px-8 overflow-x-auto">
                  <div className="flex gap-4 w-max pb-2">
                    {outboundSorted.map((r, i) => (
                      <RouteCard
                        key={i}
                        route={r}
                        index={i}
                        isSelected={selectedOutboundIndex === i}
                        onClick={() => setSelectedOutboundIndex(i)}
                        recommended={outboundSort !== 'none' && i === 0}
                      />
                    ))}
                  </div>
                </div>

                {/* map uses the sorted routes */}
                <div className="mt-4 px-8">
                  <ReactLeafletMap
                    key={JSON.stringify({ kind: 'outbound', routes: outboundSorted, stops: result.stops })}
                    routes={outboundSorted}
                    selectedIndex={selectedOutboundIndex}
                    setSelectedIndex={setSelectedOutboundIndex}
                    stops={result.stops}
                  />
                </div>
              </div>
            )}

            {/* RETURN */}
            {result.return_routes?.length > 0 && (
              <div className="mt-10">
                <h3 className="font-semibold text-lg mb-1">Return Routes:</h3>

                {/* sort chips */}
                <div className="px-8 mb-2">
                  <SortControls
                    value={returnSort}
                    onChange={(v) => {
                      setReturnSort(v);
                      setSelectedReturnIndex(0);
                    }}
                  />
                </div>

                {/* cards */}
                <div className="w-full px-8 overflow-x-auto">
                  <div className="flex gap-4 w-max pb-2">
                    {returnSorted.map((r, i) => (
                      <RouteCard
                        key={i}
                        route={r}
                        index={i}
                        isSelected={selectedReturnIndex === i}
                        onClick={() => setSelectedReturnIndex(i)}
                        recommended={returnSort !== 'none' && i === 0}
                      />
                    ))}
                  </div>
                </div>

                {/* map uses the sorted routes */}
                <div className="mt-4 px-8">
                  <ReactLeafletMap
                    key={JSON.stringify({ kind: 'return', routes: returnSorted, stops: result.stops })}
                    routes={returnSorted}
                    selectedIndex={selectedReturnIndex}
                    setSelectedIndex={setSelectedReturnIndex}
                    stops={result.stops}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* FAQ section */}
        <section ref={faqRef} className="max-w-3xl mx-auto mt-20 px-6 py-12 bg-white rounded-2xl shadow">
          <h2 className="text-2xl font-bold text-[#3F5E4A] mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4 text-gray-700">
            <div>
              <p className="font-semibold">1. How accurate are your fuel cost estimates?</p>
              <p className="text-sm">We combine live fuel price data from the U.S. Energy Information Administration (EIA) with Google Directions API traffic-adjusted routes. This means our estimates are typically within a few cents of real-world costs, depending on local price fluctuations.</p>
            </div>
            <div>
              <p className="font-semibold">2. What data sources power EcoNav?</p>
              <ul className="list-disc list-outside pl-5 text-sm space-y-1 mt-1">
                <li>Google Directions API for real-time traffic, distance, and route options.</li>
                <li>EIA for weekly state and national average fuel prices.</li>
                <li>EPA Fuel Economy API for official MPG ratings by year, make, and model.</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold">3. How do you choose between state and national fuel prices?</p>
              <p className="text-sm">
                For now we primarily use the U.S. <em>weekly national average</em> from the EIA for the fuel type you select.
                State-level pricing isn’t consistently available via our current data source, so even single-state trips may show the national average.
                Because local prices vary, please double-check the number shown and, if needed, switch Fuel Price to <strong>Custom</strong> to enter your own
                (e.g., your state’s current average or your station’s price).
              </p>
            </div>
            <div>
              <p className="font-semibold">4. Does EcoNav factor in real-time traffic conditions?</p>
              <p className="text-sm">Yes. Route times and fuel use are calculated with live traffic data, so congestion can influence route recommendations and cost estimates.</p>
            </div>
            <div>
              <p className="font-semibold">5. Can EcoNav be used internationally?</p>
              <p className="text-sm">Currently, EcoNav is optimized for the United States. Fuel price integration and some route data may be limited or unavailable in other countries.</p>
            </div>
            <div>
              <p className="font-semibold">6. How does EcoNav estimate toll costs?</p>
              <p className="text-sm">We request toll advisories from Google’s Routes API for each route. When Google provides a price, we convert it to dollars and add it to your fuel estimate to show a total. If a toll is known but no price is available for that direction or road, we show “—” instead of guessing.</p>
            </div>
            <div>
              <p className="font-semibold">7. How does E-ZPass affect toll pricing, and what if I’m outside E-ZPass states?</p>
              <p className="text-sm">If you select “I have E-ZPass,” we price routes using E-ZPass discounts where Google supports them. Outside that network, we fall back to cash/Toll-by-Mail rates. Estimates assume a standard passenger car; actual charges can vary with vehicle class, time-of-day pricing, or local rules.</p>
            </div>
          </div>
        </section>

        {/* contact section */}
        <section
          ref={contactRef}
          className="max-w-3xl mx-auto mt-12 mb-24 px-6 py-12 bg-white rounded-2xl shadow"
        >
          <h2 className="text-2xl font-bold text-[#3F5E4A] mb-4">Contact</h2>
          <p className="text-gray-700 mb-6">
            Questions, feedback, feature requests, or bug reports? Feel free to reach out directly.
          </p>
          <div className="space-y-2 text-gray-800">
            <p>
              <span className="font-semibold">Name:</span> Matthew O&apos;Mara
            </p>
            <p>
              <span className="font-semibold">Email:</span>{" "}
              <a
                href="mailto:mro6@njit.edu"
                className="text-[#3F5E4A] underline hover:text-[#2d4636]"
              >
                mro6@njit.edu
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
