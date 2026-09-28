import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Map, ShoppingBag, BookOpen, User, LayoutDashboard, Compass, Car, Users, Plane, LogOut } from 'lucide-react';
import SOSButton from '../Safety/SOSButton';
import './Navbar.css';

const initial = (u) => (u?.full_name || 'W').trim().charAt(0).toUpperCase();

function Navbar({ user, onLogout }) {
  const { pathname: path } = useLocation();
  const isVendor = user?.role === 'vendor';
  const isProvider = user?.role === 'provider';

  const travelerTabs = [
    { to: '/', icon: Map, label: 'Explore', active: path === '/' || path.startsWith('/activity') || path === '/create-activity' },
    { to: '/waves', icon: Car, label: 'Waves', active: path.startsWith('/wave') },
    { to: '/groups', icon: Users, label: 'Groups', active: path.startsWith('/groups') },
    { to: '/marketplace', icon: ShoppingBag, label: 'Shop', active: path === '/marketplace' },
    { to: '/packages', icon: Compass, label: 'Trips', active: path === '/packages' },
    { to: '/journal', icon: BookOpen, label: 'Journal', active: path === '/journal' },
    { to: '/profile', icon: User, label: 'Me', active: path === '/profile', mobileOnly: true },
  ];

  const vendorTabs = [
    { to: '/vendor/dashboard', icon: LayoutDashboard, label: 'Dashboard', active: path === '/vendor/dashboard' },
    { to: '/marketplace', icon: ShoppingBag, label: 'View marketplace', active: path === '/marketplace' },
    { to: '/profile', icon: User, label: 'Settings', active: path === '/profile' },
  ];

  const providerTabs = [
    { to: '/provider/dashboard', icon: LayoutDashboard, label: 'Dashboard', active: path === '/provider/dashboard' },
    { to: '/packages', icon: Plane, label: 'Browse trips', active: path === '/packages' },
    { to: '/profile', icon: User, label: 'Settings', active: path === '/profile' },
  ];

  // Partners get the indigo sidebar (desktop) and the same bottom tab bar on phones
  if (isVendor || isProvider) {
    const tabs = isProvider ? providerTabs : vendorTabs;
    return (
      <>
        <aside className="sidebar">
          <Link to="/" className="brand on-dark">
            <span className="brand-mark"><Compass size={22} /></span>
            <span><span className="brand-name">Wander<span>Mates</span></span><small>Partner</small></span>
          </Link>
          <nav>
            {tabs.map(({ to, icon: Icon, label, active }) => (
              <Link key={to} to={to} className={active ? 'active' : ''}><Icon size={18} />{label}</Link>
            ))}
            <button onClick={onLogout}><LogOut size={18} />Sign out</button>
          </nav>
          <div className="who">
            <span className="avatar">{initial(user)}</span>
            <div><b>{user.full_name}</b><small>{isProvider ? 'Trip operator' : 'Verified vendor'}</small></div>
          </div>
        </aside>
        <TabBar tabs={tabs} />
      </>
    );
  }

  return (
    <>
      <header className="topnav">
        <Link to="/" className="brand">
          <span className="brand-mark"><Compass size={22} /></span>
          <span className="brand-name">Wander<span>Mates</span></span>
        </Link>
        <nav className="links">
          {travelerTabs.filter((t) => !t.mobileOnly).map(({ to, label, active }) => (
            <Link key={to} to={to} className={active ? 'active' : ''}>{label}</Link>
          ))}
        </nav>
        <div className="right">
          <SOSButton variant="nav" />
          <Link to="/profile" className={`user-pill ${path === '/profile' ? 'active' : ''}`}>
            <span className="avatar violet sm" style={{ background: 'var(--violet)', color: '#fff' }}>{initial(user)}</span>
            <b>{user.full_name?.split(' ')[0]}</b>
          </Link>
        </div>
      </header>
      <TabBar tabs={travelerTabs} />
      <SOSButton variant="fab" />
    </>
  );
}

const TabBar = ({ tabs }) => (
  <nav className="tabbar">
    {tabs.map(({ to, icon: Icon, label, active }) => (
      <Link key={to} to={to} className={active ? 'active' : ''}>
        <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
        <span>{label.replace('View marketplace', 'Shop')}</span>
      </Link>
    ))}
  </nav>
);

export default Navbar;
