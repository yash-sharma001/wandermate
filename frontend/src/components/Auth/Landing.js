import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Compass, Coffee, Mountain, Users, ShieldCheck, User, TriangleAlert, ArrowRight, ArrowDown, MapPin, Search, Car, BookOpen, Store, Lock, Phone } from 'lucide-react';
import './Auth.css';

export const Brand = ({ onDark }) => (
  <Link to="/" className={`brand ${onDark ? 'on-dark' : ''}`}>
    <span className="brand-mark"><Compass size={22} /></span>
    <span className="brand-name">Wander<span>Mates</span></span>
  </Link>
);

// Stylised street map of the Tapovan / Laxman Jhula stretch: blocks, lanes, the Ganga, a bridge, parks and contour lines
const MapArt = () => (
  <svg className="map-art" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="600" height="600" fill="#5B2EE0" />
    {/* contour lines */}
    <g fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="2">
      <path d="M-20 90 C120 40 220 130 330 80 S520 20 640 70" />
      <path d="M-20 130 C110 90 230 170 335 120 S520 66 640 112" />
      <path d="M-20 170 C120 140 235 210 340 160 S520 110 640 154" />
      <path d="M-20 470 C90 430 180 500 300 470 S500 420 640 480" />
      <path d="M-20 510 C100 480 190 545 300 512 S500 466 640 520" />
    </g>
    {/* parks */}
    <g fill="rgba(200,240,214,.16)">
      <path d="M40 300 C60 250 130 240 170 275 C205 305 190 360 140 372 C90 384 30 350 40 300Z" />
      <path d="M430 400 C470 370 545 385 560 430 C572 470 520 505 470 495 C420 485 405 425 430 400Z" />
    </g>
    {/* city blocks */}
    <g fill="rgba(255,255,255,.07)">
      <rect x="60" y="120" width="70" height="46" rx="8" /><rect x="142" y="120" width="52" height="46" rx="8" />
      <rect x="60" y="182" width="52" height="60" rx="8" /><rect x="124" y="182" width="70" height="60" rx="8" />
      <rect x="452" y="150" width="70" height="52" rx="8" /><rect x="452" y="214" width="46" height="64" rx="8" />
      <rect x="510" y="214" width="60" height="64" rx="8" /><rect x="370" y="96" width="60" height="44" rx="8" />
      <rect x="70" y="408" width="66" height="54" rx="8" /><rect x="148" y="408" width="54" height="54" rx="8" />
      <rect x="360" y="330" width="56" height="50" rx="8" /><rect x="360" y="396" width="56" height="60" rx="8" />
      <rect x="230" y="500" width="70" height="44" rx="8" />
    </g>
    {/* the river */}
    <path d="M300 -10 C240 90 330 170 290 260 C250 350 340 420 300 500 C280 545 310 580 330 615" fill="none" stroke="rgba(255,255,255,.17)" strokeWidth="64" strokeLinecap="round" />
    <path d="M300 -10 C240 90 330 170 290 260 C250 350 340 420 300 500 C280 545 310 580 330 615" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2" strokeDasharray="3 10" transform="translate(26 0)" />
    {/* main roads */}
    <g fill="none" stroke="rgba(255,255,255,.2)" strokeLinecap="round">
      <path d="M-20 262 L330 300 L640 350" strokeWidth="11" />
      <path d="M110 -10 C130 150 90 320 130 615" strokeWidth="9" />
      <path d="M470 -10 C440 200 500 380 470 615" strokeWidth="9" />
    </g>
    {/* lanes */}
    <g fill="none" stroke="rgba(255,255,255,.11)" strokeWidth="4" strokeLinecap="round">
      <path d="M-20 110 L640 190" /><path d="M-20 400 L640 470" /><path d="M-20 560 L330 540 L640 566" />
      <path d="M210 -10 L240 615" /><path d="M540 -10 L560 615" /><path d="M20 -10 L30 615" />
      <path d="M380 260 L630 240" /><path d="M120 330 L280 350" />
    </g>
    {/* the suspension bridge */}
    <path d="M262 286 L346 296" stroke="var(--amber)" strokeWidth="6" strokeLinecap="round" />
    <g stroke="var(--amber)" strokeWidth="1.5" opacity=".7"><path d="M274 287 L274 272 M292 289 L292 270 M310 291 L310 272 M328 293 L328 274" /></g>
    {/* labels */}
    <g fill="rgba(255,255,255,.55)" fontFamily="DM Sans, sans-serif" fontSize="14" fontWeight="600" letterSpacing=".04em">
      <text x="120" y="102">TAPOVAN</text><text x="352" y="322">Laxman Jhula</text>
      <text x="410" y="570">Ram Jhula</text><text x="228" y="220" transform="rotate(84 228 220)" fill="rgba(255,255,255,.4)">GANGA</text>
    </g>
  </svg>
);

const HeroMap = ({ dark }) => (
  <div className="hero-map" aria-hidden="true">
    <MapArt />
    <div className="pin" style={{ left: '14%', top: '24%', background: 'var(--amber)' }}><Coffee size={24} /></div>
    <div className="pin" style={{ right: '16%', top: '14%', background: '#fff', color: 'var(--violet)' }}><Mountain size={24} /></div>
    <div className="pin center" style={dark ? { left: '38%', top: '34%', background: 'var(--amber)', color: 'var(--ink)' } : { left: '38%', top: '36%' }}><Users size={30} /></div>
    <div className="hero-card">
      <span className="avatar-stack">
        <span className="avatar">PS</span><span className="avatar violet">AN</span><span className="avatar amber">MK</span>
      </span>
      <div className="grow"><b>Sunrise hike · 5:00 AM</b><span className="muted small">6 travelers going near Tapovan</span></div>
      <span className="btn amber sm">Join</span>
    </div>
  </div>
);

const STEPS = [
  { icon: Search, tone: 'violet', title: 'Find your people', text: 'Open the map and see meetups, rides and trips happening around you right now.' },
  { icon: Users, tone: 'amber', title: 'Join in one tap', text: 'RSVP to a hike, request a seat in a shared cab, or book a local experience.' },
  { icon: ShieldCheck, tone: 'pink', title: 'Travel with a safety net', text: 'Everyone is verified, women-only meetups exist, and SOS reaches your people in seconds.' },
];

const EXTRAS = [
  { icon: Car, title: 'Waves', text: 'Share cabs and split the fare with verified travelers.' },
  { icon: Store, title: 'Shop local', text: 'Rafting, yoga, stays and cafes from vendors nearby.' },
  { icon: Compass, title: 'Trips', text: 'Multi-day treks and retreats from verified operators.' },
  { icon: BookOpen, title: 'Journal', text: 'A private diary of every place you pinned, only you can see it.' },
];

const SAFETY = [
  { icon: ShieldCheck, title: 'ID-verified travelers', text: 'Aadhaar, phone and email checks unlock hosting and build trust levels.' },
  { icon: Users, title: 'Women-only meetups', text: 'Hosts can restrict events to verified women travelers.' },
  { icon: Phone, title: 'Hold-to-alert SOS', text: 'Hold for 1.5 seconds and your live location goes to your emergency contacts.' },
  { icon: Lock, title: 'Private by default', text: 'Your journal, contacts and documents are visible only to you.' },
];

function Landing() {
  const navigate = useNavigate();
  return (
    <div className="landing-page">
      <div className="landing">
        <div className="blob-a" /><div className="blob-b" />
        <nav className="landing-nav">
          <Brand />
          <div className="links"><a href="#how">How it works</a><a href="#safety">Safety</a><a href="#vendors">For vendors</a></div>
          <Link to="/login" className="btn">Log in</Link>
          <Link to="/register" className="btn dark">Get started</Link>
        </nav>
        <section className="landing-hero">
          <div>
            <div className="pill-note"><MapPin size={14} /> Now live in Rishikesh</div>
            <h1>Your travel <mark>tribe</mark> awaits.</h1>
            <p className="lead">Meet travelers nearby, join local meetups, share rides and keep a private travel diary — with verification and SOS built in.</p>
            <div className="cta">
              <button className="btn primary lg" onClick={() => navigate('/register')}>Get started — it's free</button>
              <a className="btn lg" href="#how">See how it works <ArrowDown size={16} /></a>
            </div>
            <div className="promises">
              <span className="tag"><ShieldCheck size={13} /> Verified travelers</span>
              <span className="tag pink"><Users size={13} /> Women-only meetups</span>
              <span className="tag red"><TriangleAlert size={13} /> Hold-to-alert SOS</span>
            </div>
          </div>
          <HeroMap />
        </section>
      </div>

      <div className="landing-m">
        <Brand onDark />
        <HeroMap dark />
        <h1>Your travel tribe awaits.</h1>
        <p className="lead">Meet travelers nearby, join local meetups, share rides and keep a private travel diary — with verification and SOS built in.</p>
        <div className="promises">
          <span className="tag"><ShieldCheck size={15} /> Verified travelers</span>
          <span className="tag"><User size={15} /> Women-only meetups</span>
          <span className="tag"><TriangleAlert size={15} /> Hold-to-alert SOS</span>
        </div>
        <button className="btn amber lg block" onClick={() => navigate('/register')}>Get started <ArrowRight size={18} /></button>
        <button className="btn ghost-light lg block" onClick={() => navigate('/login')}>I already have an account</button>
        <a className="how-link" href="#how">How it works <ArrowDown size={14} /></a>
      </div>

      <section className="l-section" id="how">
        <div className="l-wrap">
          <span className="eyebrow">HOW IT WORKS</span>
          <h2 className="l-title">From “where to?” to “see you there” in three steps</h2>
          <div className="steps">
            {STEPS.map(({ icon: Icon, tone, title, text }, i) => (
              <div className="card step" key={title}>
                <span className="n">{i + 1}</span>
                <span className={`icon-tile ${tone}`}><Icon size={22} /></span>
                <h3>{title}</h3><p className="muted">{text}</p>
              </div>
            ))}
          </div>
          <div className="extras">
            {EXTRAS.map(({ icon: Icon, title, text }) => (
              <div className="extra" key={title}><span className="icon-tile"><Icon size={20} /></span><div><b>{title}</b><p className="muted small">{text}</p></div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="l-section dark" id="safety">
        <div className="l-wrap safety-grid">
          <div>
            <span className="eyebrow light">SAFETY FIRST</span>
            <h2 className="l-title">Built so you can say yes to new people</h2>
            <p className="lead-light">Trust is earned in levels. The more you verify, the more you can do, and the safer everyone feels.</p>
            <button className="btn amber lg" onClick={() => navigate('/register')}>Create your account</button>
          </div>
          <div className="safety-list">
            {SAFETY.map(({ icon: Icon, title, text }) => (
              <div className="s-item" key={title}><span className="icon-tile pink"><Icon size={20} /></span><div><b>{title}</b><p>{text}</p></div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="l-section" id="vendors">
        <div className="l-wrap vendor-cta card">
          <div><span className="eyebrow">FOR VENDORS &amp; OPERATORS</span>
            <h2 className="l-title" style={{ marginBottom: 8 }}>Run experiences? Meet travelers who are already here.</h2>
            <p className="muted">List rafting, yoga, stays or multi-day trips and manage requests from one dashboard.</p></div>
          <Link to="/register" className="btn primary lg">List your experiences <ArrowRight size={18} /></Link>
        </div>
      </section>

      <footer className="l-foot"><Brand /><span className="muted small">Made for travelers in Rishikesh and beyond.</span></footer>
    </div>
  );
}

export default Landing;
