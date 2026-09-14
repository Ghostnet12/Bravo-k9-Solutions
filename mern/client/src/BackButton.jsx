import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useBravo } from './context';

export default function BackButton() {
  const navigate = useNavigate(), { pathname } = useLocation(), { user } = useBravo();
  if (pathname === '/') return null;
  const fallback = pathname === '/account' ? '/' : pathname === '/admin' ? '/account' : ['staff', 'owner'].includes(user?.role) ? '/admin' : user ? '/account' : '/';
  return <div className="page-return-row"><button type="button" className="button button-ghost page-back" onClick={() => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }}><span aria-hidden="true">← </span>Back</button>{user && !['/account', '/admin'].includes(pathname) && <Link className="inline-link" to={['staff', 'owner'].includes(user.role) ? '/admin?tab=schedule' : '/account'}>{['staff', 'owner'].includes(user.role) ? 'Team schedule' : 'My account'}</Link>}</div>;
}
