import { Link as RouterLink } from 'react-router-dom';
export default function Link({ href, children, ...props }: any) { return <RouterLink to={href} {...props}>{children}</RouterLink>; }
