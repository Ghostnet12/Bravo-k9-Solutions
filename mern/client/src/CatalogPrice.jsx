import { useBravo } from './context';
import { SERVICES, money } from '../../shared/catalog';

export default function CatalogPrice({ service = 'training', field = 'cents', ...props }) {
  const { config } = useBravo();
  const value = (config?.services || SERVICES).find(item => item.id === service)?.[field] ?? SERVICES.find(item => item.id === service)?.[field];
  return <span {...props} style={{font:'inherit',letterSpacing:'inherit',color:'inherit',display:'inline',margin:0}} data-site-service={service} data-site-price={service} data-site-price-field={field}>{money(value)}</span>;
}
