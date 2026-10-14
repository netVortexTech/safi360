import { BookingStepper } from '../booking/BookingStepper';

/** /:slug/book and /:slug/widget share the stepper; the layout decides the chrome. */
export default function BookPage() {
  return <BookingStepper />;
}
