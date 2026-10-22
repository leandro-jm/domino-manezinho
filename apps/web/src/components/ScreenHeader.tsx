import { Link } from 'wouter';

export function ScreenHeader({ title, back = '/' }: { title: string; back?: string }) {
  return (
    <header className="screen-header">
      <Link href={back} className="btn icon" aria-label="Voltar">
        ←
      </Link>
      <h1>{title}</h1>
    </header>
  );
}
