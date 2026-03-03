
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/forge', label: 'Forge', icon: 'ri-hammer-fill', sub: 'Create' },
  { path: '/vault', label: 'Vault', icon: 'ri-archive-fill', sub: 'Collect' },
  { path: '/duel', label: 'Duel', icon: 'ri-sword-fill', sub: 'Battle' },
];

export default function Navigation() {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[rgba(10,10,12,0.95)] backdrop-blur-xl border-b border-amber-400/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)]'
          : 'bg-transparent'
      }`}
    >
      {/* Top accent line */}
      <div className="h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent"></div>

      <div className="px-8 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/forge" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 flex items-center justify-center">
              <div className="absolute inset-0 rounded-xl bg-amber-400/10 group-hover:bg-amber-400/20 transition-all duration-300 border border-amber-400/20"></div>
              <img
                src="https://public.readdy.ai/ai/img_res/e5d77e51-3202-48f2-87a3-2a328d10503b.png"
                alt="Hero Forge"
                className="w-7 h-7 object-contain relative z-10 transition-transform duration-300 group-hover:scale-110"
              />
            </div>
            <div>
              <div className="text-lg font-display font-bold text-amber-400 leading-none tracking-wider" style={{ textShadow: '0 0 15px rgba(234,179,8,0.5)' }}>
                HERO FORGE
              </div>
              <div className="text-[10px] text-gray-500 font-mono tracking-widest mt-0.5">FORGE YOUR LEGEND</div>
            </div>
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-1.5">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    relative flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 whitespace-nowrap cursor-pointer group
                    ${isActive
                      ? 'bg-amber-400 text-[#0a0a0c] shadow-[0_0_20px_rgba(234,179,8,0.4)]'
                      : 'text-gray-400 hover:text-gray-100 hover:bg-white/[0.05]'
                    }
                  `}
                >
                  <div className={`w-5 h-5 flex items-center justify-center`}>
                    <i className={`${item.icon} text-base`}></i>
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="text-sm font-bold">{item.label}</span>
                  </div>
                  {isActive && (
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-white/20 to-transparent pointer-events-none"></div>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-gray-500 font-mono">SEASON I</div>
              <div className="text-xs text-amber-400/70 font-mono">ARCANE EPOCH</div>
            </div>
            <div className="relative cursor-pointer group">
              <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center hover:border-amber-400/40 hover:bg-amber-400/10 transition-all duration-200">
                <i className="ri-user-3-line text-gray-400 group-hover:text-amber-400 transition-colors"></i>
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a0a0c]"></div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
