import { redirect } from 'next/navigation';

/**
 * Root page — server component redirect to the new-conversation shell.
 * All UI lives under /c/* routes (see app/c/).
 */
export default function RootPage(): never {
  redirect('/c/new');
}
