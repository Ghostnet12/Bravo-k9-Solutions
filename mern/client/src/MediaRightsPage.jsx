import { Editable } from './SiteContent';
import { Page } from './ui';

export default function MediaRightsPage() {
  return <Page title="Bravo media & permissions" eyebrow="Brand standards"><Editable as="div" contentKey="mediarightspage-1" className="panel prose"><Editable as="p" contentKey="mediarightspage-2" canEditText>Bravo’s logo, team photographs, copy, and branded materials are provided for viewing on this website. Contact Bravo K9 Solutions for permission before reusing them.</Editable><Editable as="p" contentKey="mediarightspage-3" canEditText>Rights depend on the individual asset and its applicable license. A notice or a browser control does not establish ownership or make an image impossible to copy.</Editable><Editable as="p" contentKey="mediarightspage-4">For permission requests, call <Editable as="a" contentKey="mediarightspage-5" canEditLink canEditText href="tel:+16058242767">(605) 824-2767</Editable>. Please identify the image and intended use.</Editable></Editable></Page>;
}
