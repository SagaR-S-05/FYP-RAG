import { createContext, useContext, useEffect, useState } from "react";

const SidebarContext = createContext(null);
const SIDEBAR_COOKIE = "sidebar-collapsed";

function getCookieBoolean(name) {
  if (typeof document === "undefined") return false;
  const match = document.cookie.match(new RegExp(`${name}=(true|false)`));
  if (!match) return false;
  return match[1] === "true";
}

function setCookieBoolean(name, value) {
  if (typeof document === "undefined") return;
  const encoded = `${name}=${value ? "true" : "false"}; path=/; max-age=31536000`;
  document.cookie = encoded;
}

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const fromCookie = getCookieBoolean(SIDEBAR_COOKIE);
    setCollapsed(fromCookie);
  }, []);

  useEffect(() => {
    setCookieBoolean(SIDEBAR_COOKIE, collapsed);
  }, [collapsed]);

  const toggleSidebar = () => {
    setCollapsed((prev) => !prev);
  };

  return (
    <SidebarContext.Provider value={{ collapsed, toggleSidebar }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return ctx;
}

export function Sidebar({ children }) {
  const { collapsed } = useSidebar();

  return (
    <aside
      className={
        collapsed
          ? "sidebarRoot bg-sidebar text-sidebar-foreground sidebarCollapsed"
          : "sidebarRoot bg-sidebar text-sidebar-foreground"
      }
    >
      {children}
    </aside>
  );
}

export function SidebarInset({ children }) {
  return <div className="sidebarInset">{children}</div>;
}

export function SidebarTrigger(props) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className="sidebarTrigger bg-sidebar-accent text-sidebar-accent-foreground"
      {...props}
    >
      ☰
    </button>
  );
}

