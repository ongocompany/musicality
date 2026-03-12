import { redirect } from 'next/navigation';

/** Email signup removed — social login only. Redirect to /login. */
export default function SignupPage() {
  redirect('/login');
}
