import { Editable } from './SiteContent';
export default function TrainingApproach() {
  return <div className="training-approach" aria-label="Bravo’s training approach">
    <div><Editable as="h3" contentKey="approach-rewards-title" canEditText>No treats. No toys.</Editable><Editable as="p" contentKey="approach-rewards-copy" canEditText>We work on calm communication and everyday behavior without depending on food or toy rewards. Ask your trainer how that approach fits your dog.</Editable></div>
    <div><Editable as="h3" contentKey="approach-private-title" canEditText>Private sessions.</Editable><Editable as="p" contentKey="approach-private-copy" canEditText>No group classes. Your trainer focuses on your dog, your household, and the situations you want help with.</Editable></div>
    <div><Editable as="h3" contentKey="approach-mobile-title" canEditText>We come to you.</Editable><Editable as="p" contentKey="approach-mobile-copy" canEditText>Practice at home and in everyday surroundings in Aberdeen and the surrounding area. Tell us your location when requesting a visit.</Editable></div>
  </div>;
}
