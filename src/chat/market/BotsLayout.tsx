import { Link, NavLink } from 'react-router-dom';
import { ArrowLeft, BookOpen, Code2, Store } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import Logo from '../../components/Logo';

/** Standalone shell for the bot marketplace & developer portal — none of the chat chrome. */
export default function BotsLayout({ children }: { children: React.ReactNode }) {
  const tab = ({ isActive }: { isActive: boolean }) => cn('inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition', isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground');
  return (
    <div className="flex h-[100dvh] w-full flex-1 flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-6">
        <Link to="/app/bots" className="mr-2 flex items-center gap-2 font-semibold"><Logo className="h-6 w-6" /><span className="hidden sm:inline">Chatting Bots</span></Link>
        <nav className="flex items-center gap-1">
          <NavLink end to="/app/bots" className={tab}><Store className="h-4 w-4" /><span className="hidden sm:inline">Marketplace</span></NavLink>
          <NavLink to="/app/bots/dev" className={tab}><Code2 className="h-4 w-4" /><span className="hidden sm:inline">Developer portal</span></NavLink>
          <Link to="/developers" className={tab({ isActive: false })}><BookOpen className="h-4 w-4" /><span className="hidden sm:inline">API docs</span></Link>
        </nav>
        <Link to="/app" className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm"><ArrowLeft className="h-4 w-4" />Back to Chatting</Link>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
