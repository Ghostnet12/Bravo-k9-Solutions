export const BOOKING_STAGES = [
  { id: 'dog', label: 'Your dog' },
  { id: 'trainer', label: 'Trainer' },
  { id: 'visit', label: 'Date and time' },
  { id: 'review', label: 'Review' },
];
export const bookingStageNumber = id => String(BOOKING_STAGES.findIndex(stage => stage.id === id) + 1).padStart(2, '0');
const STAGE_HELP = { dog: 'Tell us about your dog. You can adjust the details before submitting.', trainer: 'Choose an available trainer or ask Bravo for guidance.', visit: 'Select a date and time. This is a request, not a confirmed appointment.', review: 'Check your request before sending. No charge to submit; Bravo confirms separately.' };
export default function BookingProgress({ current = 'dog', onChange, trainerReady = false, visitReady = false, busy = false }) {
  return <><nav className="guided-booking-steps" aria-label="First visit steps">{BOOKING_STAGES.map(({id,label},index) =>
    <button key={id} type="button" aria-current={current === id ? 'step' : undefined}
      disabled={busy || !onChange || (id === 'visit' && !trainerReady) || (id === 'review' && !visitReady)}
      onClick={() => onChange?.(id)}>{index + 1}. {label}</button>
  )}</nav><p className="guided-step-help" role="status">{STAGE_HELP[current]}</p></>;
}
