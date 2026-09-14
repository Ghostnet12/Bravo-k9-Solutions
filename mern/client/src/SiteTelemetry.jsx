import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useBravo } from './context';
import { PUBLIC_PAGES } from '../../shared/telemetry.js';
import { installErrorMonitoring, enableMonitoring, setTrackingAudience, trackVisit } from './telemetry';
export default function SiteTelemetry() {
  const { user, authReady, config } = useBravo(), { pathname, search } = useLocation();
  useEffect(installErrorMonitoring, []);
  useEffect(() => {
    enableMonitoring(config?.monitoringEnabled);
    if (!authReady) return;
    setTrackingAudience(user);
    const newBooking = pathname === '/portal' && !new URLSearchParams(search).has('edit');
    if (PUBLIC_PAGES.includes(pathname) || newBooking) trackVisit('visit');
    if (newBooking && !user?.mustChangePassword) trackVisit('booking_started');
  }, [authReady, config?.monitoringEnabled, user?.id, user?.role, pathname, search]);
  return null;
}
