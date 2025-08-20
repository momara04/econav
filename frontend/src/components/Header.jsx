import { useState, useEffect } from "react";
import { MdEco } from "react-icons/md";

export default function Header({ onAbout, onFAQ, onContact, onStart }) {
  const [open, setOpen] = useState(false);

  const NavLink = ({ children, onClick }) => (
    <button
      onClick={() => {
        onClick();
        setOpen(false);
      }}
      className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-[#3F5E4A] hover:bg-gray-100 rounded-lg transition cursor-pointer"
    >
      {children}
    </button>
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-white/80 shadow-sm">

      <div className="w-full h-16 flex items-center justify-between px-4 sm:px-6 lg:px-10">
        <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-1.5 text-2xl font-extrabold tracking-tight text-gray-900 cursor-pointer"
            aria-label="EcoNav home"
        >
            <MdEco
                className="text-[#3F5E4A] text-2xl -translate-y-[-1.2px] -mr-1"
                aria-hidden="true"
            />
            <span className="leading-none">
                Eco<span className="text-[#3F5E4A]">Nav</span>
            </span>
        </button>


        {/* desktop */}
        <nav className="hidden md:flex items-center gap-1">
          <NavLink onClick={onAbout}>About</NavLink>
          <NavLink onClick={onFAQ}>FAQ</NavLink>
          <NavLink onClick={onContact}>Contact</NavLink>
          <button
            onClick={onStart}
            className="ml-2 px-4 py-2 rounded-lg bg-[#3F5E4A] text-white hover:bg-[#3d6754] transition cursor-pointer"
          >
            Start Now
          </button>
        </nav>

        {/* mobile */}
        <button
          className="md:hidden inline-flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 cursor-pointer"
          aria-label="Open menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="i-lucide-menu w-6 h-6">☰</span>
        </button>
      </div>

      {/* mobile dropdown */}
      {open && (
        <div className="md:hidden border-t bg-white/90 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 py-2 flex flex-col">
            <NavLink onClick={onAbout}>About</NavLink>
            <NavLink onClick={onFAQ}>FAQ</NavLink>
            <NavLink onClick={onContact}>Contact</NavLink>
            <button
              onClick={() => { onStart(); setOpen(false); }}
              className="mt-2 px-4 py-2 rounded-lg bg-[#3F5E4A] text-white text-left"
            >
              Start Now
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
