import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function Navigation() {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { path: '/forge', label: 'FORGE' },
    { path: '/vault', label: 'VAULT' },
    { path: '/duel', label: 'DUEL' },
  ];

  return (
    <nav 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'bg-glass-matte border-b border-hairline border-stone-800/30' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-8 py-6">
        <div className="flex items-center justify-between">
          {/* Logo - 超大字间距 */}
          <Link 
            to="/" 
            className="font-display text-xl title-spaced text-gold-200 hover:text-gold-100 transition-colors duration-300"
          >
            HERO FORGE
          </Link>

          {/* 导航项 - 极简细线下划线 */}
          <div className="flex items-center gap-12">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="relative group"
                >
                  <span className={`font-body text-sm tracking-extra-wide transition-colors duration-300 ${
                    isActive ? 'text-gold-200' : 'text-stone-400 hover:text-stone-200'
                  }`}>
                    {item.label}
                  </span>
                  {/* 细线下划线 */}
                  <span 
                    className={`absolute -bottom-1 left-0 h-[0.5px] bg-gold-300 transition-all duration-300 ${
                      isActive ? 'w-full' : 'w-0 group-hover:w-full'
                    }`}
                  />
                </Link>
              );
            })}
          </div>

          {/* 右侧状态指示 - 极简 */}
          <div className="flex items-center gap-3">
            <div className="w-1 h-1 rounded-full bg-stone-600" />
            <span className="font-mono text-xs text-stone-500 tracking-wider">OFFLINE</span>
          </div>
        </div>
      </div>
    </nav>
  );
}