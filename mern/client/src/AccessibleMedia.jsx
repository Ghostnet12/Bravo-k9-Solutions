import { Link } from 'react-router-dom';
import { Editable } from './SiteContent';

export default function AccessibleMedia() {
  return <section id="accessible-media" className="panel prose" aria-labelledby="accessible-media-title">
    <Editable as="h2" contentKey="accessible-media-title" canEditText id="accessible-media-title">Captions &amp; transcripts</Editable>
    <Editable as="p" contentKey="accessible-media-lessons" canEditText>When you have access to a published online lesson, use its caption controls and written transcript or lesson instructions. The course library may not yet be open for enrollment.</Editable>
    <Editable as="p" contentKey="accessible-media-public" canEditText>Public training clips and videos hosted on other platforms may not include captions or a transcript. Check the individual player for available captions.</Editable>
    <Editable as="p" contentKey="accessible-media-help" canEditText>If a video is difficult to access, tell Bravo which video you mean and what format would help. Contact the team to discuss available assistance; a transcript is not guaranteed to be available for every clip.</Editable>
    <Link className="button button-ghost" to="/contact">Ask about a media alternative</Link>
  </section>;
}
