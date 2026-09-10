import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import Brand from './Brand';
import { useBravo } from './context';
export function Header() {
  const { user } = useBravo();
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="app-header"><Brand/><button className="menu-toggle" aria-expanded={menuOpen} aria-controls="bravo-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? 'Close menu' : 'Menu'}</button><nav id="bravo-navigation" className={menuOpen ? 'is-open' : ''} onClick={() => setMenuOpen(false)} aria-label="Primary navigation"><NavLink to="/">Home</NavLink><NavLink to="/portal">Book a visit</NavLink><NavLink to="/learn">Online training</NavLink><NavLink to="/community">Bravo Room</NavLink><NavLink to="/account">{user ? 'My account' : 'Sign in'}</NavLink>{user?.role === 'staff' && <NavLink to="/admin">Staff desk</NavLink>}</nav></header>;
}
export function Footer() { return <footer className="app-footer shell"><span>© {new Date().getFullYear()} Bravo K9 Solutions, LLC</span><NavLink to="/contact">Contact & visit help</NavLink><NavLink to="/media-rights">Media permissions</NavLink><a href="tel:+16058242767">(605) 824-2767</a><span>TRUST. TRAIN. DEPLOY.</span></footer>; }
export function Page({ children, title, eyebrow, intro, className = '' }) { return <><Header/><main id="main-content" tabIndex={-1} className={`app-page shell ${className}`}><div className="app-page-title"><p className="kicker gold">{eyebrow}</p><h1>{title}</h1>{intro && <p>{intro}</p>}</div>{children}</main><Footer/></>; }
export function Notice({ children, error = false }) { return children ? <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div> : null; }
export function SetupNotice() { const { config } = useBravo(); return config && !config.connected ? <Notice>Online accounts and booking are being connected. Browse the programs, or <a href="tel:+16058242767">call (605) 824-2767</a> to arrange care.</Notice> : null; }
export const formatDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const formatTime = time => { const h = Number(time.slice(0, 2)); return `${h % 12 || 12}:00 ${h >= 12 ? 'PM' : 'AM'}`; };
